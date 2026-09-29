"""Access and refresh tokens.

Refresh tokens are opaque, stored hashed, and rotate on every use. All tokens
descending from one sign-in share a family. Presenting a token that was
already rotated means it leaked, so the whole family is revoked, except
within REFRESH_TOKEN_REUSE_GRACE_SECONDS of the rotation, which covers two
browser tabs refreshing at the same moment.
"""
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from config import REFRESH_TOKEN_EXPIRES_DAYS, REFRESH_TOKEN_REUSE_GRACE_SECONDS
from models import EndUser, RefreshToken, User
from utils.security import (
    PRINCIPAL_END_USER, PRINCIPAL_STAFF, create_access_token, new_opaque_token, sha256_hex, utcnow,
)

Principal = User | EndUser


def principal_type_of(principal: Principal) -> str:
    return PRINCIPAL_STAFF if isinstance(principal, User) else PRINCIPAL_END_USER


def _new_refresh(db: Session, principal_type: str, principal_id: int, family_id: str) -> str:
    raw = new_opaque_token()
    db.add(RefreshToken(
        token_hash=sha256_hex(raw), family_id=family_id, principal_type=principal_type,
        principal_id=principal_id, expires_at=utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRES_DAYS),
    ))
    return raw


def issue(db: Session, principal: Principal) -> tuple[str, str]:
    """(access token, refresh token) for a fresh sign-in. Commits."""
    principal_type = principal_type_of(principal)
    raw_refresh = _new_refresh(db, principal_type, principal.id, new_opaque_token())
    db.commit()
    return create_access_token(principal_type, principal.id, principal.token_version), raw_refresh


def _revoke_family(db: Session, family_id: str) -> None:
    db.query(RefreshToken).filter(
        RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None),
    ).update({RefreshToken.revoked_at: utcnow()}, synchronize_session=False)


def rotate(db: Session, raw_refresh: str | None, principal_type: str) -> tuple[Principal, str, str]:
    """Exchanges a refresh token for a new pair. Returns (principal, access, refresh). Commits."""
    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has ended. Please sign in again.")
    if not raw_refresh:
        raise invalid
    token = (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == sha256_hex(raw_refresh))
        .with_for_update()
        .first()
    )
    now = utcnow()
    if token is None or token.principal_type != principal_type or token.expires_at < now:
        db.rollback()
        raise invalid
    if token.revoked_at is not None:
        # The grace only covers a token that was just rotated in a session that is still alive:
        # after sign-out, a password reset or "end all sessions" nothing in the family is honoured.
        within_grace = (
            token.replaced_at is not None
            and (now - token.replaced_at).total_seconds() <= REFRESH_TOKEN_REUSE_GRACE_SECONDS
            and db.query(RefreshToken.id).filter(
                RefreshToken.family_id == token.family_id, RefreshToken.revoked_at.is_(None),
            ).first() is not None
        )
        if not within_grace:
            _revoke_family(db, token.family_id)
            db.commit()
            raise invalid
    else:
        token.revoked_at = token.replaced_at = now

    model = User if principal_type == PRINCIPAL_STAFF else EndUser
    principal = db.get(model, token.principal_id)
    if principal is None or not principal.is_active:
        _revoke_family(db, token.family_id)
        db.commit()
        raise invalid
    raw_new = _new_refresh(db, principal_type, principal.id, token.family_id)
    db.commit()
    return principal, create_access_token(principal_type, principal.id, principal.token_version), raw_new


def revoke(db: Session, raw_refresh: str | None) -> None:
    """Signs out the session the token belongs to (its whole family). Commits."""
    if not raw_refresh:
        return
    token = db.query(RefreshToken).filter(RefreshToken.token_hash == sha256_hex(raw_refresh)).first()
    if token is not None:
        _revoke_family(db, token.family_id)
        db.commit()


def end_all_sessions(db: Session, principal: Principal) -> None:
    """Revokes every refresh token and invalidates every access token already
    issued to the principal (by bumping its token version). Does not commit."""
    principal.token_version += 1
    db.query(RefreshToken).filter(
        RefreshToken.principal_type == principal_type_of(principal),
        RefreshToken.principal_id == principal.id,
        RefreshToken.revoked_at.is_(None),
    ).update({RefreshToken.revoked_at: utcnow()}, synchronize_session=False)


def prune(db: Session) -> int:
    """Deletes refresh tokens that expired over a day ago. Commits."""
    count = db.query(RefreshToken).filter(RefreshToken.expires_at < utcnow() - timedelta(days=1)).delete(
        synchronize_session=False,
    )
    db.commit()
    return count
