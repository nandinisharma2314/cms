"""The signed-in staff user's own in-app notifications."""
from fastapi import APIRouter, Depends

from services import notification_service
from services.access_service import AccessContext
from utils.auth_middleware import get_access_context

router = APIRouter()


@router.get("/")
def my_notifications(unread_only: bool = False, limit: int = 30, ctx: AccessContext = Depends(get_access_context)):
    return notification_service.list_for(ctx.db, "staff", ctx.user.id, unread_only, limit)


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, ctx: AccessContext = Depends(get_access_context)):
    notification_service.mark_read(ctx.db, "staff", ctx.user.id, notification_id)
    return {"success": True}


@router.post("/read-all")
def mark_all_read(ctx: AccessContext = Depends(get_access_context)):
    notification_service.mark_read(ctx.db, "staff", ctx.user.id)
    return {"success": True}
