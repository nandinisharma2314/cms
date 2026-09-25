"""SLA clocks and automatic escalation.

Two clocks run on every complaint:
  * response: the handler must acknowledge/act within `response_hours` of being
    assigned (or of submission while it sits unassigned, or of a reopen);
  * resolution: it must be resolved within `resolution_hours` of submission.
    The resolution clock is paused while waiting for information from the citizen.

When a clock passes its due time the complaint is escalated one level up the
assignee's reporting line (reports_to), falling back to the nearest supervisor
role above them in scope. Each level gets the escalation rule's `level_hours`
to act before it climbs again, up to `max_level`. Dealing with the breach
(responding, or resolving) ends the escalation.

`run_check` does the time-based work; it is called periodically (see app.py /
sla_worker.py) and can also be triggered from the admin panel.
"""
from datetime import datetime, timedelta

from sqlalchemy import or_
from sqlalchemy.orm import Session

from models import Complaint, ComplaintEscalation, EscalationRule, SlaRule, User
from services import audit_service, notification_service
from services.access_service import scope_specificity, scopes_of
from services.events import record_event
from services.permission_catalog import SUPER_ADMIN_ROLE_KEY
from services.statuses import ACTIVE_STATUSES, AWAITING_RESPONSE, CLOSED, REJECTED, REOPENED, RESOLVED, WAITING
from utils.security import utcnow

# Seeded defaults. The requirement is a 24-hour response window for every
# priority; resolution targets scale with priority. All editable in the admin panel.
DEFAULT_SLA_RULES = {
    # priority: (response_hours, resolution_hours, warning_minutes)
    "Low": (24, 168, 180),
    "Medium": (24, 120, 180),
    "High": (24, 72, 120),
    "Critical": (24, 24, 60),
}
DEFAULT_ESCALATION_RULES = {
    # breach_type: (level_hours, max_level) — agent -> supervisor -> manager -> admin -> super admin
    "response": (24, 4),
    "resolution": (24, 4),
}
FALLBACK_SLA = (24, 120, 120)

RESPONSE = "response"
RESOLUTION = "resolution"
# Timeline entry types for breaches. They are never reset (unlike the clocks),
# so reports use them to tell whether a complaint ever missed a target.
RESPONSE_BREACH_EVENT = "response_sla_breached"
RESOLUTION_BREACH_EVENT = "resolution_sla_breached"
BREACH_LABEL = {RESPONSE: "response", RESOLUTION: "resolution"}


# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------

def sla_for(db: Session, complaint: Complaint) -> tuple[int, int, int]:
    rules = db.query(SlaRule).filter(
        SlaRule.priority == complaint.priority,
        or_(SlaRule.department_id == complaint.department_id, SlaRule.department_id.is_(None)),
    ).all()
    rule = next((r for r in rules if r.department_id is not None), None) or next(iter(rules), None)
    if rule is None:
        return FALLBACK_SLA
    return rule.response_hours, rule.resolution_hours, rule.warning_minutes


def escalation_rule_for(db: Session, complaint: Complaint, breach_type: str) -> EscalationRule | None:
    rules = db.query(EscalationRule).filter(
        EscalationRule.breach_type == breach_type,
        or_(EscalationRule.department_id == complaint.department_id, EscalationRule.department_id.is_(None)),
    ).all()
    rule = next((r for r in rules if r.department_id is not None), None) or next(iter(rules), None)
    return rule if rule is not None and rule.is_active else None


# ---------------------------------------------------------------------------
# Clocks (called from the workflow as things happen)
# ---------------------------------------------------------------------------

def _set_response_clock(db: Session, complaint: Complaint, start: datetime) -> None:
    response_hours, _, warning = sla_for(db, complaint)
    due = start + timedelta(hours=response_hours)
    complaint.response_due_at = due
    complaint.response_warn_at = max(start, due - timedelta(minutes=warning))
    complaint.response_warned_at = None
    complaint.response_breached_at = None


def _set_resolution_clock(db: Session, complaint: Complaint, start: datetime) -> None:
    _, resolution_hours, warning = sla_for(db, complaint)
    due = start + timedelta(hours=resolution_hours)
    complaint.resolution_due_at = due
    complaint.resolution_warn_at = max(start, due - timedelta(minutes=warning))
    complaint.resolution_warned_at = None
    complaint.resolution_breached_at = None
    complaint.sla_paused_at = None


def start_clocks(db: Session, complaint: Complaint, at: datetime) -> None:
    """On submission."""
    _set_response_clock(db, complaint, at)
    _set_resolution_clock(db, complaint, at)


def on_assigned(db: Session, complaint: Complaint, at: datetime) -> None:
    """A (new) handler gets a fresh response window; handing the complaint to
    someone also deals with a response escalation."""
    if complaint.status in AWAITING_RESPONSE:
        _set_response_clock(db, complaint, at)
        if complaint.escalation_type == RESPONSE:
            _end_escalation(complaint, at)


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

    if complaint.escalation_type == RESPONSE and new not in AWAITING_RESPONSE:
        _end_escalation(complaint, at)
    elif complaint.escalation_type == RESOLUTION and new in (RESOLVED, CLOSED, REJECTED):
        _end_escalation(complaint, at)


def _end_escalation(complaint: Complaint, at: datetime) -> None:
    for row in complaint.escalations:
        if row.resolved_at is None:
            row.resolved_at = at
    complaint.escalation_level = 0
    complaint.escalation_type = None
    complaint.escalated_to = None
    complaint.escalation_due_at = None


def sla_state(complaint: Complaint, now: datetime | None = None) -> dict:
    """Per-clock state for display: met / on_track / at_risk / breached / paused."""
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


def _covers(user: User, complaint: Complaint) -> bool:
    return _is_super_admin(user) or scope_specificity(
        scopes_of(user), complaint.department_id, complaint.location.path,
    ) is not None


def _role_distance_above(lower_role, upper_role) -> int | None:
    """How many levels `upper_role` sits above `lower_role`, or None if not above."""
    distance, current = 0, lower_role
    while current.parent is not None:
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
    # 1. The reporting line.
    candidate, seen = (from_user.reports_to if from_user else None), set()
    while candidate is not None and candidate.id not in seen:
        seen.add(candidate.id)
        if candidate.is_active and _covers(candidate, complaint) and _holds(candidate, permission):
            return candidate
        candidate = candidate.reports_to

    # 2. Nobody on the reporting line: the closest supervisor above in scope.
    best, best_rank = None, None
    for user in db.query(User).filter(User.is_active.is_(True)).all():
        if from_user is not None and user.id == from_user.id:
            continue
        if not _holds(user, permission) or not _covers(user, complaint):
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
        depth = 0
        role = user.role
        while role.parent is not None:
            role, depth = role.parent, depth + 1
        rank = (distance, -depth if from_user is None else 0, tuple(-x for x in specificity), user.id)
        if best_rank is None or rank < best_rank:
            best, best_rank = user, rank
    return best


def _escalate(db: Session, complaint: Complaint, breach_type: str, now: datetime, first: bool) -> None:
    rule = escalation_rule_for(db, complaint, breach_type)
    if rule is None:
        return
    if first:
        level, from_user = 1, complaint.assigned_to
    else:
        level, from_user = complaint.escalation_level + 1, complaint.escalated_to
    # When escalation can't go further, the type stays set (with no due time)
    # so the periodic check doesn't retry every run.
    if level > rule.max_level:
        complaint.escalation_type = breach_type
        complaint.escalation_due_at = None
        record_event(db, complaint, "escalation_stopped", None,
                     f"Escalation reached its limit (level {rule.max_level})", at=now)
        return

    target = next_up(db, complaint, from_user)
    label = BREACH_LABEL[breach_type]
    if target is None:
        complaint.escalation_type = breach_type
        complaint.escalation_due_at = None
        who = from_user.name if from_user else "the department queue"
        record_event(db, complaint, "escalation_stopped", None, f"Nobody above {who} to escalate to", at=now)
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
        summary=f"{complaint.generated_id}: {label} SLA breached; escalated to {target.name} (level {level})",
        changes={"escalated_to": [from_user.name if from_user else None, target.name]},
    )
    record_event(
        db, complaint, "escalated", None,
        f"Escalated to {target.name} ({target.role.name}), level {level}: {label} SLA breached",
        public_message=f"Escalated to a senior officer of the {complaint.department.name} department",
        at=now,
    )
    notification_service.notify(
        db, [target], "complaint.escalated",
        f"{complaint.generated_id} escalated to you",
        f"{label.capitalize()} SLA breached ({complaint.department.name}, {complaint.location.name}). "
        f"You have {rule.level_hours}h before it escalates further.",
        complaint, at=now,
    )
    notification_service.notify(
        db, [complaint.assigned_to, previous_owner], "complaint.escalated",
        f"{complaint.generated_id} was escalated to {target.name}",
        f"The {label} SLA was missed.", complaint, exclude=target, at=now,
    )
    if first:
        # Spec: a breach also informs the manager above the supervisor.
        notification_service.notify(
            db, [target.reports_to], "sla.breached",
            f"SLA breached on {complaint.generated_id}",
            f"{label.capitalize()} SLA missed; escalated to {target.name}.", complaint, at=now,
        )


# ---------------------------------------------------------------------------
# Periodic check
# ---------------------------------------------------------------------------

def _warn(db: Session, complaint: Complaint, breach_type: str, due: datetime, now: datetime) -> None:
    label = BREACH_LABEL[breach_type]
    record_event(db, complaint, "sla_warning", None, f"{label.capitalize()} SLA due at {due:%d %b %H:%M} UTC", at=now)
    handler = complaint.assigned_to
    notification_service.notify(
        db, [handler, handler.reports_to if handler else None, complaint.escalated_to], "sla.warning",
        f"{complaint.generated_id}: {label} due soon",
        f"The {label} SLA ends {due:%d %b %H:%M} UTC.", complaint, at=now,
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
                record_event(db, complaint, RESPONSE_BREACH_EVENT, None, "Response SLA breached", at=now)
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
                record_event(db, complaint, RESOLUTION_BREACH_EVENT, None, "Resolution SLA breached", at=now)
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


def run_check(db: Session, now: datetime | None = None) -> dict:
    """Checks every open complaint whose clocks need attention. Commits."""
    now = now or utcnow()
    candidates = db.query(Complaint).filter(
        Complaint.status.in_(ACTIVE_STATUSES),
        or_(
            Complaint.response_warn_at <= now,
            Complaint.resolution_warn_at <= now,
            Complaint.escalation_due_at <= now,
        ),
    ).all()
    summary: dict[str, int] = {"checked": len(candidates)}
    for complaint in candidates:
        for what in check_complaint(db, complaint, now):
            summary[what] = summary.get(what, 0) + 1
    db.commit()
    return summary
