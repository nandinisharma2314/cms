from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from config import REFRESH_TOKEN_EXPIRES_DAYS
from models import RefreshToken
from utils.security import create_access_token, new_opaque_token, sha256_hex, utcnow


def issue_token_pair(db: Session, principal_type: str, principal_id: int) -> dict:
    """Creates an access token and a stored refresh token. Commits."""
    raw_refresh = new_opaque_token()
    db.add(RefreshToken(
        token_hash=sha256_hex(raw_refresh),
        principal_type=principal_type,
        principal_id=principal_id,
        expires_at=utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRES_DAYS),
    ))
    db.commit()
    return {
        "access_token": create_access_token(principal_type, principal_id),
        "refresh_token": raw_refresh,
        "token_type": "bearer",
    }


def consume_refresh_token(db: Session, raw_refresh: str) -> RefreshToken:
    """Revokes a valid refresh token and returns it (rotation). Does not commit."""
    token = db.query(RefreshToken).filter(RefreshToken.token_hash == sha256_hex(raw_refresh)).first()
    if token is None or token.revoked_at is not None or token.expires_at < utcnow():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")
    token.revoked_at = utcnow()
    return token


def revoke_all_for(db: Session, principal_type: str, principal_id: int) -> None:
    """Revokes every live refresh token of a principal. Does not commit."""
    db.query(RefreshToken).filter(
        RefreshToken.principal_type == principal_type,
        RefreshToken.principal_id == principal_id,
        RefreshToken.revoked_at.is_(None),
    ).update({RefreshToken.revoked_at: utcnow()}, synchronize_session=False)
