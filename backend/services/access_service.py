"""Effective access for a staff user.

Access = role permissions + (department, location) scopes + role hierarchy:

* Permissions say *what* a user may do (e.g. "complaint.view").
* Scopes say *where*: each scope is a (department, location) pair, where a NULL
  department means every department and a NULL location means every location.
  A location scope covers that node and everything beneath it in the tree.
* The role hierarchy says *whom* a user may manage: only users whose role sits
  strictly below their own, and whose scopes fit inside their own.

The Super Admin role bypasses all three.
"""
from dataclasses import dataclass
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import and_, false, or_
from sqlalchemy.orm import Session

from models import Location, Role, User
from services.permission_catalog import PERMISSIONS, SUPER_ADMIN_ROLE_KEY


@dataclass(frozen=True)
class Scope:
    department_id: int | None
    location_path: str | None  # materialized path of the scope's location; None = all

    def covers(self, department_id: int | None, location_path: str | None) -> bool:
        """Whether a record (or a narrower scope) at the given department and
        location falls inside this scope. None on the argument side means
        "all", which only an unrestricted scope covers."""
        if self.department_id is not None and department_id != self.department_id:
            return False
        return self.covers_location(location_path)

    def covers_location(self, location_path: str | None) -> bool:
        if self.location_path is None:
            return True
        return location_path is not None and location_path.startswith(self.location_path)


def scope_specificity(scopes: list[Scope], department_id: int, location_path: str) -> tuple[int, int] | None:
    """How closely the best covering scope fits a (department, location):
    (1 if department-specific else 0, depth of the scope's location). None
    when no scope covers it. Higher is more specific."""
    best = None
    for scope in scopes:
        if not scope.covers(department_id, location_path):
            continue
        depth = scope.location_path.strip("/").count("/") + 1 if scope.location_path else 0
        score = (1 if scope.department_id is not None else 0, depth)
        best = score if best is None or score > best else best
    return best


def scopes_of(user: User) -> list[Scope]:
    return [
        Scope(s.department_id, s.location.path if s.location else None)
        for s in user.scopes
    ]


class AccessContext:
    def __init__(self, db: Session, user: User):
        self.db = db
        self.user = user
        self.role: Role = user.role
        self.is_super_admin = self.role.key == SUPER_ADMIN_ROLE_KEY
        if self.is_super_admin:
            self.permissions = frozenset(PERMISSIONS)
            self.scopes: tuple[Scope, ...] = (Scope(None, None),)
        else:
            self.permissions = frozenset(p.key for p in self.role.permissions)
            self.scopes = tuple(scopes_of(user))
        self._roles_by_id: dict[int, Role] | None = None

    # -- permissions --------------------------------------------------------

    def has(self, permission: str) -> bool:
        return permission in self.permissions

    def require(self, permission: str) -> None:
        if not self.has(permission):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Missing permission: {permission}")

    # -- department / location scope ---------------------------------------

    def covers(self, department_id: int | None, location_path: str | None) -> bool:
        return any(s.covers(department_id, location_path) for s in self.scopes)

    def covers_location(self, location_path: str | None) -> bool:
        """Location-only check, for records that have no department (citizens,
        the location tree itself)."""
        return any(s.covers_location(location_path) for s in self.scopes)

    def require_covers(self, department_id: int | None, location_path: str | None) -> None:
        if not self.covers(department_id, location_path):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Outside your department/location scope")

    def require_covers_location(self, location_path: str | None) -> None:
        if not self.covers_location(location_path):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Outside your location scope")

    def contains_all(self, scopes: Iterable[Scope]) -> bool:
        return all(self.covers(s.department_id, s.location_path) for s in scopes)

    def scope_clause(self, department_column, location_path_column):
        """SQL condition restricting rows to this user's scopes. Returns None
        when unrestricted. The query must join the Location that
        `location_path_column` belongs to. Pass department_column=None for
        records without a department; department restrictions are then ignored."""
        clauses = []
        for scope in self.scopes:
            parts = []
            if department_column is not None and scope.department_id is not None:
                parts.append(department_column == scope.department_id)
            if scope.location_path is not None:
                parts.append(location_path_column.startswith(scope.location_path))
            if not parts:
                return None
            clauses.append(and_(*parts))
        return or_(*clauses) if clauses else false()

    def apply_scope(self, query, department_column, location_path_column=Location.path):
        clause = self.scope_clause(department_column, location_path_column)
        return query if clause is None else query.filter(clause)

    # -- role hierarchy -----------------------------------------------------

    @property
    def roles_by_id(self) -> dict[int, Role]:
        if self._roles_by_id is None:
            self._roles_by_id = {r.id: r for r in self.db.query(Role).all()}
        return self._roles_by_id

    def invalidate_roles(self) -> None:
        self._roles_by_id = None

    def is_role_below(self, role: Role, above: Role | None = None) -> bool:
        """Whether `role` is a strict descendant of `above` (default: own role)."""
        above = above or self.role
        seen: set[int] = set()
        current = self.roles_by_id.get(role.parent_id) if role.parent_id else None
        while current is not None and current.id not in seen:
            if current.id == above.id:
                return True
            seen.add(current.id)
            current = self.roles_by_id.get(current.parent_id) if current.parent_id else None
        return False

    def assignable_roles(self) -> list[Role]:
        return [r for r in self.roles_by_id.values() if self.is_role_below(r)]

    def can_manage_user(self, target: User) -> bool:
        if target.id == self.user.id:
            return False
        return self.is_role_below(target.role) and self.contains_all(scopes_of(target))
