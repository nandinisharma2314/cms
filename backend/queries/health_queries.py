from sqlalchemy.orm import Session
from sqlalchemy import text

def check_db_connection(db: Session):
    """Query layer to verify database connection via SQLAlchemy."""
    try:
        db.execute(text('SELECT 1'))
        return True
    except Exception as e:
        print(f"Database connection failed: {e}")
        return False
