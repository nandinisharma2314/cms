"""Validation of free text: trimmed, required or optional, and no longer than
its limit (usually the column size, see models.max_length). Too-long input is
refused, never cut short."""
import re

from fastapi import HTTPException, status

KEY_FORMAT = re.compile(r"[a-z][a-z0-9_]*")


def _checked(value: str, label: str, limit: int, required: bool) -> str | None:
    if not value:
        if required:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{label} is required")
        return None
    if len(value) > limit:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{label} is too long (max {limit} characters)")
    return value


def single_line(value: str | None, label: str, limit: int, required: bool = True) -> str | None:
    """Names and labels: runs of whitespace become one space."""
    return _checked(" ".join((value or "").split()), label, limit, required)


def multi_line(value: str | None, label: str, limit: int, required: bool = True) -> str | None:
    """Descriptions, notes and comments: trimmed, line breaks kept."""
    return _checked((value or "").strip(), label, limit, required)


def machine_key(value: str | None, limit: int) -> str:
    """Stable identifiers (role, priority and location level keys)."""
    key = (value or "").strip().lower()
    if not (1 <= len(key) <= limit and KEY_FORMAT.fullmatch(key)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Key must be up to {limit} lowercase letters, "
                                                         "digits or underscores, starting with a letter")
    return key
