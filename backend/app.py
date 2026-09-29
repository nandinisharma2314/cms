import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

import models  # noqa: F401  (registers tables on Base.metadata)
from config import CORS_ORIGINS, IS_PRODUCTION, WORKER_INTERVAL_SECONDS
from database import SessionLocal, engine
from routes import (
    audit_routes, auth_routes, complaint_routes, department_routes, end_user_routes, file_routes, health_routes,
    import_routes, location_routes, notification_routes, portal_routes, priority_routes, public_routes,
    rejection_routes, report_routes, role_routes, settings_routes, sla_routes, user_routes,
)
from schema_version import schema_problem
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
app.include_router(portal_routes.router, prefix="/portal", tags=["portal"])
