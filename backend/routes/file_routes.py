"""Attachment downloads through signed, expiring links (see attachment_service)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from services import attachment_service

router = APIRouter()


@router.get("/{attachment_id}")
def download(attachment_id: int, expires: int, signature: str, db: Session = Depends(get_db)):
    return attachment_service.serve(db, attachment_id, expires, signature)


@router.get("/serve/{file_path:path}")
def serve_public_file(file_path: str):
    """Serves uploaded public assets such as user profile pictures."""
    from fastapi import HTTPException
    from fastapi.responses import FileResponse, Response
    from config import UPLOAD_DIR
    from services import storage_service

    if storage_service.is_r2_enabled():
        try:
            data, content_type = storage_service.get_file(file_path)
            return Response(
                content=data,
                media_type=content_type or "image/jpeg",
                headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"},
            )
        except Exception:
            raise HTTPException(404, "File not found")

    local_path = UPLOAD_DIR / file_path
    if not local_path.is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(
        local_path,
        headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )

