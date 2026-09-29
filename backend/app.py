import asyncio
import contextlib
import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import models  # noqa: F401  (registers tables on Base.metadata)
from config import CORS_ORIGINS, IS_DEVELOPMENT, IS_PRODUCTION, WORKER_INTERVAL_SECONDS
from database import SessionLocal, engine
from routes import (
    audit_routes, auth_routes, complaint_routes, department_routes, end_user_routes, file_routes, health_routes,
    import_routes, location_routes, notification_routes, portal_routes, priority_routes, public_routes,
    rejection_routes, report_routes, role_routes, settings_routes, sla_routes, staff_grievance_routes, team_routes,
    user_routes,
)
from schema_version import schema_problem
from services import messaging, settings_service
from services.bootstrap_service import system_data_problems
from services.worker_service import run_forever
from utils.auth_middleware import CLIENT_HEADER

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Refuse to serve an unmigrated or unsynced database rather than fail on the first request.
    problem = schema_problem(engine)
    if problem:
        raise RuntimeError(f"Cannot start: {problem}")
    with SessionLocal() as db:
        problems = system_data_problems(db)
    if problems:
        raise RuntimeError(f"Cannot start: {'; '.join(problems)}; run `python manage.py migrate`")
    worker = asyncio.create_task(run_forever(WORKER_INTERVAL_SECONDS)) if WORKER_INTERVAL_SECONDS > 0 else None
    yield
    if worker is not None:
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker


# The interactive API docs are for development; production serves only the API.
app = FastAPI(
    title="Complaint management API",
    lifespan=lifespan,
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", CLIENT_HEADER],
    expose_headers=["Content-Disposition"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    # Responses that say who may frame them (attachment previews) don't also get a blanket DENY.
    if "frame-ancestors" not in response.headers.get("Content-Security-Policy", ""):
        response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    if IS_PRODUCTION:  # production runs behind HTTPS (COOKIE_SECURE is required there)
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.exception_handler(settings_service.SettingNotConfigured)
async def setting_not_configured_handler(request: Request, exc: settings_service.SettingNotConfigured):
    field_name = getattr(exc, "field", "unknown")
    label = getattr(exc, "label", field_name)
    print(
        f"\n{'='*25} [SYSTEM CONFIGURATION ERROR] {'='*25}\n"
        f"Missing required setting: '{field_name}' ({label})\n"
        f"Path: {request.method} {request.url.path}\n"
        f"Detail: {exc.detail}\n"
        f"Action required: Configure this setting in System Settings or run `python manage.py check`.\n"
        f"{'='*78}\n",
        file=sys.stderr,
        flush=True,
    )
    if request.url.path.startswith("/portal/auth"):
        return JSONResponse(
            status_code=503,
            content={
                "detail": "The service is temporarily unavailable due to a configuration issue. Please contact support or try again later."
            },
        )
    return JSONResponse(
        status_code=503,
        content={"detail": exc.detail},
    )


@app.exception_handler(messaging.MessageError)
async def message_error_handler(request: Request, exc: messaging.MessageError):
    print(
        f"\n{'='*25} [MESSAGE DELIVERY ERROR] {'='*25}\n"
        f"Path: {request.method} {request.url.path}\n"
        f"Detail: {exc}\n"
        f"Action required: Check SMS/Email configuration in backend/.env or your network connectivity.\n"
        f"{'='*74}\n",
        file=sys.stderr,
        flush=True,
    )
    if request.url.path.startswith("/portal"):
        return JSONResponse(
            status_code=502,
            content={
                "detail": "Could not send the verification code right now. Please try again in a few minutes or contact support."
            },
        )
    return JSONResponse(
        status_code=502,
        content={"detail": f"Message delivery failed: {exc}"},
    )


app.include_router(health_routes.router, prefix="/health", tags=["health"])
app.include_router(public_routes.router, prefix="/public", tags=["public"])
app.include_router(file_routes.router, prefix="/files", tags=["files"])
app.include_router(auth_routes.router, prefix="/auth", tags=["auth"])
app.include_router(settings_routes.router, prefix="/settings", tags=["settings"])
app.include_router(priority_routes.router, prefix="/priorities", tags=["priorities"])
app.include_router(user_routes.router, prefix="/users", tags=["users"])
app.include_router(role_routes.router, prefix="/roles", tags=["roles"])
app.include_router(department_routes.router, prefix="/departments", tags=["departments"])
app.include_router(location_routes.router, prefix="/locations", tags=["locations"])
app.include_router(end_user_routes.router, prefix="/end-users", tags=["end-users"])
app.include_router(audit_routes.router, prefix="/audit-logs", tags=["audit"])
app.include_router(notification_routes.router, prefix="/notifications", tags=["notifications"])
app.include_router(sla_routes.router, prefix="/sla", tags=["sla"])
app.include_router(rejection_routes.router, prefix="/rejection-requests", tags=["rejections"])
app.include_router(import_routes.router, prefix="/imports", tags=["imports"])
app.include_router(report_routes.router, prefix="/reports", tags=["reports"])
app.include_router(complaint_routes.router, prefix="/complaints", tags=["complaints"])
app.include_router(staff_grievance_routes.router, prefix="/grievances", tags=["grievances"])
app.include_router(team_routes.router, prefix="/team", tags=["team"])
app.include_router(portal_routes.router, prefix="/portal", tags=["portal"])


if __name__ == "__main__":
    from pathlib import Path
    import uvicorn

    backend_dir = str(Path(__file__).resolve().parent)
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    uvicorn.run("app:app", host=host, port=port, reload=IS_DEVELOPMENT)

