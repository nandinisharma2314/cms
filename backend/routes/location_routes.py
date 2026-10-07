from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel

from models import Complaint, EndUser, Location, LocationType, UserScope
from services import audit_service, location_service
from services.access_service import AccessContext
from services.import_service import read_upload, run_import
from services.location_service import (
    get_nodes, get_path, create_location, find_child, location_types_by_depth, path_names, serialize_location,
)
from utils.auth_middleware import require_permission

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

@router.get("/nodes")
def location_nodes(
    parent_id: int | None = None,
    include_inactive: bool = False,
    ctx: AccessContext = Depends(require_permission("location.view")),
):
    return get_nodes(ctx.db, parent_id=parent_id, include_inactive=include_inactive)

@router.get("/path/{location_id}")
def location_path(location_id: int, ctx: AccessContext = Depends(require_permission("location.view"))):
    return get_path(ctx.db, location_id=location_id)


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
    """Export every leaf location as a full-path CSV row (import-compatible format).

    Strategy (tested ~2-3 s total for 640 k rows):
      1. Fetch leaf IDs via type_id of the deepest level — fast indexed scan (~1.7 s).
      2. Stream CSV in batches of 10 k using a self-join that resolves all
         ancestor names in the DB — no huge Python name dict, no NOT-EXISTS/NOT-IN.
    """
    import csv
    import io
    from datetime import datetime, timezone
    from fastapi.responses import StreamingResponse
    from sqlalchemy import text

    db = ctx.db

    # Level keys in depth order (column headers)
    levels = [t.key for t in location_types_by_depth(db)]
    depth = len(levels)

    # ── Step 1: get leaf IDs fast via the deepest LocationType ──────────────
    deepest_type = db.query(LocationType).order_by(LocationType.depth.desc()).first()
    leaf_q = db.query(Location.id).filter(Location.type_id == deepest_type.id)
    if not include_inactive:
        leaf_q = leaf_q.filter(Location.is_active.is_(True))
    leaf_ids: list[int] = [lid for (lid,) in leaf_q.all()]

    # ── Step 2: self-join template to resolve ancestor names ─────────────────
    # l0 = leaf, l1 = parent, ..., l{depth-1} = root
    joins = "\n".join(
        f"LEFT JOIN locations l{i + 1} ON l{i}.parent_id = l{i + 1}.id"
        for i in range(depth - 1)
    )
    # Root first, leaf last in SELECT and ORDER
    select_cols = ", ".join(f"l{depth - 1 - i}.name" for i in range(depth))

    def batch_sql(ids: list[int]) -> text:
        active_filter = ""
        if not include_inactive:
            active_filter = " AND " + " AND ".join(f"l{i}.is_active = true" for i in range(depth))
        return text(f"""
            SELECT {select_cols}
            FROM locations l0
            {joins}
            WHERE l0.id IN ({",".join(str(i) for i in ids)})
            {active_filter}
            ORDER BY {select_cols}
        """)

    def generate_csv():
        buffer = io.StringIO()
        buffer.write("\ufeff")  # UTF-8 BOM for Excel
        writer = csv.writer(buffer)
        writer.writerow(levels)
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)

        BATCH = 10_000
        for i in range(0, len(leaf_ids), BATCH):
            chunk = leaf_ids[i:i + BATCH]
            rows = db.execute(batch_sql(chunk)).fetchall()
            for row in rows:
                writer.writerow("" if v is None else v for v in row)
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%MZ")
    return StreamingResponse(
        generate_csv(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="locations-{stamp}.csv"'},
    )
