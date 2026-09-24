from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from database import engine, Base
from routes import health_routes, auth_routes, complaint_routes

# Ensure uploads dir exists
os.makedirs("uploads", exist_ok=True)

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="CMS Backend")

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
app.include_router(complaint_routes.router, prefix="/complaints", tags=["complaints"])

if __name__ == '__main__':
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)
