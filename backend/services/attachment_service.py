"""Complaint attachments.

Files are written under UPLOAD_DIR with random names and are never served
statically. Uploads are streamed to disk with the size limit enforced while
reading, and the file's leading bytes must match its extension (so a script
renamed to .jpg is refused). Downloads use signed links that expire after
ATTACHMENT_URL_TTL_SECONDS; the API only hands those links to people allowed
to see the attachment.
"""
import os
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from config import ATTACHMENT_URL_TTL_SECONDS, CORS_ORIGINS, UPLOAD_DIR
from models import Complaint, ComplaintAttachment, ComplaintComment, EndUser, User, max_length
from services import settings_service
from utils.security import sign_value, signature_valid, unix_now

CHUNK = 64 * 1024

# Leading-byte signatures per extension; "office" = OLE (doc) or ZIP (docx).
_SIGNATURES = {
    "jpg": [b"\xff\xd8\xff"], "jpeg": [b"\xff\xd8\xff"],
    "png": [b"\x89PNG\r\n\x1a\n"],
    "gif": [b"GIF87a", b"GIF89a"],
    "webp": [b"RIFF"],
    "pdf": [b"%PDF-"],
    "doc": [b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"],
    "docx": [b"PK\x03\x04"],
}
_CONTENT_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp",
    "pdf": "application/pdf", "mp4": "video/mp4", "mov": "video/quicktime", "csv": "text/csv",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
# Types a browser may display inline; everything else is downloaded.
_INLINE = {"image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "video/mp4", "video/quicktime"}


def _matches_signature(ext: str, head: bytes) -> bool:
    if ext == "webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    if ext in ("mp4", "mov"):
        return head[4:8] in (b"ftyp", b"moov", b"mdat", b"wide", b"free")
    if ext == "csv":
        try:
            head.decode("utf-8")
        except UnicodeDecodeError:
            return False
        return b"\x00" not in head
    return any(head.startswith(sig) for sig in _SIGNATURES[ext])


class StoredFiles:
    """Files written during a request; delete them if the database write fails."""

    def __init__(self):
        self.paths: list[Path] = []
        self.keys: list[str] = []

    def discard(self) -> None:
        for path in self.paths:
            path.unlink(missing_ok=True)
        self.paths.clear()
        if self.keys:
            from services import storage_service
            for key in self.keys:
                storage_service.delete_file(key)
            self.keys.clear()


def _extension(filename: str) -> str:
    return os.path.splitext(filename)[1].lower().lstrip(".")


def _display_name(filename: str, ext: str) -> str:
    """The original file name, shortened to fit its column without losing the extension."""
    name = os.path.basename(filename)
    limit = max_length(ComplaintAttachment.file_name)
    if len(name) <= limit:
        return name
    stem = name[: -(len(ext) + 1)]
    return f"{stem[:limit - len(ext) - 1]}.{ext}"


def save_attachments(
    db: Session,
    complaint: Complaint,
    files: list[UploadFile],
    uploader: User | EndUser,
    stored: StoredFiles,
    comment: ComplaintComment | None = None,
) -> list[ComplaintAttachment]:
    """Validates and writes the uploads, adding attachment rows to the session.
    Written files are recorded in `stored` so the caller can remove them if
    the transaction is not committed."""
    files = [f for f in files if f.filename]
    if not files:
        return []
    allowed = settings_service.allowed_attachment_types(db)
    max_count = settings_service.require(db, "max_attachments_per_complaint")
    max_bytes = settings_service.require(db, "max_attachment_mb") * 1024 * 1024
    existing = len(complaint.attachments)
    if existing + len(files) > max_count:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"A complaint can have at most {max_count} attachments; "
                            f"{max(0, max_count - existing)} more can be added")
    for upload in files:
        ext = _extension(upload.filename)
        if ext not in allowed or ext not in settings_service.SUPPORTED_ATTACHMENT_TYPES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                f"{upload.filename}: file type not allowed (allowed: {', '.join(allowed)})")

    from services import storage_service

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    rows = []
    for upload in files:
        ext = _extension(upload.filename)
        storage_name = f"{uuid.uuid4().hex}.{ext}"
        size = 0
        head = b""
        buffer = bytearray()
        while chunk := upload.file.read(CHUNK):
            if len(head) < 16:
                head += chunk[:16 - len(head)]
            size += len(chunk)
            if size > max_bytes:
                raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                    f"{upload.filename} is larger than {max_bytes // (1024 * 1024)} MB")
            buffer.extend(chunk)

        if size == 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{upload.filename} is empty")
        if not _matches_signature(ext, head):
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                f"{upload.filename} does not look like a .{ext} file")

        if storage_service.is_r2_enabled():
            storage_service.get_s3_client().put_object(
                Bucket=storage_service.R2_BUCKET,
                Key=storage_name,
                Body=bytes(buffer),
                ContentType=_CONTENT_TYPES[ext],
            )
            stored.keys.append(storage_name)
        else:
            path = UPLOAD_DIR / storage_name
            stored.paths.append(path)
            with open(path, "wb") as out:
                out.write(buffer)

        row = ComplaintAttachment(
            complaint=complaint, comment=comment, storage_name=storage_name,
            content_type=_CONTENT_TYPES[ext], file_name=_display_name(upload.filename, ext), file_size=size,
            uploaded_by_type="staff" if isinstance(uploader, User) else "end_user", uploaded_by_id=uploader.id,
        )
        db.add(row)
        rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# Signed download links
# ---------------------------------------------------------------------------

def signed_url(attachment: ComplaintAttachment) -> str:
    # The expiry is rounded up to a step, so a page that refreshes gets the same links for a while
    # and the browser can reuse the files it already has; every link stays valid for at least the TTL.
    step = max(1, ATTACHMENT_URL_TTL_SECONDS // 3)
    expires = -(-(unix_now() + ATTACHMENT_URL_TTL_SECONDS) // step) * step
    return f"/files/{attachment.id}?expires={expires}&signature={sign_value(f'attachment:{attachment.id}', expires)}"


def serve(db: Session, attachment_id: int, expires: int, signature: str):
    if not signature_valid(f"attachment:{attachment_id}", expires, signature):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This download link has expired. Reopen the complaint to get a new one.")
    attachment = db.get(ComplaintAttachment, attachment_id)
    if attachment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")

    from services import storage_service
    from fastapi.responses import RedirectResponse, Response

    inline = attachment.content_type in _INLINE
    if not inline:
        policy = "sandbox; frame-ancestors 'none'"
    elif attachment.content_type == "application/pdf":
        policy = f"frame-ancestors {' '.join(CORS_ORIGINS)}"
    else:
        policy = f"sandbox; frame-ancestors {' '.join(CORS_ORIGINS)}"

    if storage_service.is_r2_enabled():
        presigned = storage_service.get_presigned_url(attachment.storage_name, expires_in=max(60, expires - unix_now()))
        if presigned:
            return RedirectResponse(presigned, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
        try:
            data, _ = storage_service.get_file(attachment.storage_name)
            return Response(
                content=data,
                media_type=attachment.content_type,
                headers={
                    "Content-Disposition": f"{'inline' if inline else 'attachment'}; filename=\"{attachment.file_name}\"",
                    "Cache-Control": f"private, max-age={max(0, expires - unix_now())}",
                    "Content-Security-Policy": policy,
                    "X-Content-Type-Options": "nosniff",
                },
            )
        except Exception:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found in storage")

    path = UPLOAD_DIR / attachment.storage_name
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return FileResponse(
        path, media_type=attachment.content_type, filename=attachment.file_name,
        content_disposition_type="inline" if inline else "attachment",
        headers={"Cache-Control": f"private, max-age={max(0, expires - unix_now())}", "Content-Security-Policy": policy,
                 "X-Content-Type-Options": "nosniff"},
    )


def serialize(attachment: ComplaintAttachment) -> dict:
    return {
        "id": attachment.id,
        "url": signed_url(attachment),
        "file_name": attachment.file_name,
        "content_type": attachment.content_type,
        "file_size": attachment.file_size,
        "comment_id": attachment.comment_id,
        "uploaded_by_type": attachment.uploaded_by_type,
        "created_at": attachment.created_at.isoformat(),
    }
