# CMS — complaint management

End users register complaints and follow them; staff route, work, escalate and resolve them under scoped roles.

| Directory | What it is |
| --- | --- |
| [`backend/`](backend/README.md) | FastAPI API, background worker, migrations and CLI (`manage.py`) |
| [`admin-panel/`](admin-panel/README.md) | Next.js staff console: complaints, users and roles, locations, departments, SLA, imports, reports, audit log, settings |
| [`end-user/`](end-user/README.md) | Next.js portal: sign-in with a one-time code, register and follow complaints, notifications, profile |

Nothing organisation-specific lives in the code: the name, support contacts, time zone, phone format, complaint numbering and limits are set by the Super Admin under *Settings* and served to both apps by `GET /public/config`. The application ships without sample data.

## Run with Docker

```bash
cp .env.example .env                    # database credentials, ports, the API's public URL
cp backend/.env.example backend/.env    # API settings; its DATABASE_URI is replaced by compose
docker compose up --build -d
docker compose run --rm api python manage.py create-super-admin --name "Your Name" --email you@example.org
```

Compose starts MariaDB, runs `manage.py migrate` once, then starts the API, a separate background worker and both web apps. The web apps are built for the `PUBLIC_API_URL` in `.env`; rebuild them (`docker compose build admin-panel end-user`) after changing it, and list both apps' URLs in `CORS_ORIGINS` in `backend/.env`. Uploads and the database live in the `uploads` and `db-data` volumes. Put a TLS-terminating reverse proxy in front for production, add its address to `backend/.env` as `FORWARDED_ALLOW_IPS` (so rate limits see real client addresses), and cap request sizes there (see `backend/README.md`, *Sessions and security*).

Sign in to the admin panel as the Super Admin and work through the setup checklist on the dashboard: *Settings*, *Locations*, *SLA & Escalation*, *Departments*, *Roles*.

## Develop locally

Each app runs on its own; see its README. In short:

```bash
cd backend && venv/bin/uvicorn app:app --reload --port 5000   # after migrate, see backend/README.md
cd admin-panel && npm run dev                                  # http://localhost:3001
cd end-user && npm run dev                                     # http://localhost:3000
```

## Checks

CI (`.github/workflows/ci.yml`) runs, and each should pass locally before a change is merged:

- backend: `ruff check .` and `pytest` against a disposable MariaDB/MySQL database (`TEST_DATABASE_URI`, see `backend/.env.test.example`)
- each web app: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`
- the three Docker images build
