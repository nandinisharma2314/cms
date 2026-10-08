"""CSV imports for the location hierarchy and for end users.

Each row is validated completely and written inside its own savepoint, so a
bad row is reported and skipped without leaving partial data behind or
stopping the rest of the file. Row numbers are spreadsheet line numbers (the
header is row 1).

Problems are reported per row as *errors* (the row is not imported) or
*warnings* (imported, but worth a look: likely duplicates, odd values).
`run_import` wraps both importers: it supports a validate-only dry run (same
checks, everything rolled back) and records every upload in import history.
"""
import csv
import difflib
import io
import json
import re
from dataclasses import dataclass, field
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import config
from models import EndUser, ImportBatch, ImportIssue, Location, max_length
from services import audit_service, notification_service, token_service
from services.access_service import AccessContext
from services.location_service import create_location, find_child, is_usable, location_types_by_depth
from services.phone_service import phone_format
from utils.security import normalize_email, utcnow

END_USER_COLUMNS = ["user_id", "name", "mobile", "email", "aadhar", "pan_card"]
# Every column the end-user import reads besides the location levels ("external_id" is accepted for "user_id").
END_USER_KEY_COLUMNS = (*END_USER_COLUMNS, "external_id")
LOOKUP_CHUNK = 500
WRITE_BATCH = 500  # end-user rows written per savepoint


@dataclass
class Issue:
    row: int
    severity: str  # "error" | "warning"
    message: str
    data: dict[str, str] | None = None


@dataclass
class ImportResult:
    headers: list[str] = field(default_factory=list)
    total_rows: int = 0
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    issues: list[Issue] = field(default_factory=list)

    def fail(self, row: int, message: str, data: dict | None = None) -> None:
        self.issues.append(Issue(row, "error", message, data))

    def warn(self, row: int, message: str, data: dict | None = None) -> None:
        self.issues.append(Issue(row, "warning", message, data))

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "warning"]

    def as_dict(self, batch: ImportBatch) -> dict:
        limit = config.IMPORT_RESULT_ISSUE_LIMIT
        return {
            "batch_id": batch.id,
            "dry_run": batch.dry_run,
            "total_rows": self.total_rows,
            "created": self.created,
            "updated": self.updated,
            "unchanged": self.unchanged,
            "failed": len(self.errors),
            "warnings": len(self.warnings),
            "errors": [{"row": i.row, "message": i.message} for i in self.errors[:limit]],
            "warning_list": [{"row": i.row, "message": i.message} for i in self.warnings[:limit]],
            "truncated": len(self.errors) > limit or len(self.warnings) > limit,
        }


def clean_text(value: str) -> str:
    """Trims and collapses internal whitespace ("North   Wing" -> "North Wing")."""
    return " ".join(value.split())


def loose_key(name: str) -> str:
    """Case, space and punctuation-insensitive form ("Block B" == "block-b")."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _normalize_header(header: str) -> str:
    return header.strip().lower().replace(" ", "_")


def read_upload(upload_file) -> bytes:
    """Reads at most MAX_CSV_UPLOAD_BYTES (+1 to detect larger files)."""
    content = upload_file.read(config.MAX_CSV_UPLOAD_BYTES + 1)
    if len(content) > config.MAX_CSV_UPLOAD_BYTES:
        limit = config.MAX_CSV_UPLOAD_BYTES
        size = f"{limit / (1024 * 1024):g} MB" if limit >= 1024 * 1024 else f"{limit / 1024:g} KB"
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"CSV file is larger than {size}")
    return content


def read_csv(content: bytes) -> tuple[list[str], list[tuple[int, dict[str, str]]]]:
    """Headers and (row_number, values) pairs, skipping completely blank rows."""
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "CSV must be UTF-8 encoded (save it as 'CSV UTF-8')") from None
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "CSV file is empty")
    headers = [_normalize_header(h) for h in reader.fieldnames]
    duplicates = sorted({h for h in headers if headers.count(h) > 1})
    if duplicates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"CSV has duplicate columns: {', '.join(duplicates)}")
    rows = []
    for index, raw in enumerate(reader, start=2):
        values = {_normalize_header(k): clean_text(v or "") for k, v in raw.items() if k is not None}
        if any(values.values()):
            rows.append((index, values))
        if len(rows) > config.MAX_IMPORT_ROWS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                f"CSV has more than {config.MAX_IMPORT_ROWS} rows; split it up")
    return headers, rows


def _flag_unknown_columns(result: ImportResult, headers: list[str], known: list[str]) -> None:
    unknown = [h for h in headers if h and h not in known]
    if unknown:
        result.warn(1, f"Column(s) not used and ignored: {', '.join(unknown)}")


class _LocationResolver:
    """Walks level columns (one per location level) down the tree with a cache.
    Names match case-insensitively; spelling that differs only in spaces or
    punctuation also matches the existing location (with a warning)."""

    def __init__(self, db: Session):
        self.db = db
        self.level_keys = [t.key for t in location_types_by_depth(db)]
        self._cache: dict[tuple[int | None, str], Location | None] = {}
        self._siblings: dict[int | None, list[Location]] = {}

    def levels(self, row: dict[str, str]) -> list[str]:
        """Non-empty level values from the top; raises ValueError on a gap."""
        values = [row.get(key, "") for key in self.level_keys]
        last = max((i for i, v in enumerate(values) if v), default=-1)
        for i in range(last + 1):
            if not values[i]:
                raise ValueError(f"'{self.level_keys[i]}' is empty but a lower level is filled in")
        return values[: last + 1]

    def siblings(self, parent: Location | None) -> list[Location]:
        key = parent.id if parent is not None else None
        if key not in self._siblings:
            parent_filter = Location.parent_id.is_(None) if parent is None else Location.parent_id == parent.id
            self._siblings[key] = self.db.query(Location).filter(parent_filter).all()
        return self._siblings[key]

    def lookup(self, parent: Location | None, name: str) -> tuple[Location | None, str | None]:
        """(location, note): note is set when matched loosely."""
        key = (parent.id if parent is not None else None, name.lower())
        if key not in self._cache:
            self._cache[key] = find_child(self.db, parent, name)
        found = self._cache[key]
        if found is not None:
            return found, None
        loose = next((s for s in self.siblings(parent) if loose_key(s.name) == loose_key(name)), None)
        if loose is not None:
            return loose, f"'{name}' matched existing '{loose.name}'"
        return None, None

    def similar(self, parent: Location | None, name: str) -> str | None:
        best = max(
            self.siblings(parent),
            key=lambda s: difflib.SequenceMatcher(None, s.name.lower(), name.lower()).ratio(),
            default=None,
        )
        ratio = difflib.SequenceMatcher(None, best.name.lower(), name.lower()).ratio() if best else 0
        return best.name if best is not None and ratio >= config.IMPORT_SIMILAR_NAME_RATIO else None

    def remember(self, parent: Location | None, location: Location) -> None:
        self._cache[(parent.id if parent is not None else None, location.name.lower())] = location
        self.siblings(parent).append(location)

    def forget(self) -> None:
        """Drops cached nodes after a rolled-back row."""
        self._cache.clear()
        self._siblings.clear()


def import_locations(db: Session, ctx: AccessContext, content: bytes) -> ImportResult:
    headers, rows = read_csv(content)
    resolver = _LocationResolver(db)
    if not resolver.level_keys:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Define the location levels before importing locations")
    if resolver.level_keys[0] not in headers:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"CSV must have the columns: {', '.join(resolver.level_keys)}")

    result = ImportResult(headers=headers, total_rows=len(rows))
    _flag_unknown_columns(result, headers, resolver.level_keys)
    for row_number, row in rows:
        try:
            names = resolver.levels(row)
        except ValueError as exc:
            result.fail(row_number, str(exc), row)
            continue
        limit = max_length(Location.name)
        too_long = next((n for n in names if len(n) > limit), None)
        if too_long:
            result.fail(row_number, f"'{too_long[:40]}...' is longer than {limit} characters", row)
            continue

        # Find where the existing tree ends; everything below it is new.
        parent: Location | None = None
        first_new = len(names)
        notes = []
        inactive = None
        for depth, name in enumerate(names):
            node, note = resolver.lookup(parent, name)
            if node is None:
                first_new = depth
                break
            if not node.is_active:
                inactive = node
                break
            if note:
                notes.append(note)
            parent = node
        if inactive is not None:
            result.fail(row_number, f"'{inactive.name}' is inactive; reactivate it before importing under it", row)
            continue

        if first_new < len(names) and not ctx.covers_location(parent.path if parent is not None else None):
            where = f"under '{parent.name}'" if parent is not None else "at the top level"
            result.fail(row_number, f"You cannot add locations {where}", row)
            continue

        if first_new == len(names):
            for note in notes:
                result.warn(row_number, note, row)
            result.unchanged += 1
            continue

        row_warnings = list(notes)
        savepoint = db.begin_nested()
        try:
            for name in names[first_new:]:
                lookalike = resolver.similar(parent, name)
                if lookalike:
                    where = f" under '{parent.name}'" if parent is not None else ""
                    row_warnings.append(f"New location '{name}' looks like existing '{lookalike}'{where}; check the spelling")
                node = create_location(db, name, parent)
                resolver.remember(parent, node)
                parent = node
            savepoint.commit()
        except (HTTPException, IntegrityError) as exc:
            savepoint.rollback()
            resolver.forget()
            message = exc.detail if isinstance(exc, HTTPException) else "Conflicts with an existing location"
            result.fail(row_number, str(message), row)
            continue
        for note in row_warnings:
            result.warn(row_number, note, row)
        result.created += len(names) - first_new

    return result


@dataclass
class _EndUserRow:
    number: int
    data: dict[str, str]
    external_id: str | None
    name: str
    mobile: str
    email: str
    aadhar: str
    pan_card: str
    level_names: list[str]


def _existing_end_users(db: Session, parsed: list[_EndUserRow]) -> list[EndUser]:
    external_ids = sorted({p.external_id for p in parsed if p.external_id})
    mobiles = sorted({p.mobile for p in parsed})
    emails = sorted({p.email for p in parsed})
    found: dict[int, EndUser] = {}
    for column, values in ((EndUser.external_id, external_ids), (EndUser.mobile, mobiles), (EndUser.email, emails)):
        for start in range(0, len(values), LOOKUP_CHUNK):
            for end_user in db.query(EndUser).filter(column.in_(values[start:start + LOOKUP_CHUNK])).all():
                found[end_user.id] = end_user
    return list(found.values())


def import_end_users(db: Session, ctx: AccessContext, content: bytes) -> ImportResult:
    headers, rows = read_csv(content)
    missing = [c for c in ("name", "mobile", "email", "aadhar", "pan_card") if c not in headers]
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"CSV is missing required column(s): {', '.join(missing)}")
    resolver = _LocationResolver(db)
    fmt = phone_format(db)

    result = ImportResult(headers=headers, total_rows=len(rows))
    _flag_unknown_columns(result, headers, [*END_USER_KEY_COLUMNS, *resolver.level_keys])

    parsed: list[_EndUserRow] = []
    for row_number, row in rows:
        external_id = (row.get("user_id") or row.get("external_id") or "").strip() or None
        name = row.get("name", "")
        if not name:
            result.fail(row_number, "Name is required", row)
            continue
        name_limit, id_limit = max_length(EndUser.name), max_length(EndUser.external_id)
        if len(name) > name_limit or (external_id and len(external_id) > id_limit):
            result.fail(row_number, f"Name (max {name_limit}) or user_id (max {id_limit}) is too long", row)
            continue
        mobile = fmt.normalize(row.get("mobile"))
        if mobile is None:
            result.fail(row_number, f"Mobile must be {fmt.describe()}", row)
            continue
        email = normalize_email(row.get("email"))
        if email is None:
            result.fail(row_number, "Email is not valid", row)
            continue
        aadhar = (row.get("aadhar") or "").strip()
        if not aadhar:
            result.fail(row_number, "Aadhar is required", row)
            continue
        pan_card = (row.get("pan_card") or "").strip()
        if not pan_card:
            result.fail(row_number, "PAN Card is required", row)
            continue
        try:
            level_names = resolver.levels(row)
        except ValueError as exc:
            result.fail(row_number, str(exc), row)
            continue
        parsed.append(_EndUserRow(row_number, row, external_id, name, mobile, email, aadhar, pan_card, level_names))

    # Everything that already exists for these identifiers, in a few queries.
    by_external: dict[str, EndUser] = {}
    by_pair: dict[tuple[str, str], EndUser] = {}
    by_mobile: dict[str, list[EndUser]] = {}
    by_email: dict[str, list[EndUser]] = {}

    def index(end_user: EndUser) -> None:
        if end_user.external_id:
            by_external[end_user.external_id] = end_user
        by_pair[(end_user.mobile, end_user.email)] = end_user
        by_mobile.setdefault(end_user.mobile, []).append(end_user)
        by_email.setdefault(end_user.email, []).append(end_user)

    def unindex(end_user: EndUser) -> None:
        if end_user.external_id and by_external.get(end_user.external_id) is end_user:
            del by_external[end_user.external_id]
        if by_pair.get((end_user.mobile, end_user.email)) is end_user:
            del by_pair[(end_user.mobile, end_user.email)]
        for mapping, key in ((by_mobile, end_user.mobile), (by_email, end_user.email)):
            if end_user in mapping.get(key, []):
                mapping[key].remove(end_user)

    def purge(end_user: EndUser) -> None:
        """Drops every index entry for `end_user`, whatever values it was indexed under."""
        for mapping in (by_external, by_pair):
            for key in [k for k, v in mapping.items() if v is end_user]:
                del mapping[key]
        for mapping in (by_mobile, by_email):
            for people in mapping.values():
                if end_user in people:
                    people.remove(end_user)

    for end_user in _existing_end_users(db, parsed):
        index(end_user)

    seen_external: dict[str, int] = {}
    seen_pairs: dict[tuple[str, str], int] = {}
    seen_mobiles: dict[str, tuple[str, int]] = {}
    usable: dict[int, bool] = {}

    def apply(p: _EndUserRow) -> tuple[str, list[str], EndUser | None] | None:
        """Checks one row against the file so far and what exists, and applies it
        to the session without flushing. Returns (outcome, warnings, the end user
        it wrote to), or None when the row failed (the failure is recorded)."""
        row = p.data
        if p.external_id and p.external_id in seen_external:
            result.fail(p.number, f"Duplicate user_id {p.external_id} (also on row {seen_external[p.external_id]})", row)
            return None
        if (p.mobile, p.email) in seen_pairs:
            result.fail(p.number, f"Duplicate mobile + email (also on row {seen_pairs[(p.mobile, p.email)]})", row)
            return None

        location: Location | None = None
        location_notes = []
        for level_name in p.level_names:
            location, note = resolver.lookup(location, level_name)
            if location is None:
                break
            if note:
                location_notes.append(note)
        if p.level_names and location is None:
            result.fail(p.number, f"Location '{' > '.join(p.level_names)}' not found. Import it under Locations first.", row)
            return None
        if location is not None:
            if location.id not in usable:
                usable[location.id] = is_usable(db, location)
            if not usable[location.id]:
                result.fail(p.number, f"Location '{' > '.join(p.level_names)}' is inactive", row)
                return None
        if not ctx.covers_location(location.path if location is not None else None):
            result.fail(p.number, "Location is outside your scope", row)
            return None

        existing_by_external = by_external.get(p.external_id) if p.external_id else None
        existing_by_pair = by_pair.get((p.mobile, p.email))
        if existing_by_external is not None and existing_by_pair is not None and existing_by_pair is not existing_by_external:
            result.fail(p.number, "Mobile + email already belong to another end user "
                                  f"({existing_by_pair.external_id or existing_by_pair.name})", row)
            return None
        if (existing_by_external is None and existing_by_pair is not None and p.external_id
                and existing_by_pair.external_id not in (None, p.external_id)):
            result.fail(p.number, f"Mobile + email already belong to user_id {existing_by_pair.external_id}", row)
            return None
        existing = existing_by_external or existing_by_pair
        if existing is not None and not ctx.covers_location(existing.location.path if existing.location else None):
            result.fail(p.number, "Existing end user is outside your scope", row)
            return None

        warnings = list(location_notes)
        if fmt.looks_unusual(p.mobile):
            warnings.append(f"Mobile {p.mobile} does not start with an expected digit ({fmt.expected_prefixes})")
        if p.mobile in seen_mobiles and seen_mobiles[p.mobile][0] != p.email:
            warnings.append(f"Same mobile as row {seen_mobiles[p.mobile][1]} with a different email")
        for other in by_mobile.get(p.mobile, []):
            if other is not existing and other.email != p.email:
                warnings.append(f"Mobile already registered to {other.name} with email {other.email}; "
                                "possibly outdated data (two separate end users now)")
                break
        for other in by_email.get(p.email, []):
            if other is not existing and other.mobile != p.mobile:
                warnings.append(f"Email already registered to {other.name} with mobile {other.mobile}; "
                                "possibly outdated data (two separate end users now)")
                break

        target = existing
        if existing is not None:
            new_values = {
                "external_id": p.external_id or existing.external_id,
                "name": p.name,
                "mobile": p.mobile,
                "email": p.email,
                "aadhar": p.aadhar,
                "pan_card": p.pan_card,
                "location_id": location.id if location is not None else existing.location_id,
            }
            if all(getattr(existing, k) == v for k, v in new_values.items()):
                outcome = "unchanged"
            else:
                changed = [k for k in ("mobile", "email") if getattr(existing, k) != new_values[k]]
                unindex(existing)
                for key, value in new_values.items():
                    setattr(existing, key, value)
                index(existing)
                if changed:
                    # Their sign-in identity changed: sign them out and tell them (as a manual edit does).
                    token_service.end_all_sessions(db, existing)
                    label = " and ".join(changed)
                    notification_service.notify(db, [existing], "account.contact_changed",
                                                f"Your registered {label} was updated",
                                                f"The support team changed your registered {label}. "
                                                "If you did not ask for this, contact them.")
                outcome = "updated"
        else:
            target = EndUser(
                external_id=p.external_id, name=p.name, mobile=p.mobile, email=p.email,
                aadhar=p.aadhar, pan_card=p.pan_card,
                location_id=location.id if location is not None else None,
            )
            db.add(target)
            index(target)
            outcome = "created"

        if p.external_id:
            seen_external[p.external_id] = p.number
        seen_pairs[(p.mobile, p.email)] = p.number
        seen_mobiles.setdefault(p.mobile, (p.email, p.number))
        return outcome, warnings, target

    def forget_batch(batch: list[_EndUserRow]) -> None:
        """Back to the state before a rolled-back batch: the indexes from what is stored
        (earlier batches included), and the file's rows before this batch."""
        for mapping in (by_external, by_pair, by_mobile, by_email):
            mapping.clear()
        for end_user in _existing_end_users(db, parsed):
            index(end_user)
        numbers = {p.number for p in batch}
        for mapping in (seen_external, seen_pairs):
            for key in [k for k, number in mapping.items() if number in numbers]:
                del mapping[key]
        for key in [k for k, (_, number) in seen_mobiles.items() if number in numbers]:
            del seen_mobiles[key]

    def record(done: list[tuple[_EndUserRow, tuple[str, list[str], EndUser | None]]]) -> None:
        for p, (outcome, warnings, _) in done:
            setattr(result, outcome, getattr(result, outcome) + 1)
            for warning in warnings:
                result.warn(p.number, warning, p.data)

    # Rows are written in batches, one savepoint each (a savepoint per row costs three round trips).
    # Conflicts the checks above can't see (someone else saving at the same moment) roll the batch
    # back, and it is written again one row at a time so only the conflicting rows fail.
    for start in range(0, len(parsed), WRITE_BATCH):
        batch = parsed[start:start + WRITE_BATCH]
        issues_before = len(result.issues)
        savepoint = db.begin_nested()
        done = [(p, applied) for p in batch if (applied := apply(p)) is not None]
        try:
            savepoint.commit()
        except IntegrityError:
            savepoint.rollback()  # new rows leave the session; changed ones reload their stored values
            forget_batch(batch)
            del result.issues[issues_before:]
            done = []
            for p in batch:
                row_savepoint = db.begin_nested()
                applied = apply(p)
                try:
                    row_savepoint.commit()
                except IntegrityError:
                    row_savepoint.rollback()
                    if applied is not None and applied[2] is not None:
                        purge(applied[2])
                        if applied[0] != "created":
                            index(applied[2])  # under its stored values again
                    result.fail(p.number, "Conflicts with an existing end user (user_id or mobile + email already taken)",
                                p.data)
                    continue
                if applied is not None:
                    done.append((p, applied))
        record(done)

    return result


IMPORTERS = {"locations": import_locations, "end_users": import_end_users}
KIND_LABELS = {"locations": "locations", "end_users": "end users"}
AUDIT_ACTIONS = {"locations": "location.import", "end_users": "end_user.import"}


def run_import(
    db: Session, ctx: AccessContext, kind: str, filename: str | None, content: bytes, dry_run: bool, request=None,
) -> tuple[ImportBatch, ImportResult]:
    """Runs an importer, rolls back when dry_run, and records the upload in
    import history (also when the whole file is rejected). Commits."""
    started = utcnow()
    batch = ImportBatch(kind=kind, filename=(filename or "")[:max_length(ImportBatch.filename)] or None,
                        uploaded_by_id=ctx.user.id,
                        dry_run=dry_run, started_at=started)
    label = KIND_LABELS[kind]
    try:
        result = IMPORTERS[kind](db, ctx, content)
    except HTTPException as exc:
        db.rollback()
        batch.status = "rejected"
        batch.error = str(exc.detail)[:max_length(ImportBatch.error)]
        batch.finished_at = utcnow()
        db.add(batch)
        db.flush()
        audit_service.record(
            db, actor=ctx.user, action=AUDIT_ACTIONS[kind], entity_type="import", entity_id=batch.id,
            summary=f"Rejected {label} file {filename}: {batch.error}", request=request,
        )
        db.commit()
        raise

    if dry_run:
        db.rollback()  # nothing from the file is kept
    batch.status = "validated" if dry_run else "completed"
    batch.total_rows, batch.created, batch.updated = result.total_rows, result.created, result.updated
    batch.unchanged, batch.failed, batch.warnings = result.unchanged, len(result.errors), len(result.warnings)
    batch.headers = json.dumps(result.headers)
    batch.finished_at = utcnow()
    batch.issues = [
        ImportIssue(row_number=i.row, severity=i.severity, message=i.message[:max_length(ImportIssue.message)],
                    data=json.dumps(i.data) if i.data is not None else None)
        for i in result.issues
    ]
    db.add(batch)
    db.flush()
    verb = "Validated" if dry_run else "Imported"
    audit_service.record(
        db, actor=ctx.user, action=AUDIT_ACTIONS[kind], entity_type="import", entity_id=batch.id,
        summary=f"{verb} {label} from {filename}: {result.created} new, {result.updated} updated, "
                f"{result.unchanged} unchanged, {len(result.errors)} failed, {len(result.warnings)} warnings",
        request=request,
    )
    db.commit()
    return batch, result


def prune_issue_data(db: Session, older_than_days: int) -> int:
    """Clears the copied row data of old import issues (the messages stay). Commits."""
    cutoff = utcnow() - timedelta(days=older_than_days)
    batch_ids = [b for (b,) in db.query(ImportBatch.id).filter(ImportBatch.started_at < cutoff).all()]
    cleared = 0
    for start in range(0, len(batch_ids), LOOKUP_CHUNK):
        cleared += db.query(ImportIssue).filter(
            ImportIssue.batch_id.in_(batch_ids[start:start + LOOKUP_CHUNK]), ImportIssue.data.isnot(None),
        ).update({ImportIssue.data: None}, synchronize_session=False)
    db.commit()
    return cleared

