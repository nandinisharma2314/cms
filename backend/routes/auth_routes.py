from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import jwt
from datetime import datetime, timedelta
import os
import secrets
from database import get_db
from models import User, RefreshToken, Otp
from utils.auth_middleware import get_current_user
import random
from twilio.rest import Client
import smtplib
from email.message import EmailMessage

router = APIRouter()

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "super-secret-key-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRES_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", "15"))
REFRESH_TOKEN_EXPIRES_DAYS = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES_DAYS", "7"))

class SendOtpRequest(BaseModel):
    mobile: str = None
    email: str = None
    method: str

class VerifyOtpRequest(BaseModel):
    target: str # mobile or email
    otp: str

class RefreshRequest(BaseModel):
    refresh_token: str

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    language: Optional[str] = None
    notify_sms: Optional[bool] = None
    notify_email: Optional[bool] = None
    notify_alerts: Optional[bool] = None

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(user_id: int, db: Session):
    token = secrets.token_hex(32)
    expires_at = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRES_DAYS)
    
    db_token = RefreshToken(token=token, user_id=user_id, expires_at=expires_at)
    db.add(db_token)
    db.commit()
    db.refresh(db_token)
    
    return token

@router.post("/send-otp")
def send_otp(request: SendOtpRequest, db: Session = Depends(get_db)):
    target = request.mobile if request.method == 'mobile' else request.email
    if not target:
        raise HTTPException(status_code=400, detail="Target is required.")
        
    target = target.strip()
    
    # Check if user is pre-registered
    if request.method == 'mobile':
        clean_digits = "".join(filter(str.isdigit, target))
        last10 = clean_digits[-10:] if len(clean_digits) >= 10 else clean_digits
        if last10:
            user = db.query(User).filter((User.mobile == target) | (User.mobile.like(f"%{last10}%"))).first()
        else:
            user = db.query(User).filter(User.mobile == target).first()
    else:
        user = db.query(User).filter(User.email.ilike(target)).first()

    if not user:
        raise HTTPException(status_code=400, detail="User not found. Only registered users can log in.")
        
    otp_code = str(random.randint(100000, 999999))
    expires_at = datetime.utcnow() + timedelta(minutes=15)
    
    # Store OTP using canonical user target
    actual_target = user.mobile if request.method == 'mobile' else user.email
    print(f"\n==============================================", flush=True)
    print(f"--- DEV MODE: OTP for {actual_target} is {otp_code} ---", flush=True)
    print(f"==============================================\n", flush=True)
    
    db_otp = Otp(target=actual_target, code=otp_code, expires_at=expires_at)
    db.add(db_otp)
    db.commit()
    
    if os.getenv("ENVIRONMENT") == "development":
        pass
    else:
        if request.method == 'mobile':
            try:
                client = Client(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"))
                client.messages.create(
                    body=f"Your CMS verification code is {otp_code}",
                    from_=os.getenv("TWILIO_PHONE_NUMBER"),
                    to=target
                )
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to send SMS: {str(e)}")
        else:
            try:
                msg = EmailMessage()
                msg.set_content(f"Your CMS verification code is {otp_code}")
                msg['Subject'] = 'CMS Login Verification'
                msg['From'] = os.getenv("SMTP_USERNAME")
                msg['To'] = target
                
                with smtplib.SMTP(os.getenv("SMTP_SERVER"), int(os.getenv("SMTP_PORT", 587))) as server:
                    server.starttls()
                    server.login(os.getenv("SMTP_USERNAME"), os.getenv("SMTP_PASSWORD"))
                    server.send_message(msg)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to send Email: {str(e)}")

    res = {"success": True, "message": "OTP sent successfully"}
    if os.getenv("ENVIRONMENT") == "development":
        res["dev_otp"] = otp_code
    return res

@router.post("/verify-otp")
def verify_otp(request: VerifyOtpRequest, db: Session = Depends(get_db)):
    target = request.target.strip()
    clean_digits = "".join(filter(str.isdigit, target))
    last10 = clean_digits[-10:] if len(clean_digits) >= 10 else clean_digits
    
    if "@" in target:
        user = db.query(User).filter(User.email.ilike(target)).first()
    else:
        if last10:
            user = db.query(User).filter(
                (User.mobile == target) | 
                (User.mobile.like(f"%{last10}%"))
            ).first()
        else:
            user = db.query(User).filter(User.mobile == target).first()

    if not user:
        return {"success": False, "error": "User not registered."}

    # Find valid OTP for this user's mobile or email or request target
    valid_otp = db.query(Otp).filter(
        (Otp.target == target) | (Otp.target == user.mobile) | (Otp.target == user.email),
        Otp.code == request.otp.strip(),
        Otp.expires_at > datetime.utcnow()
    ).order_by(Otp.id.desc()).first()
    
    if not valid_otp:
        return {"success": False, "error": "Invalid or expired verification code."}
    
    # Generate tokens
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRES_MINUTES)
    access_token = create_access_token(
        data={"sub": user.id, "role": user.role}, expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(user.id, db)
    
    # Invalidate used OTP
    db.delete(valid_otp)
    db.commit()
    
    return {
        "success": True, 
        "access_token": access_token, 
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "mobile": user.mobile,
            "email": user.email,
            "dob": user.dob,
            "gender": user.gender,
            "address": user.address,
            "role": user.role,
            "language": user.language,
            "notify_sms": user.notify_sms,
            "notify_email": user.notify_email,
            "notify_alerts": user.notify_alerts
        }
    }

@router.post("/refresh")
def refresh_token(request: RefreshRequest, db: Session = Depends(get_db)):
    db_token = db.query(RefreshToken).filter(RefreshToken.token == request.refresh_token).first()
    
    if not db_token or db_token.revoked or db_token.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")
    
    # Revoke old token
    db_token.revoked = True
    db.commit()
    
    # Get user
    user = db.query(User).filter(User.id == db_token.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        
    # Generate new tokens
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRES_MINUTES)
    access_token = create_access_token(
        data={"sub": user.id, "role": user.role}, expires_delta=access_token_expires
    )
    new_refresh_token = create_refresh_token(user.id, db)
    
    return {
        "success": True,
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }

@router.get("/me")
def get_me(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user = db.query(User).filter(User.id == current_user["id"]).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {
        "success": True,
        "user": {
            "id": user.id,
            "name": user.name or "",
            "email": user.email or "",
            "mobile": user.mobile or "",
            "dob": user.dob or "",
            "gender": user.gender or "",
            "address": user.address or "",
            "role": user.role or "citizen",
            "language": user.language or "English (India)",
            "notify_sms": user.notify_sms,
            "notify_email": user.notify_email,
            "notify_alerts": user.notify_alerts
        }
    }

@router.put("/profile")
def update_profile(request: UpdateProfileRequest, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user = db.query(User).filter(User.id == current_user["id"]).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    if request.name is not None and request.name.strip():
        user.name = request.name.strip()

    if request.email is not None:
        new_email = request.email.strip()
        if new_email:
            # Check if email is already taken by another user (case-insensitive)
            existing = db.query(User).filter(
                User.email.ilike(new_email),
                User.id != user.id
            ).first()
            if existing:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already registered with another account")
            user.email = new_email
        else:
            # If user registered with mobile, email can be cleared
            if not user.mobile:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email cannot be empty for email-based account")
            user.email = None

    if request.mobile is not None:
        new_mobile = request.mobile.strip()
        if new_mobile:
            # Extract last 10 digits for clean match
            clean_digits = "".join(filter(str.isdigit, new_mobile))
            last10 = clean_digits[-10:] if len(clean_digits) >= 10 else clean_digits
            existing = db.query(User).filter(
                (User.mobile == new_mobile) | (User.mobile.like(f"%{last10}%")),
                User.id != user.id
            ).first() if last10 else None
            
            if existing:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mobile number is already registered with another account")
            user.mobile = new_mobile
        else:
            if not user.email:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mobile number cannot be empty for mobile-based account")
            user.mobile = None
            
    if request.dob is not None: user.dob = request.dob
    if request.gender is not None: user.gender = request.gender
    if request.address is not None: user.address = request.address
    if request.language is not None: user.language = request.language
    if request.notify_sms is not None: user.notify_sms = request.notify_sms
    if request.notify_email is not None: user.notify_email = request.notify_email
    if request.notify_alerts is not None: user.notify_alerts = request.notify_alerts
        
    db.commit()
    db.refresh(user)
    
    return {
        "success": True,
        "message": "Profile updated successfully",
        "user": {
            "id": user.id,
            "name": user.name or "",
            "email": user.email or "",
            "mobile": user.mobile or "",
            "dob": user.dob or "",
            "gender": user.gender or "",
            "address": user.address or "",
            "role": user.role or "citizen",
            "language": user.language or "English (India)",
            "notify_sms": user.notify_sms,
            "notify_email": user.notify_email,
            "notify_alerts": user.notify_alerts
        }
    }


