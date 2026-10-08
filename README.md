# CMS — complaint management

End users register complaints and follow them; staff route, work, escalate and resolve them under scoped roles.

| Directory | What it is |
| --- | --- |
| [`backend/`](backend/README.md) | FastAPI API, background worker, migrations and CLI (`manage.py`) |
| [`frontend/`](frontend/README.md) | Next.js unified app: staff console (complaints, users, locations, SLA, settings) and citizen portal (file & track complaints) |

Nothing organisation-specific lives in the code: the name, support contacts, time zone, phone format, complaint numbering and limits are set by the Super Admin under *Settings* and served by `GET /public/config`. The application ships without sample data.

## Run with Docker

```bash
cp .env.example .env                    # database credentials, ports, the API's public URL
cp backend/.env.example backend/.env    # API settings; its DATABASE_URI is replaced by compose
docker compose up --build -d
docker compose run --rm api python manage.py create-super-admin --name "Your Name" --email you@example.org
```

Compose starts MariaDB, runs `manage.py migrate` once, then starts the API, a separate background worker and the frontend. The frontend is built for the `PUBLIC_API_URL` in `.env`; rebuild it (`docker compose build frontend`) after changing it, and list its URL in `CORS_ORIGINS` in `backend/.env`. Uploads and the database live in the `uploads` and `db-data` volumes. Put a TLS-terminating reverse proxy in front for production, add its address to `backend/.env` as `FORWARDED_ALLOW_IPS` (so rate limits see real client addresses), and cap request sizes there (see `backend/README.md`, *Sessions and security*).

Sign in to the app as the Super Admin and work through the setup checklist on the dashboard: *Settings*, *Locations*, *SLA & Escalation*, *Departments*, *Roles*.

## Develop locally

Each app runs on its own; see its README. In short:

```bash
cd backend && venv/bin/uvicorn app:app --reload --port 5000   # after migrate, see backend/README.md
cd frontend && npm run dev                                    # http://localhost:3000
```

## Checks

CI (`.github/workflows/ci.yml`) runs, and each should pass locally before a change is merged:

- backend: `ruff check .` and `pytest` against a disposable MariaDB/MySQL database (`TEST_DATABASE_URI`, see `backend/.env.test.example`)
- each web app: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`
- the three Docker images build
