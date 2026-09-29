from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from config import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from models import EndUser, Location, max_length
from services import audit_service, notification_service, token_service
from services.access_service import AccessContext
from services.import_service import read_upload, run_import
from services.location_service import location_types_by_depth, path_names, require_usable, serialize_location
from services.phone_service import phone_format
from utils.auth_middleware import require_permission
from utils.csv_export import csv_response
from utils.security import normalize_email
from utils.search import text_match
from utils.text import single_line

router = APIRouter()


class CreateEndUserRequest(BaseModel):
    external_id: str | None = None
    name: str
    mobile: str
    email: str
    location_id: int | None = None


class UpdateEndUserRequest(BaseModel):
    external_id: str | None = None
    name: str | None = None
    mobile: str | None = None
    email: str | None = None
    location_id: int | None = None
    clear_location: bool = False
    is_active: bool | None = None


def serialize_end_users(db: Session, end_users: list[EndUser]) -> list[dict]:
    names = path_names(db, [e.location for e in end_users])
    return [
        {
            "id": e.id,
            "external_id": e.external_id,
            "name": e.name,
            "mobile": e.mobile,
            "email": e.email,
            "location": serialize_location(e.location, names),
            "is_active": e.is_active,
            "created_at": e.created_at.isoformat(),
            "last_login_at": e.last_login_at.isoformat() if e.last_login_at else None,
        }
        for e in end_users
    ]


def _scoped_query(ctx: AccessContext):
    query = ctx.db.query(EndUser).outerjoin(Location, EndUser.location_id == Location.id)
    return ctx.apply_scope(query, department_column=None)


def _search(query, search: str | None):
    if search and search.strip():
        term = search.strip()
        query = query.filter(
            text_match(term, EndUser.name, EndUser.email, EndUser.mobile, EndUser.external_id)
        )
    return query


def _clean(db: Session, name: str | None, mobile: str | None, email: str | None, external_id: str | None):
    result = {}
    if name is not None:
        result["name"] = single_line(name, "Name", max_length(EndUser.name))
    if mobile is not None:
        fmt = phone_format(db)
        clean_mobile = fmt.normalize(mobile)
        if clean_mobile is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Mobile must be {fmt.describe()}")
        result["mobile"] = clean_mobile
    if email is not None:
        clean_email = normalize_email(email)
        if clean_email is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email is not valid")
        result["email"] = clean_email
    if external_id is not None:
        result["external_id"] = single_line(external_id, "User ID", max_length(EndUser.external_id), required=False)
    return result


def _location(ctx: AccessContext, location_id: int) -> Location:
    location = require_usable(ctx.db, ctx.db.get(Location, location_id))
    ctx.require_covers_location(location.path)
    return location


@router.get("/")
def list_end_users(
    search: str | None = None,
    location_id: int | None = None,
    include_inactive: bool = True,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    ctx: AccessContext = Depends(require_permission("end_user.view")),
):
    page, page_size = max(page, 1), min(max(page_size, 1), MAX_PAGE_SIZE)
    query = _scoped_query(ctx)
    if location_id is not None:
        within = ctx.db.get(Location, location_id)
        if within is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Location not found")
        query = query.filter(Location.path.startswith(within.path))
    if not include_inactive:
        query = query.filter(EndUser.is_active.is_(True))
    query = _search(query, search)
    total = query.count()
    items = query.order_by(EndUser.name, EndUser.id).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": serialize_end_users(ctx.db, items), "total": total, "page": page, "page_size": page_size}


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_end_user(payload: CreateEndUserRequest, request: Request,
                    ctx: AccessContext = Depends(require_permission("end_user.create"))):
    db = ctx.db
    values = _clean(db, payload.name, payload.mobile, payload.email, payload.external_id)
    location = _location(ctx, payload.location_id) if payload.location_id is not None else None
    if location is None:
        ctx.require_covers_location(None)
    end_user = EndUser(**values, location=location)
    db.add(end_user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "An end user with this user ID, or this mobile + email, already exists") from None
    audit_service.record(db, actor=ctx.user, action="end_user.create", entity_type="end_user", entity_id=end_user.id,
                         summary=f"Added end user {end_user.name}", request=request)
    db.commit()
    return serialize_end_users(db, [end_user])[0]


@router.patch("/{end_user_id}")
def update_end_user(
    end_user_id: int, payload: UpdateEndUserRequest, request: Request,
    ctx: AccessContext = Depends(require_permission("end_user.update")),
):
    db = ctx.db
    end_user = _scoped_query(ctx).filter(EndUser.id == end_user_id).first()
    if end_user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "End user not found")
    before = {
        "external_id": end_user.external_id, "name": end_user.name, "mobile": end_user.mobile,
        "email": end_user.email, "location_id": end_user.location_id, "is_active": end_user.is_active,
    }
    for key, value in _clean(db, payload.name, payload.mobile, payload.email, payload.external_id).items():
        setattr(end_user, key, value)
    if payload.clear_location:
        ctx.require_covers_location(None)
        end_user.location = None
    elif payload.location_id is not None:
        end_user.location = _location(ctx, payload.location_id)
    if payload.is_active is not None:
        end_user.is_active = payload.is_active
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Another end user already has this user ID, or this mobile + email") from None

    after = {
        "external_id": end_user.external_id, "name": end_user.name, "mobile": end_user.mobile,
        "email": end_user.email, "location_id": end_user.location_id, "is_active": end_user.is_active,
    }
    changes = audit_service.diff(before, after)
    if "is_active" in changes and not end_user.is_active:
        token_service.end_all_sessions(db, end_user)
    if "mobile" in changes or "email" in changes:
        # Their sign-in identity changed: sign them out and tell them.
        token_service.end_all_sessions(db, end_user)
        changed = " and ".join(k for k in ("mobile", "email") if k in changes)
        notification_service.notify(db, [end_user], "account.contact_changed",
                                    f"Your registered {changed} was updated",
                                    f"The support team changed your registered {changed}. "
                                    "If you did not ask for this, contact them.")
    if changes:
        audit_service.record(
            db, actor=ctx.user, action="end_user.update", entity_type="end_user", entity_id=end_user.id,
            summary=f"Updated end user {end_user.name}: {', '.join(changes)}", changes=changes, request=request,
        )
    db.commit()
    return serialize_end_users(db, [end_user])[0]


@router.post("/import")
def import_end_user_csv(
    request: Request,
    file: UploadFile = File(...),
    dry_run: bool = Form(...),
    ctx: AccessContext = Depends(require_permission("end_user.import")),
):
    """dry_run=true validates the file and reports what would happen without saving anything."""
    batch, result = run_import(ctx.db, ctx, "end_users", file.filename, read_upload(file.file), dry_run, request)
    return result.as_dict(batch)


@router.get("/export")
def export_end_users(
    search: str | None = None, include_inactive: bool = True,
    ctx: AccessContext = Depends(require_permission("end_user.view")),
):
    """End users in your location scope, in the import format."""
    levels = [t.key for t in location_types_by_depth(ctx.db)]
    query = _scoped_query(ctx)
    if not include_inactive:
        query = query.filter(EndUser.is_active.is_(True))
    end_users = _search(query, search).order_by(EndUser.name, EndUser.id).all()
    names = path_names(ctx.db, [c.location for c in end_users])
    rows = []
    for c in end_users:
        path = names[c.location_id] if c.location_id else []
        rows.append([c.external_id or "", c.name, c.mobile, c.email] + path + [""] * (len(levels) - len(path)))
    return csv_response("end_users", ["user_id", "name", "mobile", "email"] + levels, rows)
