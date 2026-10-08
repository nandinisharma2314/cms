"""Cloudflare R2 and Local Disk Unified Storage Service.

When R2 credentials (R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) are
configured in backend/.env, files are uploaded to Cloudflare R2 object storage.
Otherwise, files are stored on local disk under UPLOAD_DIR for seamless local
development and test suites.
"""
from __future__ import annotations

import io
import logging
import os
import uuid
from pathlib import Path
from typing import BinaryIO

from config import (
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_BUCKET,
    R2_CUSTOM_ENDPOINT,
    R2_PUBLIC_URL,
    R2_SECRET_ACCESS_KEY,
    STORAGE_BACKEND,
    UPLOAD_DIR,
)

logger = logging.getLogger(__name__)

_s3_client = None


def is_r2_enabled() -> bool:
    """True if R2/S3 storage is active and credentials are provided."""
    if STORAGE_BACKEND == "local":
        return False
    return bool(R2_BUCKET and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY)


def get_s3_client():
    """Lazily initialize and return the boto3 S3 client for Cloudflare R2."""
    global _s3_client
    if _s3_client is not None:
        return _s3_client

    import boto3
    from botocore.config import Config

    endpoint_url = R2_CUSTOM_ENDPOINT
    if not endpoint_url and R2_ACCOUNT_ID:
        endpoint_url = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

    _s3_client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )
    return _s3_client


def save_file(
    content: bytes | BinaryIO,
    filename: str,
    content_type: str,
    folder: str = "",
    is_public: bool = False,
) -> tuple[str, str]:
    """Saves file content to Cloudflare R2 or local disk.

    Returns (storage_key, public_or_served_url).
    """
    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    unique_name = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex
    storage_key = f"{folder.strip('/')}/{unique_name}" if folder else unique_name

    data: bytes = content.read() if hasattr(content, "read") else content

    if is_r2_enabled():
        try:
            client = get_s3_client()
            client.put_object(
                Bucket=R2_BUCKET,
                Key=storage_key,
                Body=data,
                ContentType=content_type,
            )
            if is_public and R2_PUBLIC_URL:
                url = f"{R2_PUBLIC_URL}/{storage_key}"
            else:
                url = f"/files/serve/{storage_key}"
            return storage_key, url
        except Exception as exc:
            logger.error("Failed to upload %s to Cloudflare R2: %s", storage_key, exc)
            raise

    # Local disk fallback
    dest_path = UPLOAD_DIR / storage_key
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(data)

    url = f"/files/serve/{storage_key}"
    return storage_key, url


def get_file(storage_key: str) -> tuple[bytes, str | None]:
    """Reads file bytes and content type from Cloudflare R2 or local disk."""
    if is_r2_enabled():
        client = get_s3_client()
        resp = client.get_object(Bucket=R2_BUCKET, Key=storage_key)
        content_type = resp.get("ContentType")
        body = resp["Body"].read()
        return body, content_type

    path = UPLOAD_DIR / storage_key
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {storage_key}")
    with open(path, "rb") as f:
        data = f.read()
    return data, None


def delete_file(storage_key: str) -> bool:
    """Deletes a file from Cloudflare R2 or local disk."""
    if is_r2_enabled():
        try:
            client = get_s3_client()
            client.delete_object(Bucket=R2_BUCKET, Key=storage_key)
            return True
        except Exception as exc:
            logger.warning("Failed to delete %s from Cloudflare R2: %s", storage_key, exc)
            return False

    path = UPLOAD_DIR / storage_key
    if path.is_file():
        path.unlink(missing_ok=True)
        return True
    return False


def get_presigned_url(storage_key: str, expires_in: int = 900) -> str | None:
    """Generates an expiring pre-signed S3/R2 download URL if R2 is enabled."""
    if not is_r2_enabled():
        return None
    try:
        client = get_s3_client()
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": R2_BUCKET, "Key": storage_key},
            ExpiresIn=expires_in,
        )
    except Exception as exc:
        logger.warning("Failed to generate presigned URL for %s: %s", storage_key, exc)
        return None
