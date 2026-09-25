import asyncio
from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import engine, Base, SessionLocal
import models  # noqa: F401  (registers tables on Base.metadata)
from config import SLA_CHECK_INTERVAL_SECONDS
from routes import (
    audit_routes, auth_routes, complaint_routes, department_routes, end_user_routes, health_routes,
    import_routes, location_routes, report_routes, notification_routes, portal_routes, rejection_routes, role_routes, sla_routes, user_routes,
)
from services.bootstrap_service import ensure_system_data
from services.sla_scheduler import run_forever

# Ensure uploads dir exists
os.makedirs("uploads", exist_ok=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Create missing tables, then make sure permissions, system roles and
    # location levels exist (new permissions added in code appear here).
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        ensure_system_data(db)
    sla_task = asyncio.create_task(run_forever(SLA_CHECK_INTERVAL_SECONDS)) if SLA_CHECK_INTERVAL_SECONDS > 0 else None
    yield
    if sla_task is not None:
        sla_task.cancel()


app = FastAPI(title="CMS Backend", lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Update this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Include routers
app.include_router(health_routes.router, prefix="/health", tags=["health"])
app.include_router(auth_routes.router, prefix="/auth", tags=["auth"])
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

if __name__ == '__main__':
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)
