"""The httpOnly cookie that carries a refresh token. JavaScript never sees it;
each app keeps only its short-lived access token in memory."""
from fastapi import Request, Response

from config import COOKIE_DOMAIN, COOKIE_SAMESITE, COOKIE_SECURE, REFRESH_TOKEN_EXPIRES_DAYS
from utils.security import PRINCIPAL_END_USER, PRINCIPAL_STAFF

COOKIE_NAMES = {PRINCIPAL_STAFF: "cms_refresh_staff", PRINCIPAL_END_USER: "cms_refresh_end_user"}
COOKIE_PATH = "/"


def set_refresh_cookie(response: Response, principal_type: str, raw_refresh: str) -> None:
    response.set_cookie(
        COOKIE_NAMES[principal_type], raw_refresh,
        max_age=REFRESH_TOKEN_EXPIRES_DAYS * 24 * 3600, path=COOKIE_PATH, domain=COOKIE_DOMAIN,
        secure=COOKIE_SECURE, httponly=True, samesite=COOKIE_SAMESITE,
    )


def clear_refresh_cookie(response: Response, principal_type: str) -> None:
    response.delete_cookie(
        COOKIE_NAMES[principal_type], path=COOKIE_PATH, domain=COOKIE_DOMAIN,
        secure=COOKIE_SECURE, httponly=True, samesite=COOKIE_SAMESITE,
    )


def read_refresh_cookie(request: Request, principal_type: str) -> str | None:
    return request.cookies.get(COOKIE_NAMES[principal_type])
