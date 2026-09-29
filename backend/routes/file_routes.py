"""Attachment downloads through signed, expiring links (see attachment_service)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from services import attachment_service

router = APIRouter()


@router.get("/{attachment_id}")
def download(attachment_id: int, expires: int, signature: str, db: Session = Depends(get_db)):
    return attachment_service.serve(db, attachment_id, expires, signature)
