"""Complaint status workflow, timeline events and comments.

    SUBMITTED -> ASSIGNED -> ACKNOWLEDGED -> IN_PROGRESS <-> WAITING_FOR_INFORMATION
                                                  |
                                               RESOLVED -> CLOSED
                                                  |           |
                                                  +-> REOPENED <+
    Any open status -> REJECTED (only by holders of complaint.reject.approve, with a reason)

Assignment (SUBMITTED -> ASSIGNED) lives in routing_service. End users may
reopen within the organisation's reopen window, up to its reopen limit
(Settings); staff reopening a complaint is a management decision and is not
limited by either, but needs a reason and is audited.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from config import COMMENT_MAX_LENGTH, NOTE_MAX_LENGTH
from models import Complaint, ComplaintComment, EndUser, User, max_length
from services import notification_service, rejection_service, reward_service, settings_service, sla_service
from services.access_service import AccessContext
from services.events import record_event
from services.statuses import (
    ACKNOWLEDGED, ASSIGNED, CLOSED, IN_PROGRESS, REJECTED, REOPENED, RESOLVED, SUBMITTED, WAITING,
    end_user_status_label, status_label,
)
from utils.security import utcnow
from utils.text import multi_line


@dataclass(frozen=True)
class StaffAction:
    key: str
    label: str
    from_statuses: frozenset[str]
    to_status: str
    permission: str
    # Only the assignee, or someone who can assign complaints, may take it.
    handler_only: bool
    note: str  # "required" | "optional"
    note_label: str


_WORKING = frozenset({ASSIGNED, ACKNOWLEDGED, IN_PROGRESS, WAITING, REOPENED})

STAFF_ACTIONS = [
    StaffAction("acknowledge", "Acknowledge", frozenset({ASSIGNED, REOPENED}), ACKNOWLEDGED,
                "complaint.respond", True, "optional", "Message to the end user (optional)"),
    StaffAction("start", "Start Work", frozenset({ASSIGNED, ACKNOWLEDGED, REOPENED}), IN_PROGRESS,
                "complaint.respond", True, "optional", "Message to the end user (optional)"),
    StaffAction("request_info", "Ask End User for Information", frozenset({ACKNOWLEDGED, IN_PROGRESS, REOPENED}),
                WAITING, "complaint.respond", True, "required", "What do you need from the end user?"),
    StaffAction("resume", "Resume Work", frozenset({WAITING}), IN_PROGRESS,
                "complaint.respond", True, "optional", "Message to the end user (optional)"),
    StaffAction("resolve", "Mark Resolved", _WORKING, RESOLVED,
                "complaint.resolve", True, "required", "Resolution (shown to the end user)"),
    StaffAction("close", "Close", frozenset({RESOLVED}), CLOSED,
                "complaint.close", False, "optional", "Closing note (optional, shown to the end user)"),
    StaffAction("reopen", "Reopen", frozenset({RESOLVED, CLOSED}), REOPENED,
                "complaint.close", False, "required", "Why is it being reopened? (shown to the end user)"),
    StaffAction("reject", "Reject", frozenset({SUBMITTED}) | _WORKING, REJECTED,
                "complaint.reject.approve", False, "required", "Reason for rejection (shown to the end user)"),
]
STAFF_ACTIONS_BY_KEY = {a.key: a for a in STAFF_ACTIONS}

# Staff actions that count as the first response to the end user.
_RESPONSE_ACTIONS = {"acknowledge", "start", "request_info", "resolve", "reject"}


def _handlers(complaint: Complaint) -> list[User | None]:
    """Staff to tell when the end user does something."""
    return [complaint.assigned_to, complaint.escalated_to]


def change_status(
    db, complaint, new_status, actor, *, note=None, at=None, public=True, message=None, public_message=None,
):
    """Sets the status, records it on the timeline, updates SLA clocks and
    notifies the other side. `public=False` keeps it off the end user's view;
    `public_message` overrides the end-user-facing text."""
    now = at or utcnow()
    old = complaint.status
    complaint.status = new_status
    text = message or f"Status changed from {status_label(old)} to {status_label(new_status)}"
    end_user_text = public_message or message or (
        f"Status changed from {end_user_status_label(old)} to {end_user_status_label(new_status)}"
    )
    record_event(
        db, complaint, "status_changed", actor, text,
        public_message=end_user_text if public else None,
        from_status=old, to_status=new_status, note=note, at=now,
    )
    sla_service.on_status_change(db, complaint, old, new_status, now)
    if new_status == RESOLVED and isinstance(actor, User):
        reward_service.evaluate_resolution_reward(db, complaint, actor, at=now)
    elif new_status == CLOSED:
        reward_service.evaluate_closure_reward(db, complaint, at=now)

    gid = complaint.generated_id
    if isinstance(actor, User) and public:
        body = f"{complaint.title}. {note}" if note else complaint.title
        notification_service.notify(
            db, [complaint.end_user], "complaint.status", f"{gid} is now {end_user_status_label(new_status).lower()}",
            body, complaint, at=now,
        )
    elif isinstance(actor, EndUser):
        notification_service.notify(
            db, _handlers(complaint), "complaint.end_user_update", f"{gid}: {text.lower()}", note, complaint, at=now,
        )


# ---------------------------------------------------------------------------
# Staff
# ---------------------------------------------------------------------------

def is_handler(ctx: AccessContext, complaint: Complaint) -> bool:
    """The assignee, or a supervisor who can assign complaints in this scope."""
    return complaint.assigned_to_id == ctx.user.id or ctx.has("complaint.assign")


def staff_actions_for(ctx: AccessContext, complaint: Complaint) -> list[StaffAction]:
    """Actions the user may take now. The complaint must already be known to be in scope."""
    return [
        a for a in STAFF_ACTIONS
        if complaint.status in a.from_statuses
        and ctx.has(a.permission)
        and (not a.handler_only or is_handler(ctx, complaint))
    ]


def _clean_note(note: str | None) -> str | None:
    note = (note or "").strip() or None
    if note is not None and len(note) > NOTE_MAX_LENGTH:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"The note is too long (max {NOTE_MAX_LENGTH} characters)")
    return note


def apply_staff_action(
    ctx: AccessContext, complaint: Complaint, key: str, note: str | None, reason_id: int | None = None,
    at: datetime | None = None,
) -> None:
    """Performs a workflow action. Adds events; the caller commits."""
    action = STAFF_ACTIONS_BY_KEY.get(key)
    if action is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown action '{key}'")
    if not ctx.has(action.permission) or (action.handler_only and not is_handler(ctx, complaint)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"You are not allowed to use '{action.label}' on this complaint")
    if complaint.status not in action.from_statuses:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"'{action.label}' is not available for a {status_label(complaint.status).lower()} complaint",
        )
    note = _clean_note(note)
    if action.note == "required" and not note:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{action.note_label} is required")
    reason = rejection_service.active_reason(ctx.db, reason_id) if key == "reject" else None

    now = at or utcnow()
    db = ctx.db
    if key in _RESPONSE_ACTIONS and complaint.acknowledged_at is None:
        complaint.acknowledged_at = now
    if key == "resolve":
        complaint.resolved_at = now
        complaint.resolution_note = note
    elif key in ("close", "reject"):
        complaint.closed_at = now
    elif key == "reopen":
        complaint.resolved_at = None
        complaint.closed_at = None
        complaint.reopen_count += 1

    previous_status = complaint.status
    change_status(db, complaint, action.to_status, ctx.user, note=note, at=now)
    if key == "reject":
        rejection_service.record_direct_rejection(db, ctx.user, complaint, previous_status, reason, note, now)
    elif key == "request_info":
        # The question goes into the conversation so the end user can reply to it.
        add_comment(db, complaint, ctx.user, note, is_internal=False, at=now, record=False)


# ---------------------------------------------------------------------------
# End user
# ---------------------------------------------------------------------------

def reopen_deadline(db: Session, complaint: Complaint) -> datetime | None:
    reference = complaint.resolved_at or complaint.closed_at
    if reference is None:
        return None
    return reference + timedelta(days=settings_service.require(db, "reopen_window_days"))


# The End User role permission each end-user action needs.
ACTION_PERMISSIONS = {
    "comment": "portal.complaint.comment",
    "confirm": "portal.complaint.confirm",
    "reopen": "portal.complaint.reopen",
    "feedback": "portal.complaint.feedback",
}


def end_user_actions_for(db: Session, complaint: Complaint, now: datetime | None = None) -> list[str]:
    """What the complaint's state allows the end user to do; permissions are
    checked separately (see ACTION_PERMISSIONS)."""
    actions = []
    if complaint.status not in (CLOSED, REJECTED):
        actions.append("comment")
    if complaint.status == RESOLVED:
        actions.append("confirm")
    if complaint.status in (RESOLVED, CLOSED) and complaint.reopen_count < settings_service.require(db, "max_reopens"):
        deadline = reopen_deadline(db, complaint)
        if deadline is None or (now or utcnow()) <= deadline:
            actions.append("reopen")
    if complaint.status in (RESOLVED, CLOSED) and complaint.feedback_rating is None:
        actions.append("feedback")
    return actions


def _require_end_user_action(db: Session, complaint: Complaint, action: str, now: datetime | None = None) -> None:
    if action not in end_user_actions_for(db, complaint, now):
        raise HTTPException(status.HTTP_409_CONFLICT, "This action is not available for this complaint")


def _store_feedback(db: Session, complaint: Complaint, rating: int | None, comment: str | None, now: datetime) -> None:
    if rating is None:
        return
    if not 1 <= rating <= 5:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Rating must be between 1 and 5")
    complaint.feedback_rating = rating
    complaint.feedback_comment = multi_line(comment, "The comment", max_length(Complaint.feedback_comment),
                                            required=False)
    complaint.feedback_at = now
    reward_service.evaluate_feedback_reward(db, complaint, rating, at=now)


def end_user_confirm(
    db: Session, end_user: EndUser, complaint: Complaint, rating: int | None, comment: str | None,
    at: datetime | None = None,
) -> None:
    _require_end_user_action(db, complaint, "confirm")
    now = at or utcnow()
    if complaint.feedback_rating is None:
        _store_feedback(db, complaint, rating, comment, now)
    complaint.closed_at = now
    change_status(db, complaint, CLOSED, end_user, at=now, message="End user confirmed the resolution; complaint closed",
                  public_message="You confirmed the resolution; complaint closed")


def end_user_reopen(
    db: Session, end_user: EndUser, complaint: Complaint, reason: str, at: datetime | None = None,
) -> None:
    _require_end_user_action(db, complaint, "reopen", at)
    reason = _clean_note(reason)
    if not reason:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please tell us why the issue is not resolved")
    now = at or utcnow()
    complaint.resolved_at = None
    complaint.closed_at = None
    complaint.reopen_count += 1
    change_status(db, complaint, REOPENED, end_user, note=reason, at=now, message="End user reopened the complaint",
                  public_message="You reopened the complaint")


def end_user_feedback(
    db: Session, end_user: EndUser, complaint: Complaint, rating: int, comment: str | None,
    at: datetime | None = None,
) -> None:
    _require_end_user_action(db, complaint, "feedback")
    now = at or utcnow()
    _store_feedback(db, complaint, rating, comment, now)
    record_event(
        db, complaint, "feedback", end_user,
        f"End user rated the resolution {rating}/5", public_message=f"You rated the resolution {rating}/5",
        note=complaint.feedback_comment, at=now,
    )
    notification_service.notify(
        db, _handlers(complaint), "complaint.feedback", f"{complaint.generated_id} rated {rating}/5",
        complaint.feedback_comment, complaint, at=now,
    )


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

def add_comment(
    db: Session,
    complaint: Complaint,
    author: User | EndUser,
    body: str,
    *,
    is_internal: bool = False,
    at: datetime | None = None,
    record: bool = True,
) -> ComplaintComment:
    """Adds a comment (and a timeline entry unless record=False). An end user reply
    to a WAITING_FOR_INFORMATION complaint puts it back in progress."""
    body = (body or "").strip()
    if not body:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Comment cannot be empty")
    if len(body) > COMMENT_MAX_LENGTH:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Comment is too long (max {COMMENT_MAX_LENGTH} characters)")
    now = at or utcnow()
    staff = isinstance(author, User)
    comment = ComplaintComment(
        complaint=complaint,
        author_type="staff" if staff else "end_user",
        author_id=author.id,
        author_name=author.name,
        body=body,
        is_internal=is_internal and staff,
        created_at=now,
    )
    db.add(comment)

    if record:
        gid = complaint.generated_id
        if comment.is_internal:
            record_event(db, complaint, "note_added", author, f"{author.name} added an internal note", at=now)
            notification_service.notify(
                db, _handlers(complaint), "complaint.note", f"Internal note on {gid} from {author.name}",
                body[:300], complaint, exclude=author, at=now,
            )
        elif staff:
            # A reply alone is not the response the SLA asks for (acknowledging or acting on it is),
            # so it leaves acknowledged_at and the response clock alone.
            record_event(db, complaint, "comment_added", author, f"{author.name} replied to the end user",
                         public_message="The team replied", at=now)
            notification_service.notify(
                db, [complaint.end_user], "complaint.reply", f"New reply on {gid}", body[:300], complaint, at=now,
            )
        else:
            record_event(db, complaint, "comment_added", author, "End user added a comment",
                         public_message="You added a comment", at=now)
            notification_service.notify(
                db, _handlers(complaint), "complaint.end_user_update", f"End user replied on {gid}",
                body[:300], complaint, at=now,
            )
            if complaint.status == WAITING:
                change_status(db, complaint, IN_PROGRESS, author, at=now,
                              message="End user provided the requested information; back in progress",
                              public_message="You provided the requested information; work continues")
    return comment
