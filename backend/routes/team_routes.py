"""API routes for My Team dashboard, hierarchy inspection, and team workload control."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import Complaint, ComplaintAssignment, User, max_length
from services import audit_service, team_service
from services.access_service import AccessContext
from services.complaint_service import serialize_complaints
from services.user_service import serialize_users
from utils.auth_middleware import get_access_context, require_permission
from utils.text import single_line

router = APIRouter()


class AvailabilityToggleRequest(BaseModel):
    is_available: bool


class ReassignComplaintRequest(BaseModel):
    complaint_id: str
    new_assignee_id: int
    reason: str | None = None


@router.get("/dashboard")
def get_dashboard(
    date_from: date | None = None,
    date_to: date | None = None,
    direct_only: bool = False,
    ctx: AccessContext = Depends(require_permission("team.view")),
):
    """Team overview with aggregated performance metrics and per-member breakdown."""
    return team_service.get_team_dashboard(ctx, date_from, date_to, direct_only)


@router.get("/members")
def list_members(
    direct_only: bool = False,
    ctx: AccessContext = Depends(require_permission("team.view")),
):
    """Returns direct or recursive team members under the current manager."""
    db = ctx.db
    manager = ctx.user
    members = (
        team_service.get_direct_reports(db, manager.id)
        if direct_only
        else team_service.get_all_subordinates(db, manager.id)
    )
    return serialize_users(db, members, ctx)


@router.get("/members/{member_id}/complaints")
def member_complaints(
    member_id: int,
    ctx: AccessContext = Depends(require_permission("team.view")),
):
    """Returns active complaints assigned to a team member."""
    db = ctx.db
    # Verify member is under caller
    subordinates = {u.id for u in team_service.get_all_subordinates(db, ctx.user.id)}
    if not ctx.is_super_admin and member_id not in subordinates and member_id != ctx.user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User is not in your reporting line")

    complaints = (
        db.query(Complaint)
        .filter(Complaint.assigned_to_id == member_id)
        .order_by(Complaint.created_at.desc())
        .limit(100)
        .all()
    )
    return serialize_complaints(db, complaints)


@router.post("/members/{member_id}/availability")
def set_member_availability(
    member_id: int,
    payload: AvailabilityToggleRequest,
    request: Request,
    ctx: AccessContext = Depends(require_permission("team.manage")),
):
    """Manager override for team member availability (e.g. marking on unplanned leave)."""
    db = ctx.db
    subordinates = {u.id for u in team_service.get_all_subordinates(db, ctx.user.id)}
    if not ctx.is_super_admin and member_id not in subordinates and member_id != ctx.user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User is not in your reporting line")

    user = db.get(User, member_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    old_status = user.is_available
    user.is_available = payload.is_available
    db.commit()

    audit_service.record(
        db,
        actor=ctx.user,
        action="team.availability_override",
        entity_type="user",
        entity_id=str(user.id),
        summary=f"Changed {user.name} availability: {old_status} -> {payload.is_available}",
        request=request,
    )
    db.commit()

    return {"id": user.id, "name": user.name, "is_available": user.is_available}


@router.post("/reassign")
def reassign_complaint(
    payload: ReassignComplaintRequest,
    request: Request,
    ctx: AccessContext = Depends(require_permission("team.manage")),
):
    """Manager action: reassign a complaint to a team member."""
    db = ctx.db
    clean_reason = single_line(payload.reason, "Reason", max_length(ComplaintAssignment.reason), required=False)
    complaint = team_service.reassign_team_complaint(
        db, ctx, payload.complaint_id, payload.new_assignee_id, clean_reason
    )
    audit_service.record(
        db,
        actor=ctx.user,
        action="team.reassign_complaint",
        entity_type="complaint",
        entity_id=str(complaint.id),
        summary=f"Reassigned complaint {complaint.generated_id} to team member ID {payload.new_assignee_id}",
        request=request,
    )
    db.commit()
    return serialize_complaints(db, [complaint])[0]
