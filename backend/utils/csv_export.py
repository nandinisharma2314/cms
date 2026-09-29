import csv
import io
from datetime import datetime, timezone

from fastapi.responses import StreamingResponse

# Spreadsheet apps run a cell that starts with one of these as a formula.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value) -> object:
    """Neutralises text that a spreadsheet would treat as a formula (CSV injection)."""
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def csv_response(name: str, headers: list[str], rows) -> StreamingResponse:
    """A downloadable CSV named "<name>-<UTC timestamp>.csv". It starts with a UTF-8
    byte order mark so spreadsheet apps read non-Latin text correctly (imports accept it)."""
    buffer = io.StringIO()
    buffer.write("\ufeff")
    writer = csv.writer(buffer)
    writer.writerow([safe_cell(h) for h in headers])
    for row in rows:
        writer.writerow([safe_cell(cell) for cell in row])
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%MZ")
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}-{stamp}.csv"'},
    )
