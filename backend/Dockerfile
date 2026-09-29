# The CMS API (and, with a different command, the background worker or manage.py).
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Attachments live under UPLOAD_DIR; mount a volume there so they survive new containers.
RUN useradd --system --uid 10001 --home-dir /app cms \
    && mkdir -p /app/uploads \
    && chown -R cms /app/uploads
USER cms

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5000/health/', timeout=4).status == 200 else 1)"

# --proxy-headers: behind a reverse proxy, set FORWARDED_ALLOW_IPS to its address so
# rate limits and the audit log see the real client address.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000", "--proxy-headers"]
