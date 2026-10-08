from typing import Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from services import reward_service
from services.access_service import AccessContext
from utils.auth_middleware import get_access_context, require_permission

router = APIRouter(prefix="/rewards", tags=["rewards"])


class RewardSettingsUpdate(BaseModel):
    is_enabled: bool | None = None
    currency_name: str | None = None
    currency_symbol: str | None = None
    eligible_roles: list[str] | None = None
    points_on_time_resolution: int | None = Field(default=None, ge=0)
    points_speed_bonus: int | None = Field(default=None, ge=0)
    points_five_star: int | None = Field(default=None, ge=0)
    points_four_star: int | None = Field(default=None, ge=0)
    points_zero_reopen: int | None = Field(default=None, ge=0)
    streak_interval: int | None = Field(default=None, ge=1)
    streak_bonus: int | None = Field(default=None, ge=0)
    priority_multipliers: dict[str, float] | None = None


class ManualAdjustmentRequest(BaseModel):
    user_id: int
    points: int
    description: str = Field(..., min_length=2, max_length=255)


@router.get("/settings")
def get_settings(
    ctx: AccessContext = Depends(require_permission("rewards.manage")),
):
    settings = reward_service.get_reward_settings(ctx.db)
    return reward_service.serialize_reward_settings(settings)


@router.put("/settings")
def update_settings(
    payload: RewardSettingsUpdate,
    ctx: AccessContext = Depends(require_permission("rewards.manage")),
):
    data = payload.model_dump(exclude_unset=True)
    return reward_service.update_reward_settings(ctx.db, data, ctx.user)


@router.get("/me")
def get_my_rewards(
    ctx: AccessContext = Depends(require_permission("rewards.view")),
):
    return reward_service.get_user_rewards_summary(ctx.db, ctx.user.id)


@router.get("/leaderboard")
def get_leaderboard(
    timeframe: str = Query("month", pattern="^(today|week|month|all)$"),
    department_id: int | None = None,
    location_id: int | None = None,
    limit: int = Query(20, ge=1, le=100),
    ctx: AccessContext = Depends(require_permission("rewards.view")),
):
    return reward_service.get_leaderboard(
        ctx.db, timeframe=timeframe, department_id=department_id, location_id=location_id, limit=limit
    )


@router.get("/admin/transactions")
def list_transactions(
    date_from: str | None = None,
    date_to: str | None = None,
    department_id: int | None = None,
    location_id: int | None = None,
    manager_id: int | None = None,
    supervisor_id: int | None = None,
    user_id: int | None = None,
    rule_type: str | None = None,
    complaint_id: str | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    ctx: AccessContext = Depends(require_permission("rewards.view")),
):
    return reward_service.list_reward_transactions(
        ctx.db,
        page=page,
        page_size=page_size,
        date_from=date_from,
        date_to=date_to,
        department_id=department_id,
        location_id=location_id,
        manager_id=manager_id,
        supervisor_id=supervisor_id,
        user_id=user_id,
        rule_type=rule_type,
        complaint_id=complaint_id,
        q=q,
    )


@router.get("/admin/stats")
def get_stats(
    date_from: str | None = None,
    date_to: str | None = None,
    department_id: int | None = None,
    location_id: int | None = None,
    manager_id: int | None = None,
    supervisor_id: int | None = None,
    user_id: int | None = None,
    rule_type: str | None = None,
    complaint_id: str | None = None,
    q: str | None = None,
    ctx: AccessContext = Depends(require_permission("rewards.view")),
):
    return reward_service.get_reward_stats(
        ctx.db,
        date_from=date_from,
        date_to=date_to,
        department_id=department_id,
        location_id=location_id,
        manager_id=manager_id,
        supervisor_id=supervisor_id,
        user_id=user_id,
        rule_type=rule_type,
        complaint_id=complaint_id,
        q=q,
    )


@router.get("/admin/export")
def export_transactions(
    date_from: str | None = None,
    date_to: str | None = None,
    department_id: int | None = None,
    location_id: int | None = None,
    manager_id: int | None = None,
    supervisor_id: int | None = None,
    user_id: int | None = None,
    rule_type: str | None = None,
    complaint_id: str | None = None,
    q: str | None = None,
    ctx: AccessContext = Depends(require_permission("rewards.manage")),
):
    return reward_service.export_reward_transactions_csv(
        ctx.db,
        date_from=date_from,
        date_to=date_to,
        department_id=department_id,
        location_id=location_id,
        manager_id=manager_id,
        supervisor_id=supervisor_id,
        user_id=user_id,
        rule_type=rule_type,
        complaint_id=complaint_id,
        q=q,
    )


@router.post("/admin/adjust", status_code=status.HTTP_201_CREATED)
def manual_adjustment(
    payload: ManualAdjustmentRequest,
    ctx: AccessContext = Depends(require_permission("rewards.manage")),
):
    tx = reward_service.award_manual_points(
        ctx.db,
        user_id=payload.user_id,
        points=payload.points,
        description=payload.description,
        admin_user=ctx.user,
    )
    return reward_service.serialize_transaction(tx)


class RedeemPerkRequest(BaseModel):
    perk_id: int
    notes: str | None = None


class UpdateRedemptionRequest(BaseModel):
    status: str
    admin_notes: str | None = None


@router.get("/perks")
def list_perks(
    include_inactive: bool = False,
    ctx: AccessContext = Depends(require_permission("rewards.view")),
):
    return reward_service.list_perks(ctx.db, include_inactive=include_inactive)


@router.post("/perks/redeem", status_code=status.HTTP_201_CREATED)
def redeem_perk(
    payload: RedeemPerkRequest,
    ctx: AccessContext = Depends(require_permission("rewards.view")),
):
    redemption = reward_service.redeem_perk(
        ctx.db, ctx.user, payload.perk_id, payload.notes
    )
    return {
        "id": redemption.id,
        "perk_title": redemption.perk.title,
        "points_spent": redemption.points_spent,
        "status": redemption.status,
        "created_at": redemption.created_at.isoformat(),
    }


@router.get("/admin/redemptions")
def list_redemptions(
    user_id: int | None = None,
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    ctx: AccessContext = Depends(require_permission("rewards.view")),
):
    filter_user_id = user_id
    if not ctx.has("rewards.manage") and not ctx.user.is_super_admin:
        filter_user_id = ctx.user.id

    return reward_service.list_redemptions(
        ctx.db,
        user_id=filter_user_id,
        status_filter=status_filter,
        page=page,
        page_size=page_size,
    )


@router.put("/admin/redemptions/{redemption_id}")
def update_redemption(
    redemption_id: int,
    payload: UpdateRedemptionRequest,
    ctx: AccessContext = Depends(require_permission("rewards.manage")),
):
    r = reward_service.update_redemption_status(
        ctx.db,
        redemption_id=redemption_id,
        new_status=payload.status,
        admin_notes=payload.admin_notes,
        admin_user=ctx.user,
    )
    return {
        "id": r.id,
        "status": r.status,
        "admin_notes": r.admin_notes,
        "updated_at": r.updated_at.isoformat(),
    }


@router.post("/admin/backfill")
def backfill_rewards(
    ctx: AccessContext = Depends(require_permission("rewards.manage")),
):
    return reward_service.backfill_historical_rewards(ctx.db)

