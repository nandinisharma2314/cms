import csv
import io
from datetime import datetime

from fastapi.responses import StreamingResponse


def csv_response(name: str, headers: list[str], rows) -> StreamingResponse:
    """A downloadable CSV named "<name>-<timestamp>.csv"."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(rows)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{name}-{datetime.now():%Y%m%d-%H%M}.csv"'},
    )
