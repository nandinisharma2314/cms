"""SLA targets and escalation rules (permission sla.manage).

Changes apply to complaints submitted, assigned or reopened afterwards; clocks
that are already running keep their due times. Default rules (all departments)
need an unrestricted scope; a department override needs a scope covering that
department."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from config import MAX_ESCALATION_LEVEL, SLA_MAX_HOURS
from models import Department, EscalationRule, SlaRule
from services import audit_service, priority_service, sla_service, worker_service
from services.access_service import AccessContext
from utils.auth_middleware import require_permission

router = APIRouter()


class SlaRuleRequest(BaseModel):
    priority_id: int
    department_id: int | None
    response_hours: int
    resolution_hours: int
    warning_minutes: int


class EscalationRuleRequest(BaseModel):
    breach_type: str
    department_id: int | None
    level_hours: int
    max_level: int
    is_active: bool




def _serialize_sla(r: SlaRule) -> dict:
    return {
        "id": r.id,
        "priority": priority_service.serialize(r.priority),
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


def _check_scope(ctx: AccessContext, department_id: int | None) -> None:
    if department_id is not None and ctx.db.get(Department, department_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Department not found")
    ctx.require_covers(department_id, None)


@router.get("/config")
def get_config(ctx: AccessContext = Depends(require_permission("sla.manage"))):
    db = ctx.db
    return {
        "priorities": [priority_service.serialize(p) for p in priority_service.list_priorities(db, include_inactive=True)],
        "sla_rules": [_serialize_sla(r) for r in db.query(SlaRule).order_by(SlaRule.department_id, SlaRule.id).all()],
        "escalation_rules": [
            _serialize_escalation(r)
            for r in db.query(EscalationRule).order_by(EscalationRule.department_id, EscalationRule.id).all()
        ],
    }


@router.put("/rules")
def upsert_sla_rule(payload: SlaRuleRequest, request: Request,
                    ctx: AccessContext = Depends(require_permission("sla.manage"))):
    """Creates or updates the rule for (priority, department or default)."""
    db = ctx.db
    priority = priority_service.get_active(db, payload.priority_id)
    priority_service.validate_targets(payload.response_hours, payload.resolution_hours, payload.warning_minutes)
    _check_scope(ctx, payload.department_id)

    dept_filter = (
        SlaRule.department_id == payload.department_id
        if payload.department_id is not None else SlaRule.department_id.is_(None)
    )
    rule = db.query(SlaRule).filter(SlaRule.priority_id == priority.id, dept_filter).first()
    before = _serialize_sla(rule) if rule else {}
    if rule is None:
        rule = SlaRule(priority=priority, department_id=payload.department_id)
        db.add(rule)
    rule.response_hours = payload.response_hours
    rule.resolution_hours = payload.resolution_hours
    rule.warning_minutes = payload.warning_minutes
    db.flush()
    db.refresh(rule)
    after = _serialize_sla(rule)
    audit_service.record(
        db, actor=ctx.user, action="sla.rule_update", entity_type="sla_rule", entity_id=rule.id,
        summary=f"SLA for {priority.name} priority "
                f"({after['department']['name'] if after['department'] else 'all departments'}): "
                f"respond {payload.response_hours}h, resolve {payload.resolution_hours}h",
        changes=audit_service.diff(before, after), request=request,
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
    _check_scope(ctx, rule.department_id)
    audit_service.record(
        db, actor=ctx.user, action="sla.rule_delete", entity_type="sla_rule", entity_id=rule.id,
        summary=f"Removed the {rule.department.name} override for {rule.priority.name} priority", request=request,
    )
    db.delete(rule)
    db.commit()
    return {"success": True}


@router.put("/escalation-rules")
def upsert_escalation_rule(
    payload: EscalationRuleRequest, request: Request, ctx: AccessContext = Depends(require_permission("sla.manage")),
):
    db = ctx.db
    if payload.breach_type not in sla_service.BREACH_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "breach_type must be 'response' or 'resolution'")
    if not 1 <= payload.level_hours <= SLA_MAX_HOURS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Hours per level must be between 1 and {SLA_MAX_HOURS}")
    if not 1 <= payload.max_level <= MAX_ESCALATION_LEVEL:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Max level must be between 1 and {MAX_ESCALATION_LEVEL}")
    if payload.department_id is None and not payload.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "The default rule cannot be disabled; add a disabled department override instead")
    _check_scope(ctx, payload.department_id)
    dept_filter = (
        EscalationRule.department_id == payload.department_id
        if payload.department_id is not None else EscalationRule.department_id.is_(None)
    )
    rule = db.query(EscalationRule).filter(EscalationRule.breach_type == payload.breach_type, dept_filter).first()
    before = _serialize_escalation(rule) if rule else {}
    if rule is None:
        rule = EscalationRule(breach_type=payload.breach_type, department_id=payload.department_id)
        db.add(rule)
    rule.level_hours = payload.level_hours
    rule.max_level = payload.max_level
    rule.is_active = payload.is_active
    db.flush()
    db.refresh(rule)
    after = _serialize_escalation(rule)
    audit_service.record(
        db, actor=ctx.user, action="sla.escalation_rule_update", entity_type="escalation_rule", entity_id=rule.id,
        summary=f"Escalation on missed {payload.breach_type} targets"
                f" ({after['department']['name'] if after['department'] else 'all departments'}): every "
                f"{payload.level_hours}h, up to level {payload.max_level}{'' if payload.is_active else ' (disabled)'}",
        changes=audit_service.diff(before, after), request=request,
    )
    db.commit()
    return after


@router.delete("/escalation-rules/{rule_id}")
def delete_escalation_rule(rule_id: int, request: Request,
                           ctx: AccessContext = Depends(require_permission("sla.manage"))):
    """Removes a department override; the department then follows the default rule."""
    db = ctx.db
    rule = db.get(EscalationRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    if rule.department_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Default rules can be edited but not deleted")
    _check_scope(ctx, rule.department_id)
    audit_service.record(
        db, actor=ctx.user, action="sla.escalation_rule_delete", entity_type="escalation_rule", entity_id=rule.id,
        summary=f"Removed the {rule.department.name} escalation override for missed {rule.breach_type} targets",
        request=request,
    )
    db.delete(rule)
    db.commit()
    return {"success": True}


@router.post("/run")
def run_check_now(request: Request, ctx: AccessContext = Depends(require_permission("sla.manage"))):
    """Runs the SLA check immediately instead of waiting for the next scheduled run."""
    ctx.require_covers(None, None)
    summary = worker_service.run_sla_check_now()
    if summary.get("skipped"):
        raise HTTPException(status.HTTP_409_CONFLICT, "A background run is in progress; try again in a moment")
    audit_service.record(
        ctx.db, actor=ctx.user, action="sla.run", entity_type="sla", entity_id=None,
        summary=f"Ran the SLA check manually: {summary}", request=request,
    )
    ctx.db.commit()
    return summary
