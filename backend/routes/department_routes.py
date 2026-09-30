import re

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from config import DEPARTMENT_CODE_MIN_LENGTH
from models import Complaint, ComplaintCategory, Department, Location, max_length
from services import audit_service, priority_service
from services.access_service import AccessContext
from services.statuses import ACTIVE_STATUSES
from utils.auth_middleware import require_permission
from utils.text import multi_line, single_line

router = APIRouter()

CODE_FORMAT = re.compile(r"[A-Z0-9_-]+")


class CategoryInput(BaseModel):
    name: str
    default_priority_id: int


class CreateDepartmentRequest(BaseModel):
    name: str
    code: str
    description: str | None = None
    categories: list[CategoryInput]


class UpdateDepartmentRequest(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    is_active: bool | None = None


class CategoryUpdate(BaseModel):
    name: str | None = None
    default_priority_id: int | None = None
    is_active: bool | None = None


def serialize_department(d: Department, open_complaints: int | None = None) -> dict:
    data = {
        "id": d.id,
        "name": d.name,
        "code": d.code,
        "description": d.description,
        "is_active": d.is_active,
        "categories": [
            {
                "id": c.id, "name": c.name, "is_active": c.is_active,
                "default_priority": {"id": c.default_priority.id, "name": c.default_priority.name,
                                     "tone": c.default_priority.tone},
            }
            for c in d.categories
        ],
    }
    if open_complaints is not None:
        data["open_complaints"] = open_complaints
    return data


def _clean_name(name: str, column) -> str:
    return single_line(name, "Name", max_length(column))


def _clean_description(description: str | None) -> str | None:
    return multi_line(description, "Description", max_length(Department.description), required=False)


def _clean_code(code: str) -> str:
    code = code.strip().upper()
    limit = max_length(Department.code)
    if not (DEPARTMENT_CODE_MIN_LENGTH <= len(code) <= limit and CODE_FORMAT.fullmatch(code)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Code must be {DEPARTMENT_CODE_MIN_LENGTH}-{limit} letters, digits, '-' or '_'")
    return code


def _check_unique(db: Session, name: str, code: str, exclude_id: int | None = None) -> None:
    query = db.query(Department).filter((func.lower(Department.name) == name.lower()) | (Department.code == code))
    if exclude_id is not None:
        query = query.filter(Department.id != exclude_id)
    if query.first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A department with this name or code already exists")


def _get_editable(ctx: AccessContext, department_id: int) -> Department:
    department = ctx.db.get(Department, department_id)
    if department is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Department not found")
    # Editing a department affects every location, so the scope must cover all of them.
    ctx.require_covers(department.id, None)
    return department


def _open_complaints(ctx: AccessContext) -> dict[int, int]:
    """Open complaints per department, counting only those inside the viewer's scope."""
    query = (
        ctx.db.query(Complaint.department_id, func.count(Complaint.id))
        .join(Location, Complaint.location_id == Location.id)
        .filter(Complaint.status.in_(ACTIVE_STATUSES))
    )
    return dict(ctx.apply_scope(query, Complaint.department_id).group_by(Complaint.department_id).all())


@router.get("")
def list_departments(include_inactive: bool = True,
                     ctx: AccessContext = Depends(require_permission("department.view"))):
    query = ctx.db.query(Department)
    if not include_inactive:
        query = query.filter(Department.is_active.is_(True))
    counts = _open_complaints(ctx)
    return [serialize_department(d, counts.get(d.id, 0)) for d in query.order_by(Department.name).all()]


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_department(payload: CreateDepartmentRequest, request: Request,
                      ctx: AccessContext = Depends(require_permission("department.create"))):
    db = ctx.db
    ctx.require_covers(None, None)
    name = _clean_name(payload.name, Department.name)
    code = _clean_code(payload.code)
    _check_unique(db, name, code)
    if not payload.categories:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Add at least one category; complaints need one")

    categories = []
    seen = set()
    for item in payload.categories:
        category_name = _clean_name(item.name, ComplaintCategory.name)
        if category_name.lower() in seen:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Category '{category_name}' is listed twice")
        seen.add(category_name.lower())
        categories.append(ComplaintCategory(
            name=category_name, default_priority=priority_service.get_active(db, item.default_priority_id),
        ))
    department = Department(
        name=name, code=code, description=_clean_description(payload.description), categories=categories,
    )
    db.add(department)
    db.flush()
    audit_service.record(
        db, actor=ctx.user, action="department.create", entity_type="department", entity_id=department.id,
        summary=f"Created department {name} ({code}) with {len(categories)} categories", request=request,
    )
    db.commit()
    return serialize_department(department, 0)


@router.patch("/{department_id}")
def update_department(
    department_id: int, payload: UpdateDepartmentRequest, request: Request,
    ctx: AccessContext = Depends(require_permission("department.update")),
):
    db = ctx.db
    department = _get_editable(ctx, department_id)
    before = {"name": department.name, "code": department.code, "description": department.description,
              "is_active": department.is_active}

    name = _clean_name(payload.name, Department.name) if payload.name is not None else department.name
    code = _clean_code(payload.code) if payload.code is not None else department.code
    _check_unique(db, name, code, exclude_id=department.id)
    department.name, department.code = name, code
    if payload.description is not None:
        department.description = _clean_description(payload.description)
    if payload.is_active is not None:
        department.is_active = payload.is_active

    after = {"name": department.name, "code": department.code, "description": department.description,
             "is_active": department.is_active}
    changes = audit_service.diff(before, after)
    if changes:
        audit_service.record(
            db, actor=ctx.user, action="department.update", entity_type="department", entity_id=department.id,
            summary=f"Updated department {department.name}: {', '.join(changes)}", changes=changes, request=request,
        )
    db.commit()
    return serialize_department(department, _open_complaints(ctx).get(department.id, 0))


@router.post("/{department_id}/categories", status_code=status.HTTP_201_CREATED)
def add_category(
    department_id: int, payload: CategoryInput, request: Request,
    ctx: AccessContext = Depends(require_permission("department.update")),
):
    db = ctx.db
    department = _get_editable(ctx, department_id)
    name = _clean_name(payload.name, ComplaintCategory.name)
    if any(c.name.lower() == name.lower() for c in department.categories):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Category '{name}' already exists in {department.name}")
    priority = priority_service.get_active(db, payload.default_priority_id)
    department.categories.append(ComplaintCategory(name=name, default_priority=priority))
    audit_service.record(
        db, actor=ctx.user, action="department.category_create", entity_type="department", entity_id=department.id,
        summary=f"Added category {name} ({priority.name}) to {department.name}", request=request,
    )
    db.commit()
    return serialize_department(department, _open_complaints(ctx).get(department.id, 0))


@router.patch("/{department_id}/categories/{category_id}")
def update_category(
    department_id: int, category_id: int, payload: CategoryUpdate, request: Request,
    ctx: AccessContext = Depends(require_permission("department.update")),
):
    db = ctx.db
    department = _get_editable(ctx, department_id)
    category = next((c for c in department.categories if c.id == category_id), None)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    before = {"name": category.name, "default_priority": category.default_priority.name, "is_active": category.is_active}
    if payload.name is not None:
        name = _clean_name(payload.name, ComplaintCategory.name)
        if any(c.id != category.id and c.name.lower() == name.lower() for c in department.categories):
            raise HTTPException(status.HTTP_409_CONFLICT, f"Category '{name}' already exists in {department.name}")
        category.name = name
    if payload.default_priority_id is not None:
        category.default_priority = priority_service.get_active(db, payload.default_priority_id)
    if payload.is_active is not None:
        if payload.is_active is False and category.is_active and \
                sum(1 for c in department.categories if c.is_active) == 1 and department.is_active:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                "This is the department's only active category; add another first or deactivate "
                                "the department")
        category.is_active = payload.is_active
    after = {"name": category.name, "default_priority": category.default_priority.name, "is_active": category.is_active}
    changes = audit_service.diff(before, after)
    if changes:
        audit_service.record(
            db, actor=ctx.user, action="department.category_update", entity_type="department", entity_id=department.id,
            summary=f"Updated category {category.name} in {department.name}: {', '.join(changes)}",
            changes=changes, request=request,
        )
    db.commit()
    return serialize_department(department, _open_complaints(ctx).get(department.id, 0))
