from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from sqlalchemy.orm import Session

from database import get_db
from models import EndUser, Role, User
from services.access_service import AccessContext
from services.permission_catalog import END_USER_ROLE_KEY
from utils.security import PRINCIPAL_END_USER, PRINCIPAL_STAFF, decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

# Cookie-authenticated endpoints (refresh, logout) also require this header. A
# cross-site page cannot add it without a CORS preflight, which only the
# configured frontend origins pass.
CLIENT_HEADER = "X-Requested-With"
CLIENT_HEADER_VALUE = "cms"


def require_client_header(request: Request) -> None:
    if request.headers.get(CLIENT_HEADER) != CLIENT_HEADER_VALUE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing client header")


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _decode(credentials: HTTPAuthorizationCredentials | None) -> tuple[str, int, int]:
    if credentials is None:
        raise _unauthorized("Not authenticated")
    try:
        return decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Token has expired") from None
    except (jwt.InvalidTokenError, ValueError):
        raise _unauthorized("Invalid token") from None


def _load_staff(credentials: HTTPAuthorizationCredentials | None, db: Session) -> User:
    principal_type, principal_id, version = _decode(credentials)
    if principal_type != PRINCIPAL_STAFF:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff account required")
    user = db.get(User, principal_id)
    if user is None or not user.is_active or user.token_version != version:
        raise _unauthorized("Your session has ended. Please sign in again.")
    return user


def get_access_context_allowing_password_change(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AccessContext:
    """For the few endpoints a user may call while they still have to replace
    a password someone else set (profile, change password)."""
    return AccessContext(db, _load_staff(credentials, db))


def get_access_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AccessContext:
    """Authenticated staff user with their permissions and scopes. The user is
    reloaded on every request so role, scope and deactivation changes apply
    immediately rather than when the token expires."""
    user = _load_staff(credentials, db)
    if user.must_change_password:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You must change your password before continuing.")
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
    principal_type, principal_id, version = _decode(credentials)
    if principal_type != PRINCIPAL_END_USER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "End user account required")
    end_user = db.get(EndUser, principal_id)
    if end_user is None or not end_user.is_active or end_user.token_version != version:
        raise _unauthorized("Your session has ended. Please sign in again.")
    return end_user


def end_user_role(db: Session) -> Role:
    role = db.query(Role).filter(Role.key == END_USER_ROLE_KEY).first()
    if role is None:
        raise RuntimeError("The End User role is missing; run `python manage.py migrate`")
    return role


def end_user_permissions(db: Session) -> frozenset[str]:
    """What end users may do, from the End User role. Read on every request so
    changes made on the Roles page apply immediately."""
    return frozenset(p.key for p in end_user_role(db).permissions)


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


def client_ip(request: Request) -> str:
    """The caller's address. Behind a reverse proxy, run uvicorn with
    --proxy-headers and --forwarded-allow-ips so this is the real client."""
    return request.client.host if request.client else "unknown"
