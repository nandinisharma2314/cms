import re

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from models import ComplaintCategory, Department
from services import audit_service
from services.access_service import AccessContext
from utils.auth_middleware import require_permission

router = APIRouter()

CODE_PATTERN = re.compile(r"^[A-Z0-9_-]{2,20}$")


class CreateDepartmentRequest(BaseModel):
    name: str
    code: str
    description: str | None = None
    categories: list[str] = []


class UpdateDepartmentRequest(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    is_active: bool | None = None


class CategoryRequest(BaseModel):
    name: str | None = None
    is_active: bool | None = None


def serialize_department(d: Department, include_inactive_categories: bool = True) -> dict:
    return {
        "id": d.id,
        "name": d.name,
        "code": d.code,
        "description": d.description,
        "is_active": d.is_active,
        "categories": [
            {"id": c.id, "name": c.name, "is_active": c.is_active}
            for c in d.categories
            if include_inactive_categories or c.is_active
        ],
    }


def _clean_name(name: str, limit: int = 100) -> str:
    name = name.strip()
    if not name or len(name) > limit:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Name is required (max {limit} characters)")
    return name


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


@router.get("/")
def list_departments(include_inactive: bool = True, ctx: AccessContext = Depends(require_permission("department.view"))):
    query = ctx.db.query(Department)
    if not include_inactive:
        query = query.filter(Department.is_active.is_(True))
    return [serialize_department(d) for d in query.order_by(Department.name).all()]


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_department(payload: CreateDepartmentRequest, request: Request, ctx: AccessContext = Depends(require_permission("department.create"))):
    db = ctx.db
    ctx.require_covers(None, None)
    name = _clean_name(payload.name)
    code = payload.code.strip().upper()
    if not CODE_PATTERN.match(code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code must be 2-20 letters, digits, '-' or '_'")
    _check_unique(db, name, code)

    category_names = []
    for raw in payload.categories:
        category = _clean_name(raw)
        if category.lower() not in {c.lower() for c in category_names}:
            category_names.append(category)
    department = Department(
        name=name, code=code, description=(payload.description or "").strip()[:500] or None,
        categories=[ComplaintCategory(name=c) for c in category_names],
    )
    db.add(department)
    db.flush()
    audit_service.record(
        db, actor=ctx.user, action="department.create", entity_type="department", entity_id=department.id,
        summary=f"Created department {name} ({code})", request=request,
    )
    db.commit()
    return serialize_department(department)


@router.patch("/{department_id}")
def update_department(
    department_id: int, payload: UpdateDepartmentRequest, request: Request,
    ctx: AccessContext = Depends(require_permission("department.update")),
):
    db = ctx.db
    department = _get_editable(ctx, department_id)
    before = {"name": department.name, "code": department.code, "description": department.description, "is_active": department.is_active}

    name = _clean_name(payload.name) if payload.name is not None else department.name
    code = payload.code.strip().upper() if payload.code is not None else department.code
    if not CODE_PATTERN.match(code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code must be 2-20 letters, digits, '-' or '_'")
    _check_unique(db, name, code, exclude_id=department.id)
    department.name, department.code = name, code
    if payload.description is not None:
        department.description = payload.description.strip()[:500] or None
    if payload.is_active is not None:
        department.is_active = payload.is_active

    after = {"name": department.name, "code": department.code, "description": department.description, "is_active": department.is_active}
    changes = audit_service.diff(before, after)
    if changes:
        audit_service.record(
            db, actor=ctx.user, action="department.update", entity_type="department", entity_id=department.id,
            summary=f"Updated department {department.name}: {', '.join(changes)}", changes=changes, request=request,
        )
    db.commit()
    return serialize_department(department)


@router.post("/{department_id}/categories", status_code=status.HTTP_201_CREATED)
def add_category(
    department_id: int, payload: CategoryRequest, request: Request,
    ctx: AccessContext = Depends(require_permission("department.update")),
):
    db = ctx.db
    department = _get_editable(ctx, department_id)
    name = _clean_name(payload.name or "")
    if any(c.name.lower() == name.lower() for c in department.categories):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Category '{name}' already exists in {department.name}")
    department.categories.append(ComplaintCategory(name=name))
    audit_service.record(
        db, actor=ctx.user, action="department.category_create", entity_type="department", entity_id=department.id,
        summary=f"Added category {name} to {department.name}", request=request,
    )
    db.commit()
    return serialize_department(department)


@router.patch("/{department_id}/categories/{category_id}")
def update_category(
    department_id: int, category_id: int, payload: CategoryRequest, request: Request,
    ctx: AccessContext = Depends(require_permission("department.update")),
):
    db = ctx.db
    department = _get_editable(ctx, department_id)
    category = next((c for c in department.categories if c.id == category_id), None)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    before = {"name": category.name, "is_active": category.is_active}
    if payload.name is not None:
        name = _clean_name(payload.name)
        if any(c.id != category.id and c.name.lower() == name.lower() for c in department.categories):
            raise HTTPException(status.HTTP_409_CONFLICT, f"Category '{name}' already exists in {department.name}")
        category.name = name
    if payload.is_active is not None:
        category.is_active = payload.is_active
    changes = audit_service.diff(before, {"name": category.name, "is_active": category.is_active})
    if changes:
        audit_service.record(
            db, actor=ctx.user, action="department.category_update", entity_type="department", entity_id=department.id,
            summary=f"Updated category {category.name} in {department.name}", changes=changes, request=request,
        )
    db.commit()
    return serialize_department(department)
