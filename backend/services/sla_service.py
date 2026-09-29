"""SLA clocks and automatic escalation.

Two clocks run on every complaint:
  * response: the handler must acknowledge/act within `response_hours` of being
    assigned (or of submission while it sits unassigned, or of a reopen);
  * resolution: it must be resolved within `resolution_hours` of submission.
    The resolution clock is paused while waiting for information from the end user.

Targets come from sla_rules: the department's rule for the complaint's
priority, else the default rule for that priority. Every priority is created
with a default rule, so a missing one is a data error, not something to guess.

When a clock passes its due time the complaint is escalated one level up the
assignee's reporting line (reports_to), falling back to the nearest role above
them in scope. Each level gets the escalation rule's `level_hours` to act
before it climbs again, up to `max_level`. Dealing with the breach (responding,
or resolving) ends the escalation. Handing the complaint to someone else does
not erase a breach that already happened: the new handler inherits it.

`run_check` does the time-based work (see services/worker_service.py).
"""
import logging
from datetime import datetime, timedelta

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, selectinload

from models import Complaint, ComplaintEscalation, EscalationRule, SlaRule, User
from services import audit_service, notification_service
from services.access_service import scope_specificity, scopes_of
from services.events import record_event
from services.permission_catalog import SUPER_ADMIN_ROLE_KEY
from services.statuses import ACTIVE_STATUSES, AWAITING_RESPONSE, CLOSED, REJECTED, REOPENED, RESOLVED, WAITING
from utils.security import utcnow

logger = logging.getLogger(__name__)

RESPONSE = "response"
RESOLUTION = "resolution"
BREACH_TYPES = (RESPONSE, RESOLUTION)
# Timeline entry types for breaches. They are never reset (unlike the clocks),
# so reports use them to tell whether a complaint ever missed a target.
RESPONSE_BREACH_EVENT = "response_sla_breached"
RESOLUTION_BREACH_EVENT = "resolution_sla_breached"


class MissingSlaRule(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------

def rule_for(db: Session, priority_id: int, department_id: int) -> SlaRule:
    rules = db.query(SlaRule).filter(
        SlaRule.priority_id == priority_id,
        or_(SlaRule.department_id == department_id, SlaRule.department_id.is_(None)),
    ).all()
    rule = next((r for r in rules if r.department_id is not None), None) or next(iter(rules), None)
    if rule is None:
        raise MissingSlaRule(f"No default SLA rule for priority id {priority_id}")
    return rule


def sla_for(db: Session, complaint: Complaint) -> SlaRule:
    return rule_for(db, complaint.priority_id, complaint.department_id)


def escalation_rule_for(db: Session, complaint: Complaint, breach_type: str) -> EscalationRule | None:
    """The department's rule if it has one (possibly disabled), else the default."""
    rules = db.query(EscalationRule).filter(
        EscalationRule.breach_type == breach_type,
        or_(EscalationRule.department_id == complaint.department_id, EscalationRule.department_id.is_(None)),
    ).all()
    return next((r for r in rules if r.department_id is not None), None) or next(iter(rules), None)


# ---------------------------------------------------------------------------
# Clocks (called from the workflow as things happen)
# ---------------------------------------------------------------------------

def _set_response_clock(db: Session, complaint: Complaint, start: datetime) -> None:
    rule = sla_for(db, complaint)
    due = start + timedelta(hours=rule.response_hours)
    complaint.response_due_at = due
    complaint.response_warn_at = max(start, due - timedelta(minutes=rule.warning_minutes))
    complaint.response_warned_at = None
    complaint.response_breached_at = None


def _set_resolution_clock(db: Session, complaint: Complaint, start: datetime) -> None:
    rule = sla_for(db, complaint)
    due = start + timedelta(hours=rule.resolution_hours)
    complaint.resolution_due_at = due
    complaint.resolution_warn_at = max(start, due - timedelta(minutes=rule.warning_minutes))
    complaint.resolution_warned_at = None
    complaint.resolution_breached_at = None
    complaint.sla_paused_at = None


def start_clocks(db: Session, complaint: Complaint, at: datetime) -> None:
    """On submission."""
    _set_response_clock(db, complaint, at)
    _set_resolution_clock(db, complaint, at)


def on_assigned(db: Session, complaint: Complaint, at: datetime) -> None:
    """A new handler gets a fresh response window, unless the response target
    has already been missed: then the breach (and any escalation) stands until
    someone responds."""
    if complaint.status in AWAITING_RESPONSE and complaint.response_breached_at is None:
        _set_response_clock(db, complaint, at)


def on_status_change(db: Session, complaint: Complaint, old: str, new: str, at: datetime) -> None:
    if new == WAITING and complaint.sla_paused_at is None:
        complaint.sla_paused_at = at
    elif old == WAITING and complaint.sla_paused_at is not None:
        paused = at - complaint.sla_paused_at
        if complaint.resolution_due_at:
            complaint.resolution_due_at += paused
            complaint.resolution_warn_at += paused
        complaint.sla_paused_at = None

    if new == REOPENED:
        _set_response_clock(db, complaint, at)
        _set_resolution_clock(db, complaint, at)

    response_handled = complaint.escalation_type == RESPONSE and new not in AWAITING_RESPONSE
    resolution_handled = complaint.escalation_type == RESOLUTION and new in (RESOLVED, CLOSED, REJECTED)
    if response_handled or resolution_handled:
        _end_escalation(complaint, at)


def apply_target_change(db: Session, complaint: Complaint, old_rule: SlaRule, at: datetime) -> None:
    """After a priority or department change: shift the running clocks by the
    difference between the old and new targets (keeping time already spent and
    pauses). A breach that already happened stays recorded."""
    new_rule = sla_for(db, complaint)
    if complaint.status in AWAITING_RESPONSE and complaint.response_due_at and complaint.response_breached_at is None:
        complaint.response_due_at += timedelta(hours=new_rule.response_hours - old_rule.response_hours)
        complaint.response_warn_at = max(at, complaint.response_due_at - timedelta(minutes=new_rule.warning_minutes))
        complaint.response_warned_at = None
    if (complaint.status in ACTIVE_STATUSES and complaint.resolution_due_at
            and complaint.resolution_breached_at is None):
        complaint.resolution_due_at += timedelta(hours=new_rule.resolution_hours - old_rule.resolution_hours)
        complaint.resolution_warn_at = max(at, complaint.resolution_due_at - timedelta(minutes=new_rule.warning_minutes))
        complaint.resolution_warned_at = None


def _end_escalation(complaint: Complaint, at: datetime) -> None:
    for row in complaint.escalations:
        if row.resolved_at is None:
            row.resolved_at = at
    complaint.escalation_level = 0
    complaint.escalation_type = None
    complaint.escalated_to = None
    complaint.escalation_due_at = None


def end_escalation(complaint: Complaint, at: datetime) -> None:
    """Public wrapper, e.g. when the escalated person no longer covers the complaint."""
    _end_escalation(complaint, at)


def sla_state(complaint: Complaint, now: datetime | None = None) -> dict:
    """Per-clock state for display: met / met_late / on_track / at_risk / breached / paused."""
    now = now or utcnow()

    def state(due, warn, breached_at, done: bool, paused: bool = False) -> str | None:
        if due is None:
            return None
        if done:
            return "met"
        if paused:
            return "paused"
        if breached_at is not None or now >= due:
            return "breached"
        if warn is not None and now >= warn:
            return "at_risk"
        return "on_track"

    awaiting = complaint.status in AWAITING_RESPONSE
    finished = complaint.status in (RESOLVED, CLOSED, REJECTED)
    response = state(complaint.response_due_at, complaint.response_warn_at, complaint.response_breached_at, not awaiting)
    if response == "met" and complaint.response_breached_at is not None:
        response = "met_late"
    resolution = state(
        complaint.resolution_due_at, complaint.resolution_warn_at, complaint.resolution_breached_at,
        finished, complaint.sla_paused_at is not None,
    )
    if resolution == "met" and complaint.resolved_at and complaint.resolution_due_at \
            and complaint.resolved_at > complaint.resolution_due_at:
        resolution = "met_late"
    return {"response": response, "resolution": resolution}


# ---------------------------------------------------------------------------
# Escalation chain
# ---------------------------------------------------------------------------

def _is_super_admin(user: User) -> bool:
    return user.role.key == SUPER_ADMIN_ROLE_KEY


def covers(user: User, complaint: Complaint) -> bool:
    return _is_super_admin(user) or scope_specificity(
        scopes_of(user), complaint.department_id, complaint.location.path,
    ) is not None


def _role_distance_above(lower_role, upper_role) -> int | None:
    """How many levels `upper_role` sits above `lower_role`, or None if not above."""
    distance, current, seen = 0, lower_role, set()
    while current.parent is not None and current.id not in seen:
        seen.add(current.id)
        current = current.parent
        distance += 1
        if current.id == upper_role.id:
            return distance
    return None


def _holds(user: User, permission: str) -> bool:
    return _is_super_admin(user) or any(p.key == permission for p in user.role.permissions)


def next_up(
    db: Session, complaint: Complaint, from_user: User | None, permission: str = "complaint.assign",
) -> User | None:
    """The person above `from_user` (None = unassigned) who is responsible for
    this complaint: first along the reporting line, otherwise the closest
    holder of `permission` above them in scope."""
    candidate, seen = (from_user.reports_to if from_user else None), set()
    while candidate is not None and candidate.id not in seen:
        seen.add(candidate.id)
        if candidate.is_active and covers(candidate, complaint) and _holds(candidate, permission):
            return candidate
        candidate = candidate.reports_to

    best, best_rank = None, None
    users = db.query(User).options(selectinload(User.scopes)).filter(User.is_active.is_(True)).all()
    for user in users:
        if from_user is not None and user.id == from_user.id:
            continue
        if not _holds(user, permission) or not covers(user, complaint):
            continue
        if from_user is not None:
            distance = _role_distance_above(from_user.role, user.role)
            if distance is None:
                continue
        else:
            distance = 0
        specificity = (0, 0) if _is_super_admin(user) else scope_specificity(
            scopes_of(user), complaint.department_id, complaint.location.path,
        )
        # closest level first; for the unassigned queue, the lowest role in the hierarchy
        depth, role, visited = 0, user.role, set()
        while role.parent is not None and role.id not in visited:
            visited.add(role.id)
            role, depth = role.parent, depth + 1
        rank = (distance, -depth if from_user is None else 0, tuple(-x for x in specificity), user.id)
        if best_rank is None or rank < best_rank:
            best, best_rank = user, rank
    return best


def _stop(db: Session, complaint: Complaint, breach_type: str, message: str, now: datetime) -> None:
    """Records why escalation cannot continue; the type stays set (with no due
    time) so the periodic check doesn't retry every run."""
    complaint.escalation_type = breach_type
    complaint.escalation_due_at = None
    record_event(db, complaint, "escalation_stopped", None, message, at=now)


def _escalate(db: Session, complaint: Complaint, breach_type: str, now: datetime, first: bool) -> None:
    rule = escalation_rule_for(db, complaint, breach_type)
    if rule is None:
        _stop(db, complaint, breach_type, f"No escalation rule is configured for missed {breach_type} targets", now)
        return
    if not rule.is_active:
        _stop(db, complaint, breach_type, f"Escalation of missed {breach_type} targets is turned off for this department", now)
        return
    if first:
        level, from_user = 1, complaint.assigned_to
    else:
        level, from_user = complaint.escalation_level + 1, complaint.escalated_to
    if level > rule.max_level:
        _stop(db, complaint, breach_type, f"Escalation reached its limit (level {rule.max_level})", now)
        return

    target = next_up(db, complaint, from_user)
    if target is None:
        who = from_user.name if from_user else "the department queue"
        _stop(db, complaint, breach_type, f"Nobody above {who} to escalate to", now)
        return

    db.add(ComplaintEscalation(
        complaint=complaint, breach_type=breach_type, level=level,
        from_user=from_user, to_user=target, created_at=now,
    ))
    previous_owner = complaint.escalated_to
    complaint.escalation_level = level
    complaint.escalation_type = breach_type
    complaint.escalated_to = target
    complaint.escalation_due_at = now + timedelta(hours=rule.level_hours)

    audit_service.record(
        db, actor=None, action="complaint.escalate", entity_type="complaint", entity_id=complaint.generated_id,
        summary=f"{complaint.generated_id}: {breach_type} SLA missed; escalated to {target.name} (level {level})",
        changes={"escalated_to": [from_user.name if from_user else None, target.name]},
    )
    record_event(
        db, complaint, "escalated", None,
        f"Escalated to {target.name} ({target.role.name}), level {level}: {breach_type} SLA missed",
        public_message="Escalated for priority handling",
        at=now,
    )
    notification_service.notify(
        db, [target], "complaint.escalated",
        f"{complaint.generated_id} escalated to you",
        f"{breach_type.capitalize()} SLA missed ({complaint.department.name}, {complaint.location.name}). "
        f"You have {rule.level_hours}h before it escalates further.",
        complaint, at=now,
    )
    notification_service.notify(
        db, [complaint.assigned_to, previous_owner], "complaint.escalated",
        f"{complaint.generated_id} was escalated to {target.name}",
        f"The {breach_type} SLA was missed.", complaint, exclude=target, at=now,
    )
    if first:
        # A breach also informs the person above the one it was escalated to.
        notification_service.notify(
            db, [target.reports_to], "sla.breached",
            f"SLA missed on {complaint.generated_id}",
            f"{breach_type.capitalize()} SLA missed; escalated to {target.name}.", complaint, at=now,
        )


# ---------------------------------------------------------------------------
# Periodic check
# ---------------------------------------------------------------------------

def _warn(db: Session, complaint: Complaint, breach_type: str, due: datetime, now: datetime) -> None:
    record_event(db, complaint, "sla_warning", None, f"{breach_type.capitalize()} SLA due soon", at=now)
    handler = complaint.assigned_to
    notification_service.notify(
        db, [handler, handler.reports_to if handler else None, complaint.escalated_to], "sla.warning",
        f"{complaint.generated_id}: {breach_type} due soon",
        f"The {breach_type} target for {complaint.title} is almost due.", complaint, at=now,
    )


def check_complaint(db: Session, complaint: Complaint, now: datetime) -> list[str]:
    """Applies warnings, breaches and escalations due at `now`. Returns what happened."""
    happened = []
    if complaint.status in AWAITING_RESPONSE and complaint.response_due_at:
        if (complaint.response_warned_at is None and complaint.response_warn_at
                and complaint.response_warn_at <= now < complaint.response_due_at):
            complaint.response_warned_at = now
            _warn(db, complaint, RESPONSE, complaint.response_due_at, now)
            happened.append("response_warning")
        if now >= complaint.response_due_at:
            if complaint.response_breached_at is None:
                complaint.response_breached_at = now
                record_event(db, complaint, RESPONSE_BREACH_EVENT, None, "Response SLA missed", at=now)
                if complaint.escalation_type is None:
                    _escalate(db, complaint, RESPONSE, now, first=True)
                happened.append("response_breach")
            elif (complaint.escalation_type == RESPONSE and complaint.escalation_due_at
                  and now >= complaint.escalation_due_at):
                _escalate(db, complaint, RESPONSE, now, first=False)
                happened.append("response_escalation")

    if (complaint.status in ACTIVE_STATUSES and complaint.resolution_due_at
            and complaint.sla_paused_at is None):
        if (complaint.resolution_warned_at is None and complaint.resolution_warn_at
                and complaint.resolution_warn_at <= now < complaint.resolution_due_at):
            complaint.resolution_warned_at = now
            _warn(db, complaint, RESOLUTION, complaint.resolution_due_at, now)
            happened.append("resolution_warning")
        if now >= complaint.resolution_due_at:
            if complaint.resolution_breached_at is None:
                complaint.resolution_breached_at = now
                record_event(db, complaint, RESOLUTION_BREACH_EVENT, None, "Resolution SLA missed", at=now)
                # a response escalation already in progress keeps precedence
                if complaint.escalation_type is None:
                    _escalate(db, complaint, RESOLUTION, now, first=True)
                happened.append("resolution_breach")
            elif complaint.escalation_type is None and complaint.status not in AWAITING_RESPONSE:
                _escalate(db, complaint, RESOLUTION, now, first=True)
                happened.append("resolution_escalation")
            elif (complaint.escalation_type == RESOLUTION and complaint.escalation_due_at
                  and now >= complaint.escalation_due_at):
                _escalate(db, complaint, RESOLUTION, now, first=False)
                happened.append("resolution_escalation")
    return happened


def _due_clause(now: datetime):
    """Complaints with something to do at `now`; complaints whose clocks have
    all fired and settled are not loaded again."""
    awaiting = Complaint.status.in_(AWAITING_RESPONSE)
    running = Complaint.sla_paused_at.is_(None)
    return and_(
        Complaint.status.in_(ACTIVE_STATUSES),
        or_(
            and_(awaiting, Complaint.response_warned_at.is_(None), Complaint.response_warn_at <= now),
            and_(awaiting, Complaint.response_breached_at.is_(None), Complaint.response_due_at <= now),
            and_(running, Complaint.resolution_warned_at.is_(None), Complaint.resolution_warn_at <= now),
            and_(running, Complaint.resolution_breached_at.is_(None), Complaint.resolution_due_at <= now),
            Complaint.escalation_due_at <= now,
            and_(running, ~awaiting, Complaint.resolution_breached_at.isnot(None),
                 Complaint.escalation_type.is_(None)),
        ),
    )


def run_check(db: Session, now: datetime | None = None) -> dict:
    """Checks every complaint with something due. Each complaint is committed
    on its own, so a failure on one is logged and the rest still proceed."""
    now = now or utcnow()
    ids = [cid for (cid,) in db.query(Complaint.id).filter(_due_clause(now)).order_by(Complaint.id).all()]
    summary: dict[str, int] = {"checked": len(ids)}
    for complaint_id in ids:
        try:
            complaint = db.get(Complaint, complaint_id)
            for what in check_complaint(db, complaint, now):
                summary[what] = summary.get(what, 0) + 1
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("SLA check failed for complaint %s", complaint_id)
            summary["errors"] = summary.get("errors", 0) + 1
    return summary
