from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional

from database import get_db
from models import Notification, Activity, Complaint, User
from utils.auth_middleware import get_current_user

router = APIRouter()

def format_time_ago(dt: datetime) -> str:
    now = datetime.utcnow()
    diff = now - dt
    seconds = int(diff.total_seconds())
    
    if seconds < 60:
        return "Just now"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} min ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} hour{'s' if hours > 1 else ''} ago"
    days = hours // 24
    if days < 7:
        return f"{days} day{'s' if days > 1 else ''} ago"
    return dt.strftime("%d %b")

def ensure_initial_data(db: Session, user_id: int):
    # If user has no notifications, create from existing complaints + general civic alerts
    count = db.query(Notification).filter(Notification.user_id == user_id).count()
    if count == 0:
        complaints = db.query(Complaint).filter(Complaint.user_id == user_id).order_by(Complaint.created_at.desc()).limit(5).all()
        for idx, c in enumerate(complaints):
            notif = Notification(
                user_id=user_id,
                title=f"Complaint Status: {c.status}",
                message=f"Your complaint {c.generated_id} ('{c.title}') is {c.status.lower()} in {c.department} Dept.",
                type="complaint_update",
                complaint_id=c.generated_id,
                is_read=idx > 1,
                created_at=c.created_at or datetime.utcnow()
            )
            db.add(notif)
            
            act = Activity(
                user_id=user_id,
                title=f"Complaint {c.status}",
                description=f"{c.generated_id} forwarded to {c.department} Department.",
                type="forwarded" if c.status == "Submitted" else "in_progress",
                complaint_id=c.generated_id,
                created_at=c.created_at or datetime.utcnow()
            )
            db.add(act)

        # Add general civic announcements
        db.add(Notification(
            user_id=user_id,
            title="Area Civic Notice",
            message="Scheduled municipal maintenance in Mansarovar on 25-26 Sep.",
            type="civic_alert",
            complaint_id=None,
            is_read=False,
            created_at=datetime.utcnow() - timedelta(hours=3)
        ))
        db.add(Activity(
            user_id=user_id,
            title="Civic Announcement",
            description="Scheduled maintenance & drainage pre-check on 25 Sep.",
            type="announcement",
            complaint_id=None,
            created_at=datetime.utcnow() - timedelta(hours=3)
        ))
        db.commit()

@router.get("/")
def get_notifications(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    ensure_initial_data(db, user_id)
    
    notifications = db.query(Notification).filter(Notification.user_id == user_id).order_by(Notification.created_at.desc()).all()
    unread_count = db.query(Notification).filter(Notification.user_id == user_id, Notification.is_read == False).count()
    
    result = []
    for n in notifications:
        result.append({
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "type": n.type,
            "complaint_id": n.complaint_id,
            "is_read": n.is_read,
            "time": format_time_ago(n.created_at),
            "created_at": n.created_at.isoformat()
        })
        
    return {
        "success": True,
        "unread_count": unread_count,
        "notifications": result
    }

@router.put("/{notif_id}/read")
def mark_read(notif_id: int, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    notif = db.query(Notification).filter(Notification.id == notif_id, Notification.user_id == current_user["id"]).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    notif.is_read = True
    db.commit()
    return {"success": True, "message": "Marked as read"}

@router.put("/read-all")
def mark_all_read(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    db.query(Notification).filter(Notification.user_id == current_user["id"]).update({Notification.is_read: True})
    db.commit()
    return {"success": True, "message": "All marked as read"}

@router.delete("/clear")
def clear_all(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    db.query(Notification).filter(Notification.user_id == current_user["id"]).delete()
    db.commit()
    return {"success": True, "message": "Notifications cleared"}

@router.get("/activities")
def get_activities(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    ensure_initial_data(db, user_id)
    
    activities = db.query(Activity).filter(Activity.user_id == user_id).order_by(Activity.created_at.desc()).all()
    
    result = []
    for a in activities:
        result.append({
            "id": a.id,
            "title": a.title,
            "desc": a.description,
            "type": a.type,
            "complaint_id": a.complaint_id,
            "time": format_time_ago(a.created_at),
            "created_at": a.created_at.isoformat()
        })
        
    return {
        "success": True,
        "activities": result
    }
