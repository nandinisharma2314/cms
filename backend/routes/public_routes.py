"""Configuration both frontends need before anyone signs in."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from services import settings_service

router = APIRouter()


@router.get("/config")
def public_config(db: Session = Depends(get_db)):
    return settings_service.public_config(db)
