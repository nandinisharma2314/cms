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
    """Check if the given identifier belongs to a staff member (password) or end user (OTP)."""
    from services.user_service import find_staff_by_identifier
    from models import EndUser
    from services.phone_service import phone_format
    from services.user_service import normalize_email

    identifier = (payload.identifier or "").strip()
    if not identifier:
        return {"method": "otp"}

    # Check EndUser first (prioritize OTP if shared)
    email = normalize_email(identifier)
    if email is not None:
        if db.query(EndUser).filter(EndUser.email == email).first():
            return {"method": "otp"}
    else:
        mobile = phone_format(db).normalize(identifier)
        if mobile is not None and db.query(EndUser).filter(EndUser.mobile == mobile).first():
            return {"method": "otp"}

    # Fallback to Staff (Password)
    user = find_staff_by_identifier(db, identifier)
    if user and user.is_active:
        return {"method": "password"}

    return {"method": "otp"}
