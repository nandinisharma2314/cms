from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel

from models import Location
from services import audit_service
from services.access_service import AccessContext
from services.import_service import run_import
from services.location_service import (
    build_tree, create_location, find_child, location_types_by_depth, path_names, serialize_location,
)
from utils.auth_middleware import require_permission
from utils.csv_export import csv_response

router = APIRouter()


class CreateLocationRequest(BaseModel):
    name: str
    parent_id: int | None = None


class UpdateLocationRequest(BaseModel):
    name: str | None = None
    is_active: bool | None = None


def _parent_path(location: Location) -> str | None:
    return location.parent.path if location.parent is not None else None


@router.get("/types")
def list_location_types(ctx: AccessContext = Depends(require_permission("location.view"))):
    return [{"id": t.id, "key": t.key, "name": t.name, "depth": t.depth} for t in location_types_by_depth(ctx.db)]


@router.get("/tree")
def location_tree(include_inactive: bool = False, ctx: AccessContext = Depends(require_permission("location.view"))):
    return build_tree(ctx.db, include_inactive=include_inactive)


@router.post("/", status_code=status.HTTP_201_CREATED)
def add_location(payload: CreateLocationRequest, request: Request, ctx: AccessContext = Depends(require_permission("location.create"))):
    db = ctx.db
    parent = None
    if payload.parent_id is not None:
        parent = db.get(Location, payload.parent_id)
        if parent is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Parent location not found")
    ctx.require_covers_location(parent.path if parent is not None else None)
    location = create_location(db, payload.name, parent)
    audit_service.record(
        db, actor=ctx.user, action="location.create", entity_type="location", entity_id=location.id,
        summary=f"Added {location.type.name} {location.name}" + (f" under {parent.name}" if parent else ""),
        request=request,
    )
    db.commit()
    return serialize_location(location, path_names(db, [location]))


@router.patch("/{location_id}")
def update_location(
    location_id: int, payload: UpdateLocationRequest, request: Request,
    ctx: AccessContext = Depends(require_permission("location.update")),
):
    db = ctx.db
    location = db.get(Location, location_id)
    if location is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Location not found")
    ctx.require_covers_location(_parent_path(location))

    before = {"name": location.name, "is_active": location.is_active}
    if payload.name is not None and payload.name.strip() != location.name:
        name = payload.name.strip()
        if not name or len(name) > 150:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name is required (max 150 characters)")
        sibling = find_child(db, location.parent, name)
        if sibling is not None and sibling.id != location.id:
            raise HTTPException(status.HTTP_409_CONFLICT, f"'{name}' already exists at this level")
        location.name = name
    if payload.is_active is not None:
        location.is_active = payload.is_active

    changes = audit_service.diff(before, {"name": location.name, "is_active": location.is_active})
    if changes:
        audit_service.record(
            db, actor=ctx.user, action="location.update", entity_type="location", entity_id=location.id,
            summary=f"Updated location {location.name}: {', '.join(changes)}", changes=changes, request=request,
        )
    db.commit()
    return serialize_location(location, path_names(db, [location]))


@router.post("/import")
def import_location_csv(
    request: Request,
    file: UploadFile = File(...),
    dry_run: bool = Form(False),
    ctx: AccessContext = Depends(require_permission("location.import")),
):
    """dry_run=true validates the file and reports what would happen without saving anything."""
    batch, result = run_import(ctx.db, ctx, "locations", file.filename, file.file.read(), dry_run, request)
    return result.as_dict(batch)


@router.get("/export")
def export_locations(
    include_inactive: bool = False, ctx: AccessContext = Depends(require_permission("location.view")),
):
    """Every path to a leaf location, in the import format (re-importing it changes nothing)."""
    levels = [t.key for t in location_types_by_depth(ctx.db)]
    query = ctx.db.query(Location)
    if not include_inactive:
        query = query.filter(Location.is_active.is_(True))
    locations = query.all()
    parents = {loc.parent_id for loc in locations if loc.parent_id is not None}
    leaves = [loc for loc in locations if loc.id not in parents]
    names = path_names(ctx.db, leaves)
    rows = sorted(names[leaf.id] for leaf in leaves)
    return csv_response("locations", levels, [row + [""] * (len(levels) - len(row)) for row in rows])
