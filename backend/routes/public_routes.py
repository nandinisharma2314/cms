"""Configuration both frontends need before anyone signs in."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from services import settings_service

router = APIRouter()


@router.get("/config")
def public_config(db: Session = Depends(get_db)):
    return settings_service.public_config(db)

class CheckIdentifierRequest(BaseModel):
    identifier: str

@router.post("/auth/check-identifier")
def check_identifier(payload: CheckIdentifierRequest, db: Session = Depends(get_db)):
    """Check if the given identifier belongs to a staff member (password), end user (OTP), or is not found."""
    from services.user_service import find_staff_by_identifier
    from models import EndUser
    from services.phone_service import phone_format
    from services.user_service import normalize_email

    identifier = (payload.identifier or "").strip()
    if not identifier:
        return {"status": "not_found", "method": None, "role": None}

    # Check EndUser first (prioritize OTP if shared)
    email = normalize_email(identifier)
    if email is not None:
        end_user = db.query(EndUser).filter(EndUser.email == email).first()
        if end_user:
            if not end_user.is_active:
                return {"status": "deactivated", "method": None, "role": "end_user", "message": "Your account is inactive. Please contact support."}
            return {"status": "found", "method": "otp", "role": "end_user", "channel": "email"}
    else:
        mobile = phone_format(db).normalize(identifier)
        if mobile is not None:
            end_user = db.query(EndUser).filter(EndUser.mobile == mobile).first()
            if end_user:
                if not end_user.is_active:
                    return {"status": "deactivated", "method": None, "role": "end_user", "message": "Your account is inactive. Please contact support."}
                return {"status": "found", "method": "otp", "role": "end_user", "channel": "sms"}

    # Fallback to Staff (Password)
    user = find_staff_by_identifier(db, identifier)
    if user:
        if not user.is_active:
            return {"status": "deactivated", "method": None, "role": "staff", "message": "This account has been deactivated. Please contact support."}
        return {"status": "found", "method": "password", "role": "staff"}

    return {"status": "not_found", "method": None, "role": None}
