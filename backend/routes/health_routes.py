from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db

router = APIRouter()


@router.get("")
def health_check(db: Session = Depends(get_db)):
    """Liveness and database connectivity, for load balancers and monitoring."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, {"server": "running", "database": "unreachable"}) from None
    return {"server": "running", "database": "connected"}
