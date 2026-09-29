from collections.abc import Iterable

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Location, LocationType, max_length
from utils.text import machine_key, single_line



def location_types_by_depth(db: Session) -> list[LocationType]:
    return db.query(LocationType).order_by(LocationType.depth).all()


def path_ids(path: str) -> list[int]:
    return [int(part) for part in path.strip("/").split("/") if part]


def find_child(db: Session, parent: Location | None, name: str) -> Location | None:
    """Case-insensitive lookup of a direct child (or a top-level location when parent is None)."""
    parent_filter = Location.parent_id.is_(None) if parent is None else Location.parent_id == parent.id
    return (
        db.query(Location)
        .filter(parent_filter, func.lower(Location.name) == " ".join(name.split()).lower())
        .first()
    )


def clean_name(name: str) -> str:
    return single_line(name, "Location name", max_length(Location.name))


def is_usable(db: Session, location: Location) -> bool:
    """Active, and so is every location above it."""
    ids = path_ids(location.path)
    inactive = db.query(func.count(Location.id)).filter(Location.id.in_(ids), Location.is_active.is_(False)).scalar()
    return inactive == 0


def require_usable(db: Session, location: Location | None) -> Location:
    if location is None or not is_usable(db, location):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Location not found or inactive")
    return location


def create_location(db: Session, name: str, parent: Location | None) -> Location:
    """Adds a node one level below `parent` and sets its materialized path.
    Flushes but does not commit."""
    name = clean_name(name)
    if parent is not None and not is_usable(db, parent):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"'{parent.name}' is inactive; reactivate it first")
    depth = parent.type.depth + 1 if parent is not None else 0
    location_type = db.query(LocationType).filter(LocationType.depth == depth).first()
    if location_type is None:
        if parent is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Define the location levels before adding locations")
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"'{parent.name}' is at the deepest location level; it cannot have children")
    if find_child(db, parent, name) is not None:
        where = f"under '{parent.name}'" if parent is not None else "at the top level"
        raise HTTPException(status.HTTP_409_CONFLICT, f"'{name}' already exists {where}")

    location = Location(name=name, type=location_type, parent=parent, path="")
    db.add(location)
    db.flush()
    location.path = f"{parent.path if parent is not None else '/'}{location.id}/"
    return location


def path_names(db: Session, locations: Iterable[Location | None]) -> dict[int, list[str]]:
    """Maps each location id to its names from the root down, in one query."""
    locations = [loc for loc in locations if loc is not None]
    needed = {ancestor_id for loc in locations for ancestor_id in path_ids(loc.path)}
    if not needed:
        return {}
    names = dict(db.query(Location.id, Location.name).filter(Location.id.in_(needed)).all())
    return {loc.id: [names[ancestor_id] for ancestor_id in path_ids(loc.path)] for loc in locations}


def serialize_location(location: Location | None, names_by_id: dict[int, list[str]]) -> dict | None:
    if location is None:
        return None
    names = names_by_id[location.id]
    return {
        "id": location.id,
        "name": location.name,
        "type": location.type.key,
        "type_name": location.type.name,
        "path_ids": path_ids(location.path),
        "path_names": names,
        "label": " > ".join(names),
    }


def build_tree(db: Session, include_inactive: bool = False) -> list[dict]:
    query = db.query(Location)
    if not include_inactive:
        query = query.filter(Location.is_active.is_(True))
    nodes = {
        loc.id: {
            "id": loc.id,
            "name": loc.name,
            "parent_id": loc.parent_id,
            "type": loc.type.key,
            "type_name": loc.type.name,
            "is_active": loc.is_active,
            "children": [],
        }
        for loc in query.order_by(Location.name).all()
    }
    roots = []
    for node in nodes.values():
        parent = nodes.get(node["parent_id"])
        if parent is not None:
            parent["children"].append(node)
        elif node["parent_id"] is None:
            roots.append(node)
        # nodes under an inactive (filtered-out) parent are hidden with it
    return roots


# ---------------------------------------------------------------------------
# Location levels
# ---------------------------------------------------------------------------

def serialize_type(location_type: LocationType, used: int) -> dict:
    return {"id": location_type.id, "key": location_type.key, "name": location_type.name,
            "depth": location_type.depth, "locations": used}


def type_usage(db: Session) -> dict[int, int]:
    return dict(db.query(Location.type_id, func.count(Location.id)).group_by(Location.type_id).all())


def add_type(db: Session, key: str, name: str) -> LocationType:
    """Adds a level below the current deepest one. Flushes."""
    from services.import_service import END_USER_KEY_COLUMNS  # (import_service imports this module)

    key = machine_key(key, max_length(LocationType.key))
    if key in END_USER_KEY_COLUMNS:
        # Level keys are CSV column names; these already mean something in the end-user import.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"'{key}' is used by the end-user import; choose another key")
    name = single_line(name, "Name", max_length(LocationType.name))
    if db.query(LocationType).filter((LocationType.key == key) | (func.lower(LocationType.name) == name.lower())).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "A level with this key or name already exists")
    deepest = db.query(func.max(LocationType.depth)).scalar()
    location_type = LocationType(key=key, name=name, depth=0 if deepest is None else deepest + 1)
    db.add(location_type)
    db.flush()
    return location_type


def rename_type(db: Session, location_type: LocationType, name: str) -> None:
    name = single_line(name, "Name", max_length(LocationType.name))
    clash = db.query(LocationType).filter(func.lower(LocationType.name) == name.lower(),
                                          LocationType.id != location_type.id).first()
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, "A level with this name already exists")
    location_type.name = name


def delete_type(db: Session, location_type: LocationType) -> None:
    deepest = db.query(func.max(LocationType.depth)).scalar()
    if location_type.depth != deepest:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only the deepest level can be removed")
    if db.query(Location).filter(Location.type_id == location_type.id).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Locations exist at this level; remove them from the tree first")
    db.delete(location_type)
