from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import or_

from models import Complaint, EndUser, Location, LocationType, UserScope
from services import audit_service, location_service
from services.access_service import AccessContext
from services.import_service import read_upload, run_import
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


class LocationTypeRequest(BaseModel):
    key: str
    name: str


class LocationTypeRename(BaseModel):
    name: str


def _parent_path(location: Location) -> str | None:
    return location.parent.path if location.parent is not None else None


# ---------------------------------------------------------------------------
# Levels
# ---------------------------------------------------------------------------

@router.get("/types")
def list_location_types(ctx: AccessContext = Depends(require_permission("location.view"))):
    usage = location_service.type_usage(ctx.db)
    return [location_service.serialize_type(t, usage.get(t.id, 0)) for t in location_types_by_depth(ctx.db)]


@router.post("/types", status_code=status.HTTP_201_CREATED)
def add_location_type(payload: LocationTypeRequest, request: Request,
                      ctx: AccessContext = Depends(require_permission("location.update"))):
    ctx.require_covers_location(None)
    location_type = location_service.add_type(ctx.db, payload.key, payload.name)
    audit_service.record(ctx.db, actor=ctx.user, action="location.type_create", entity_type="location_type",
                         entity_id=location_type.id, summary=f"Added location level {location_type.name}",
                         request=request)
    ctx.db.commit()
    return location_service.serialize_type(location_type, 0)


@router.patch("/types/{type_id}")
def rename_location_type(type_id: int, payload: LocationTypeRename, request: Request,
                         ctx: AccessContext = Depends(require_permission("location.update"))):
    ctx.require_covers_location(None)
    location_type = ctx.db.get(LocationType, type_id)
    if location_type is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Level not found")
    old = location_type.name
    location_service.rename_type(ctx.db, location_type, payload.name)
    audit_service.record(ctx.db, actor=ctx.user, action="location.type_update", entity_type="location_type",
                         entity_id=location_type.id, summary=f"Renamed location level {old} to {location_type.name}",
                         request=request)
    ctx.db.commit()
    return location_service.serialize_type(location_type, location_service.type_usage(ctx.db).get(type_id, 0))


@router.delete("/types/{type_id}")
def delete_location_type(type_id: int, request: Request,
                         ctx: AccessContext = Depends(require_permission("location.update"))):
    ctx.require_covers_location(None)
    location_type = ctx.db.get(LocationType, type_id)
    if location_type is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Level not found")
    location_service.delete_type(ctx.db, location_type)
    audit_service.record(ctx.db, actor=ctx.user, action="location.type_delete", entity_type="location_type",
                         entity_id=type_id, summary=f"Removed location level {location_type.name}", request=request)
    ctx.db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Tree
# ---------------------------------------------------------------------------

@router.get("/tree")
def location_tree(include_inactive: bool = False, ctx: AccessContext = Depends(require_permission("location.view"))):
    return build_tree(ctx.db, include_inactive=include_inactive)


@router.post("", status_code=status.HTTP_201_CREATED)
def add_location(payload: CreateLocationRequest, request: Request,
                 ctx: AccessContext = Depends(require_permission("location.update"))):
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
    """Renames or (de)activates a location. Deactivating hides everything below
    it too: no complaints, staff scopes or end users can be placed there."""
    db = ctx.db
    location = db.get(Location, location_id)
    if location is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Location not found")
    ctx.require_covers_location(_parent_path(location))

    before = {"name": location.name, "is_active": location.is_active}
    if payload.name is not None:
        name = location_service.clean_name(payload.name)
        sibling = find_child(db, location.parent, name)
        if sibling is not None and sibling.id != location.id:
            raise HTTPException(status.HTTP_409_CONFLICT, f"'{name}' already exists at this level")
        location.name = name
    if payload.is_active is True and location.parent is not None and not location_service.is_usable(db, location.parent):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Reactivate '{location.parent.name}' first")
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


@router.delete("/{location_id}")
def delete_location(location_id: int, request: Request,
                    ctx: AccessContext = Depends(require_permission("location.update"))):
    """Removes a location nothing refers to (e.g. one created by mistake); use
    deactivation for locations that are in use."""
    db = ctx.db
    location = db.get(Location, location_id)
    if location is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Location not found")
    ctx.require_covers_location(_parent_path(location))
    in_use = (
        db.query(Location.id).filter(Location.parent_id == location.id).first()
        or db.query(Complaint.id).filter(Complaint.location_id == location.id).first()
        or db.query(EndUser.id).filter(EndUser.location_id == location.id).first()
        or db.query(UserScope.id).filter(UserScope.location_id == location.id).first()
    )
    if in_use:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "This location has sub-locations, complaints, end users or staff scopes; deactivate it instead")
    name = location.name
    db.delete(location)
    audit_service.record(db, actor=ctx.user, action="location.delete", entity_type="location", entity_id=location_id,
                         summary=f"Deleted location {name}", request=request)
    db.commit()
    return {"success": True}


@router.post("/import")
def import_location_csv(
    request: Request,
    file: UploadFile = File(...),
    dry_run: bool = Form(...),
    ctx: AccessContext = Depends(require_permission("location.import")),
):
    """dry_run=true validates the file and reports what would happen without saving anything."""
    batch, result = run_import(ctx.db, ctx, "locations", file.filename, read_upload(file.file), dry_run, request)
    return result.as_dict(batch)


@router.get("/export")
def export_locations(
    include_inactive: bool = False, ctx: AccessContext = Depends(require_permission("location.view")),
):
    """Every path to a leaf location, in the import format (re-importing it changes nothing)."""
    levels = [t.key for t in location_types_by_depth(ctx.db)]
    query = ctx.db.query(Location)
    if not include_inactive:
        inactive_paths = [p for (p,) in ctx.db.query(Location.path).filter(Location.is_active.is_(False)).all()]
        query = query.filter(Location.is_active.is_(True))
        if inactive_paths:
            query = query.filter(~or_(*[Location.path.startswith(p) for p in inactive_paths]))
    locations = query.all()
    parents = {loc.parent_id for loc in locations if loc.parent_id is not None}
    leaves = [loc for loc in locations if loc.id not in parents]
    names = path_names(ctx.db, leaves)
    rows = sorted(names[leaf.id] for leaf in leaves)
    return csv_response("locations", levels, [row + [""] * (len(levels) - len(row)) for row in rows])
