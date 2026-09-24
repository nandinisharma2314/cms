from queries.health_queries import check_db_connection
from sqlalchemy.orm import Session

def check_health(db: Session):
    """Service layer logic to determine system health."""
    db_status = check_db_connection(db)
    
    return {
        "server": "running",
        "database": "connected" if db_status else "disconnected",
        "version": "1.0.0"
    }
