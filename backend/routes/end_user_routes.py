from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import EndUser, Location
from services import audit_service
from services.access_service import AccessContext
from services.import_service import run_import
from services.location_service import location_types_by_depth, path_names, serialize_location
from services.token_service import revoke_all_for
from utils.auth_middleware import require_permission
from utils.csv_export import csv_response
from utils.security import PRINCIPAL_END_USER, looks_like_email, normalize_email, normalize_mobile

router = APIRouter()


class UpdateEndUserRequest(BaseModel):
    name: str | None = None
    mobile: str | None = None
    email: str | None = None
    location_id: int | None = None
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


@router.get("/")
def list_end_users(
    search: str | None = None,
    location_id: int | None = None,
    include_inactive: bool = True,
    page: int = 1,
    page_size: int = 25,
    ctx: AccessContext = Depends(require_permission("end_user.view")),
):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    query = _scoped_query(ctx)
    if location_id is not None:
        within = ctx.db.get(Location, location_id)
        if within is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Location not found")
        query = query.filter(Location.path.startswith(within.path))
    if not include_inactive:
        query = query.filter(EndUser.is_active.is_(True))
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            EndUser.name.ilike(like) | EndUser.email.ilike(like)
            | EndUser.mobile.ilike(like) | EndUser.external_id.ilike(like)
        )
    total = query.count()
    items = query.order_by(EndUser.name).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": serialize_end_users(ctx.db, items), "total": total, "page": page, "page_size": page_size}


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
        "name": end_user.name, "mobile": end_user.mobile, "email": end_user.email,
        "location_id": end_user.location_id, "is_active": end_user.is_active,
    }

    if payload.name is not None:
        name = payload.name.strip()
        if not name or len(name) > 150:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name is required (max 150 characters)")
        end_user.name = name
    if payload.mobile is not None:
        mobile = normalize_mobile(payload.mobile)
        if not mobile or len(mobile) != 10:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mobile must be a 10-digit number")
        end_user.mobile = mobile
    if payload.email is not None:
        email = normalize_email(payload.email)
        if not email or not looks_like_email(email):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email is not valid")
        end_user.email = email
    if payload.location_id is not None:
        location = db.get(Location, payload.location_id)
        if location is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Location not found")
        ctx.require_covers_location(location.path)
        end_user.location = location
    if payload.is_active is not None:
        end_user.is_active = payload.is_active
        if not payload.is_active:
            revoke_all_for(db, PRINCIPAL_END_USER, end_user.id)

    clash = db.query(EndUser).filter(
        EndUser.mobile == end_user.mobile, EndUser.email == end_user.email, EndUser.id != end_user.id
    ).first()
    if clash is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Another end user already has this mobile + email")

    after = {
        "name": end_user.name, "mobile": end_user.mobile, "email": end_user.email,
        "location_id": end_user.location_id, "is_active": end_user.is_active,
    }
    changes = audit_service.diff(before, after)
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
    dry_run: bool = Form(False),
    ctx: AccessContext = Depends(require_permission("end_user.import")),
):
    """dry_run=true validates the file and reports what would happen without saving anything."""
    batch, result = run_import(ctx.db, ctx, "end_users", file.filename, file.file.read(), dry_run, request)
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
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            EndUser.name.ilike(like) | EndUser.email.ilike(like)
            | EndUser.mobile.ilike(like) | EndUser.external_id.ilike(like)
        )
    end_users = query.order_by(EndUser.name).all()
    names = path_names(ctx.db, [c.location for c in end_users])
    rows = []
    for c in end_users:
        path = names.get(c.location_id, []) if c.location_id else []
        rows.append([c.external_id or "", c.name, c.mobile, c.email] + path + [""] * (len(levels) - len(path)))
    return csv_response("end_users", ["user_id", "name", "mobile", "email"] + levels, rows)
