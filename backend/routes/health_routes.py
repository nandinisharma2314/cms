from fastapi import APIRouter, HTTPException, status
from services.health_service import check_health
from fastapi import Depends
from sqlalchemy.orm import Session
from database import get_db

router = APIRouter()

@router.get("/")
def health_check(db: Session = Depends(get_db)):
    """API Endpoint to check the health of the server and database."""
    status_dict = check_health(db)
    
    if status_dict['database'] == 'connected':
        return status_dict
    else:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=status_dict)
