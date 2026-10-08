# CMS — complaint management

End users register complaints and follow them; staff route, work, escalate and resolve them under scoped roles.

| Directory | What it is |
| --- | --- |
| [`backend/`](backend/README.md) | FastAPI API, background worker, migrations and CLI (`manage.py`) |
| [`frontend/`](frontend/README.md) | Next.js unified app: staff console (complaints, users, locations, SLA, settings) and citizen portal (file & track complaints) |

Nothing organisation-specific lives in the code: the name, support contacts, time zone, phone format, complaint numbering and limits are set by the Super Admin under *Settings* and served by `GET /public/config`. The application ships without sample data.

## Run with Docker (Zero-Touch 1-Step Deployment)

```bash
cp .env.example .env                    # copy unified environment file
docker compose up --build -d            # start MariaDB, auto-migrate DB, auto-bootstrap defaults, launch API & UI
```

Docker automatically:
1. Starts the MariaDB database service.
2. Applies all Alembic database migrations to head.
3. Automatically bootstraps system settings defaults, location hierarchy levels, default priorities & SLA rules, escalation policies, rejection reasons, and rewards & perks catalog.
4. Creates the initial Super Admin account (default: `admin@kvontech.com` / `Admin@12345`, configurable via `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` in `.env`).
5. Launches the FastAPI backend, background worker, and Next.js frontend on `http://localhost:3000`.

Sign in to the admin panel at `http://localhost:3000/login` with your Super Admin credentials to immediately start managing complaints and configuring custom rules.

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
