"""CSV imports for the location hierarchy and for end users.

Each row is validated completely before anything is written for it, so a bad
row is reported and skipped without leaving partial data behind. Row numbers
are spreadsheet line numbers (the header is row 1).

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

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from config import MAX_CSV_UPLOAD_BYTES
from models import EndUser, ImportBatch, ImportIssue, Location
from services import audit_service
from services.access_service import AccessContext
from services.location_service import create_location, find_child, location_types_by_depth
from utils.security import looks_like_email, normalize_email, normalize_mobile, utcnow

MAX_IMPORT_ROWS = 50_000
END_USER_COLUMNS = ["user_id", "name", "mobile", "email"]
SIMILAR_NAME_RATIO = 0.85


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

    def as_dict(self, batch: ImportBatch | None = None, limit: int = 500) -> dict:
        return {
            "batch_id": batch.id if batch else None,
            "dry_run": batch.dry_run if batch else False,
            "total_rows": self.total_rows,
            "created": self.created,
            "updated": self.updated,
            "unchanged": self.unchanged,
            "failed": len(self.errors),
            "warnings": len(self.warnings),
            "errors": [{"row": i.row, "message": i.message} for i in self.errors[:limit]],
            "warning_list": [{"row": i.row, "message": i.message} for i in self.warnings[:limit]],
        }


def clean_text(value: str) -> str:
    """Trims and collapses internal whitespace ("Malviya   Nagar" -> "Malviya Nagar")."""
    return " ".join(value.split())


def loose_key(name: str) -> str:
    """Case, space and punctuation-insensitive form ("C Scheme" == "c-scheme")."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _normalize_header(header: str) -> str:
    return header.strip().lower().replace(" ", "_")


def read_csv(content: bytes) -> tuple[list[str], list[tuple[int, dict[str, str]]]]:
    """Headers and (row_number, values) pairs, skipping completely blank rows."""
    if len(content) > MAX_CSV_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "CSV file is too large")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "CSV must be UTF-8 encoded (save it as 'CSV UTF-8')")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "CSV file is empty")
    headers = [_normalize_header(h) for h in reader.fieldnames]
    rows = []
    for index, raw in enumerate(reader, start=2):
        values = {_normalize_header(k): clean_text(v or "") for k, v in raw.items() if k is not None}
        if any(values.values()):
            rows.append((index, values))
        if len(rows) > MAX_IMPORT_ROWS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"CSV has more than {MAX_IMPORT_ROWS} rows; split it up")
    return headers, rows


def _flag_unknown_columns(result: ImportResult, headers: list[str], known: list[str]) -> None:
    unknown = [h for h in headers if h and h not in known]
    if unknown:
        result.warn(1, f"Column(s) not used and ignored: {', '.join(unknown)}")


class _LocationResolver:
    """Walks level columns (country, state, ...) down the tree with a cache.
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
            query = self.db.query(Location)
            query = query.filter(Location.parent_id.is_(None)) if parent is None else query.filter(Location.parent_id == parent.id)
            self._siblings[key] = query.all()
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
        if best is not None and difflib.SequenceMatcher(None, best.name.lower(), name.lower()).ratio() >= SIMILAR_NAME_RATIO:
            return best.name
        return None

    def remember(self, parent: Location | None, location: Location) -> None:
        self._cache[(parent.id if parent is not None else None, location.name.lower())] = location
        self.siblings(parent).append(location)


def import_locations(db: Session, ctx: AccessContext, content: bytes) -> ImportResult:
    headers, rows = read_csv(content)
    resolver = _LocationResolver(db)
    if not resolver.level_keys or resolver.level_keys[0] not in headers:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"CSV must have the columns: {', '.join(resolver.level_keys)}",
        )

    result = ImportResult(headers=headers, total_rows=len(rows))
    _flag_unknown_columns(result, headers, resolver.level_keys)
    for row_number, row in rows:
        try:
            names = resolver.levels(row)
        except ValueError as exc:
            result.fail(row_number, str(exc), row)
            continue
        too_long = next((n for n in names if len(n) > 150), None)
        if too_long:
            result.fail(row_number, f"'{too_long[:40]}...' is longer than 150 characters", row)
            continue

        # Find where the existing tree ends; everything below it is new.
        parent: Location | None = None
        first_new = len(names)
        notes = []
        for depth, name in enumerate(names):
            node, note = resolver.lookup(parent, name)
            if node is None:
                first_new = depth
                break
            if note:
                notes.append(note)
            parent = node

        if first_new < len(names) and not ctx.covers_location(parent.path if parent is not None else None):
            where = f"under '{parent.name}'" if parent is not None else "at the top level"
            result.fail(row_number, f"You cannot add locations {where}", row)
            continue

        for note in notes:
            result.warn(row_number, note, row)
        if first_new == len(names):
            result.unchanged += 1
            continue

        for name in names[first_new:]:
            lookalike = resolver.similar(parent, name)
            if lookalike:
                where = f" under '{parent.name}'" if parent is not None else ""
                result.warn(row_number, f"New location '{name}' looks like existing '{lookalike}'{where}; check the spelling", row)
            node = create_location(db, name, parent)
            resolver.remember(parent, node)
            parent = node
        result.created += len(names) - first_new

    return result


def import_end_users(db: Session, ctx: AccessContext, content: bytes) -> ImportResult:
    headers, rows = read_csv(content)
    missing = [c for c in ("name", "mobile", "email") if c not in headers]
    if missing:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"CSV is missing required column(s): {', '.join(missing)}",
        )
    resolver = _LocationResolver(db)

    result = ImportResult(headers=headers, total_rows=len(rows))
    _flag_unknown_columns(result, headers, END_USER_COLUMNS + ["external_id"] + resolver.level_keys)
    seen_external: dict[str, int] = {}
    seen_pairs: dict[tuple[str, str], int] = {}
    seen_mobiles: dict[str, tuple[str, int]] = {}

    for row_number, row in rows:
        external_id = (row.get("user_id") or row.get("external_id") or "").strip() or None
        name = row.get("name", "")
        mobile = normalize_mobile(row.get("mobile"))
        email = normalize_email(row.get("email"))

        if not name:
            result.fail(row_number, "Name is required", row)
            continue
        if len(name) > 150 or (external_id and len(external_id) > 50):
            result.fail(row_number, "Name or user_id is too long", row)
            continue
        if not mobile or len(mobile) != 10:
            result.fail(row_number, "Mobile must be a 10-digit number", row)
            continue
        if not email or not looks_like_email(email) or len(email) > 120:
            result.fail(row_number, "Email is not valid", row)
            continue

        if external_id and external_id in seen_external:
            result.fail(row_number, f"Duplicate user_id {external_id} (also on row {seen_external[external_id]})", row)
            continue
        if (mobile, email) in seen_pairs:
            result.fail(row_number, f"Duplicate mobile + email (also on row {seen_pairs[(mobile, email)]})", row)
            continue

        try:
            names = resolver.levels(row)
        except ValueError as exc:
            result.fail(row_number, str(exc), row)
            continue
        location: Location | None = None
        location_notes = []
        for level_name in names:
            location, note = resolver.lookup(location, level_name)
            if location is None:
                break
            if note:
                location_notes.append(note)
        if names and location is None:
            result.fail(row_number, f"Location '{' > '.join(names)}' not found. Import it under Locations first.", row)
            continue
        location_path = location.path if location is not None else None
        if not ctx.covers_location(location_path):
            result.fail(row_number, "Location is outside your scope", row)
            continue

        by_external = (
            db.query(EndUser).filter(EndUser.external_id == external_id).first() if external_id else None
        )
        by_pair = db.query(EndUser).filter(EndUser.mobile == mobile, EndUser.email == email).first()
        if by_external is not None and by_pair is not None and by_pair.id != by_external.id:
            result.fail(row_number, f"Mobile + email already belong to another end user ({by_pair.external_id or by_pair.name})", row)
            continue
        if by_external is None and by_pair is not None and external_id and by_pair.external_id not in (None, external_id):
            result.fail(row_number, f"Mobile + email already belong to user_id {by_pair.external_id}", row)
            continue
        existing = by_external or by_pair
        if existing is not None and not ctx.covers_location(existing.location.path if existing.location else None):
            result.fail(row_number, "Existing end user is outside your scope", row)
            continue

        # Imported, but worth a second look.
        for note in location_notes:
            result.warn(row_number, note, row)
        if mobile[0] not in "6789":
            result.warn(row_number, f"Mobile {mobile} does not look like an Indian mobile number", row)
        if mobile in seen_mobiles and seen_mobiles[mobile][0] != email:
            result.warn(row_number, f"Same mobile as row {seen_mobiles[mobile][1]} with a different email", row)
        others = db.query(EndUser).filter(
            (EndUser.mobile == mobile) | (EndUser.email == email),
            EndUser.id != (existing.id if existing is not None else -1),
        ).limit(3).all()
        for other in others:
            if other.mobile == mobile and other.email != email:
                result.warn(row_number, f"Mobile already registered to {other.name} with email {other.email}; "
                                        "possibly outdated data (two separate end users now)", row)
            elif other.email == email and other.mobile != mobile:
                result.warn(row_number, f"Email already registered to {other.name} with mobile {other.mobile}; "
                                        "possibly outdated data (two separate end users now)", row)

        if existing is not None:
            new_values = {
                "external_id": external_id or existing.external_id,
                "name": name,
                "mobile": mobile,
                "email": email,
                "location_id": location.id if location is not None else existing.location_id,
            }
            if all(getattr(existing, k) == v for k, v in new_values.items()):
                result.unchanged += 1
            else:
                for key, value in new_values.items():
                    setattr(existing, key, value)
                result.updated += 1
        else:
            db.add(EndUser(
                external_id=external_id,
                name=name,
                mobile=mobile,
                email=email,
                location_id=location.id if location is not None else None,
            ))
            result.created += 1

        if external_id:
            seen_external[external_id] = row_number
        seen_pairs[(mobile, email)] = row_number
        seen_mobiles.setdefault(mobile, (email, row_number))
        db.flush()

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
    batch = ImportBatch(kind=kind, filename=(filename or "")[:255] or None, uploaded_by_id=ctx.user.id,
                        dry_run=dry_run, started_at=started)
    label = KIND_LABELS[kind]
    try:
        result = IMPORTERS[kind](db, ctx, content)
    except HTTPException as exc:
        db.rollback()
        batch.status = "rejected"
        batch.error = str(exc.detail)[:500]
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
        ImportIssue(row_number=i.row, severity=i.severity, message=i.message[:500],
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
