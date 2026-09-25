"""SLA targets and escalation rules (Super Admin by default, via `sla.manage`).
Changes apply to complaints submitted, assigned or reopened afterwards; clocks
that are already running keep their due times."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from models import Department, EscalationRule, SlaRule
from services import audit_service, sla_service
from services.access_service import AccessContext
from services.complaint_service import PRIORITIES
from utils.auth_middleware import require_permission

router = APIRouter()


class SlaRuleRequest(BaseModel):
    priority: str
    department_id: int | None = None
    response_hours: int
    resolution_hours: int
    warning_minutes: int = 120


class EscalationRuleRequest(BaseModel):
    breach_type: str
    department_id: int | None = None
    level_hours: int
    max_level: int
    is_active: bool = True


def _serialize_sla(r: SlaRule) -> dict:
    return {
        "id": r.id,
        "priority": r.priority,
        "department": {"id": r.department.id, "name": r.department.name} if r.department else None,
        "response_hours": r.response_hours,
        "resolution_hours": r.resolution_hours,
        "warning_minutes": r.warning_minutes,
    }


def _serialize_escalation(r: EscalationRule) -> dict:
    return {
        "id": r.id,
        "breach_type": r.breach_type,
        "department": {"id": r.department.id, "name": r.department.name} if r.department else None,
        "level_hours": r.level_hours,
        "max_level": r.max_level,
        "is_active": r.is_active,
    }


def _check_department(ctx: AccessContext, department_id: int | None) -> None:
    if department_id is not None and ctx.db.get(Department, department_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Department not found")


@router.get("/config")
def get_config(ctx: AccessContext = Depends(require_permission("sla.manage"))):
    db = ctx.db
    return {
        "priorities": PRIORITIES,
        "sla_rules": [_serialize_sla(r) for r in db.query(SlaRule).order_by(SlaRule.department_id, SlaRule.id).all()],
        "escalation_rules": [
            _serialize_escalation(r) for r in db.query(EscalationRule).order_by(EscalationRule.department_id, EscalationRule.id).all()
        ],
    }


@router.put("/rules")
def upsert_sla_rule(payload: SlaRuleRequest, request: Request, ctx: AccessContext = Depends(require_permission("sla.manage"))):
    """Creates or updates the rule for (priority, department)."""
    db = ctx.db
    if payload.priority not in PRIORITIES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Priority must be one of: {', '.join(PRIORITIES)}")
    if not (1 <= payload.response_hours <= 24 * 30 and 1 <= payload.resolution_hours <= 24 * 180):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hours are out of range")
    if payload.response_hours > payload.resolution_hours:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The response target cannot be longer than the resolution target")
    if not 0 <= payload.warning_minutes <= payload.response_hours * 60:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The warning must fall inside the response window")
    _check_department(ctx, payload.department_id)

    dept_filter = (
        SlaRule.department_id == payload.department_id
        if payload.department_id is not None else SlaRule.department_id.is_(None)
    )
    rule = db.query(SlaRule).filter(SlaRule.priority == payload.priority, dept_filter).first()
    before = _serialize_sla(rule) if rule else None
    if rule is None:
        rule = SlaRule(priority=payload.priority, department_id=payload.department_id)
        db.add(rule)
    rule.response_hours = payload.response_hours
    rule.resolution_hours = payload.resolution_hours
    rule.warning_minutes = payload.warning_minutes
    db.flush()
    after = _serialize_sla(rule)
    audit_service.record(
        db, actor=ctx.user, action="sla.rule_update", entity_type="sla_rule", entity_id=rule.id,
        summary=f"SLA for {payload.priority} priority "
                f"({after['department']['name'] if after['department'] else 'all departments'}): "
                f"respond {payload.response_hours}h, resolve {payload.resolution_hours}h",
        changes=audit_service.diff(before or {}, after), request=request,
    )
    db.commit()
    return after


@router.delete("/rules/{rule_id}")
def delete_sla_rule(rule_id: int, request: Request, ctx: AccessContext = Depends(require_permission("sla.manage"))):
    db = ctx.db
    rule = db.get(SlaRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    if rule.department_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Default rules can be edited but not deleted")
    audit_service.record(
        db, actor=ctx.user, action="sla.rule_delete", entity_type="sla_rule", entity_id=rule.id,
        summary=f"Removed the {rule.department.name} override for {rule.priority} priority", request=request,
    )
    db.delete(rule)
    db.commit()
    return {"success": True}


@router.put("/escalation-rules")
def upsert_escalation_rule(
    payload: EscalationRuleRequest, request: Request, ctx: AccessContext = Depends(require_permission("sla.manage")),
):
    db = ctx.db
    if payload.breach_type not in (sla_service.RESPONSE, sla_service.RESOLUTION):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "breach_type must be 'response' or 'resolution'")
    if not (1 <= payload.level_hours <= 24 * 30 and 1 <= payload.max_level <= 10):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Values are out of range")
    _check_department(ctx, payload.department_id)
    dept_filter = (
        EscalationRule.department_id == payload.department_id
        if payload.department_id is not None else EscalationRule.department_id.is_(None)
    )
    rule = db.query(EscalationRule).filter(EscalationRule.breach_type == payload.breach_type, dept_filter).first()
    before = _serialize_escalation(rule) if rule else None
    if rule is None:
        rule = EscalationRule(breach_type=payload.breach_type, department_id=payload.department_id)
        db.add(rule)
    rule.level_hours = payload.level_hours
    rule.max_level = payload.max_level
    rule.is_active = payload.is_active
    db.flush()
    after = _serialize_escalation(rule)
    audit_service.record(
        db, actor=ctx.user, action="sla.escalation_rule_update", entity_type="escalation_rule", entity_id=rule.id,
        summary=f"Escalation on {payload.breach_type} breach: every {payload.level_hours}h, up to level "
                f"{payload.max_level}{'' if payload.is_active else ' (disabled)'}",
        changes=audit_service.diff(before or {}, after), request=request,
    )
    db.commit()
    return after


@router.post("/run")
def run_check_now(request: Request, ctx: AccessContext = Depends(require_permission("sla.manage"))):
    """Runs the SLA check immediately instead of waiting for the next scheduled run."""
    summary = sla_service.run_check(ctx.db)
    audit_service.record(
        ctx.db, actor=ctx.user, action="sla.run", entity_type="sla", entity_id=None,
        summary=f"Ran the SLA check manually: {summary}", request=request,
    )
    ctx.db.commit()
    return summary
