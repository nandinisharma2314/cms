from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Location, LocationType


def location_types_by_depth(db: Session) -> list[LocationType]:
    return db.query(LocationType).order_by(LocationType.depth).all()


def path_ids(path: str) -> list[int]:
    return [int(part) for part in path.strip("/").split("/") if part]


def find_child(db: Session, parent: Location | None, name: str) -> Location | None:
    """Case-insensitive lookup of a direct child (or a root when parent is None)."""
    parent_filter = Location.parent_id.is_(None) if parent is None else Location.parent_id == parent.id
    return (
        db.query(Location)
        .filter(parent_filter, func.lower(Location.name) == name.strip().lower())
        .first()
    )


def create_location(db: Session, name: str, parent: Location | None) -> Location:
    """Adds a node one level below `parent` and sets its materialized path.
    Flushes but does not commit."""
    name = name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Location name is required")
    if len(name) > 150:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Location name is too long")
    depth = parent.type.depth + 1 if parent is not None else 0
    location_type = db.query(LocationType).filter(LocationType.depth == depth).first()
    if location_type is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"'{parent.name}' is at the deepest location level; it cannot have children",
        )
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
    return {
        loc.id: [names[ancestor_id] for ancestor_id in path_ids(loc.path) if ancestor_id in names]
        for loc in locations
    }


def serialize_location(location: Location | None, names_by_id: dict[int, list[str]]) -> dict | None:
    if location is None:
        return None
    names = names_by_id.get(location.id, [location.name])
    return {
        "id": location.id,
        "name": location.name,
        "type": location.type.key,
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
