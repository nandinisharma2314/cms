from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from sqlalchemy.orm import Session

from database import get_db
from models import EndUser, Role, User
from services.access_service import AccessContext
from services.permission_catalog import END_USER_ROLE_KEY
from utils.security import PRINCIPAL_END_USER, PRINCIPAL_STAFF, decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _decode(credentials: HTTPAuthorizationCredentials | None) -> tuple[str, int]:
    if credentials is None:
        raise _unauthorized("Not authenticated")
    try:
        return decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Token has expired")
    except (jwt.InvalidTokenError, ValueError):
        raise _unauthorized("Invalid token")


def get_access_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AccessContext:
    """Authenticated staff user with their permissions and scopes. The user is
    reloaded on every request so role, scope and deactivation changes apply
    immediately rather than when the token expires."""
    principal_type, principal_id = _decode(credentials)
    if principal_type != PRINCIPAL_STAFF:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff account required")
    user = db.get(User, principal_id)
    if user is None or not user.is_active:
        raise _unauthorized("Account not found or deactivated")
    return AccessContext(db, user)


def require_permission(*permissions: str):
    """Dependency factory: the staff user must hold every listed permission."""
    def dependency(ctx: AccessContext = Depends(get_access_context)) -> AccessContext:
        for permission in permissions:
            ctx.require(permission)
        return ctx
    return dependency


def get_current_end_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> EndUser:
    principal_type, principal_id = _decode(credentials)
    if principal_type != PRINCIPAL_END_USER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "End user account required")
    end_user = db.get(EndUser, principal_id)
    if end_user is None or not end_user.is_active:
        raise _unauthorized("Account not found or deactivated")
    return end_user


def end_user_role(db: Session) -> Role | None:
    return db.query(Role).filter(Role.key == END_USER_ROLE_KEY).first()


def end_user_permissions(db: Session) -> frozenset[str]:
    """What end users may do, from the End User role. Read on every request so
    changes made on the Roles page apply immediately."""
    role = end_user_role(db)
    return frozenset(p.key for p in role.permissions) if role else frozenset()


def require_portal_permission(*permissions: str):
    """Dependency factory: the End User role must grant every listed permission."""
    def dependency(
        end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db),
    ) -> EndUser:
        granted = end_user_permissions(db)
        for permission in permissions:
            if permission not in granted:
                raise HTTPException(status.HTTP_403_FORBIDDEN, f"Missing permission: {permission}")
        return end_user
    return dependency
