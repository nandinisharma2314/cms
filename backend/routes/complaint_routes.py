from fastapi import APIRouter, Depends, HTTPException, status, Form, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil
import uuid
from datetime import datetime

from database import get_db
from models import Complaint, ComplaintAttachment
from utils.auth_middleware import get_current_user

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/")
def create_complaint(
    department: str = Form(...),
    category: str = Form(...),
    priority: str = Form(...),
    title: str = Form(...),
    description: str = Form(...),
    country: str = Form(None),
    state: str = Form(None),
    district: str = Form(None),
    city: str = Form(None),
    area: str = Form(None),
    additional_details: str = Form(None),
    files: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    # Generate unique ID (e.g. CMP-10231)
    import random
    gen_id = f"CMP-{random.randint(10000, 99999)}"

    # Create Complaint record
    db_complaint = Complaint(
        generated_id=gen_id,
        user_id=current_user["id"],
        department=department,
        category=category,
        priority=priority,
        title=title,
        description=description,
        country=country,
        state=state,
        district=district,
        city=city,
        area=area,
        additional_details=additional_details,
        status="Submitted"
    )
    db.add(db_complaint)
    db.commit()
    db.refresh(db_complaint)

    # Process and save files
    saved_files = []
    for file in files:
        if file.filename:
            # unique filename
            ext = os.path.splitext(file.filename)[1]
            unique_filename = f"{uuid.uuid4()}{ext}"
            file_path = os.path.join(UPLOAD_DIR, unique_filename)
            
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Save attachment record
            db_attachment = ComplaintAttachment(
                complaint_id=db_complaint.id,
                file_path=f"/uploads/{unique_filename}",
                file_type=file.content_type,
                file_name=file.filename
            )
            db.add(db_attachment)
            saved_files.append({
                "file_path": f"/uploads/{unique_filename}",
                "file_name": file.filename
            })
    
    db.commit()

    return {
        "success": True,
        "complaint_id": gen_id,
        "message": "Complaint registered successfully",
        "attachments": saved_files
    }

@router.get("/")
def get_complaints(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    complaints = db.query(Complaint).filter(Complaint.user_id == current_user["id"]).order_by(Complaint.created_at.desc()).all()
    
    result = []
    for c in complaints:
        attachments = [
            {
                "id": a.id,
                "file_path": a.file_path,
                "file_name": a.file_name,
                "file_type": a.file_type or "",
            }
            for a in c.attachments
        ]
        loc_parts = [p for p in [c.area, c.city] if p]
        location_str = ", ".join(loc_parts) if loc_parts else "N/A"
        result.append({
            "id": c.generated_id,
            "cmpId": c.generated_id,
            "generated_id": c.generated_id,
            "title": c.title,
            "description": c.description,
            "department": c.department,
            "category": c.category,
            "priority": c.priority,
            "status": c.status,
            "date": c.created_at.strftime("%d %b %Y"),
            "created_at": c.created_at.isoformat(),
            "location": location_str,
            "area": c.area or "",
            "city": c.city or "",
            "district": c.district or "",
            "state": c.state or "",
            "country": c.country or "",
            "additional_details": c.additional_details or "",
            "attachments": attachments
        })
    return result

@router.get("/stats")
def get_stats(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    total = db.query(Complaint).filter(Complaint.user_id == current_user["id"]).count()
    in_progress = db.query(Complaint).filter(Complaint.user_id == current_user["id"], Complaint.status == "In Progress").count()
    resolved = db.query(Complaint).filter(Complaint.user_id == current_user["id"], Complaint.status == "Resolved").count()
    open_count = db.query(Complaint).filter(Complaint.user_id == current_user["id"], Complaint.status != "Resolved").count()
    
    return {
        "total": total,
        "open": open_count,
        "in_progress": in_progress,
        "resolved": resolved
    }
