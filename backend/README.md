# CMS Backend (FastAPI)

## Access model

Access = **role permissions + department/location scopes + role hierarchy**.

- **Permissions** (`services/permission_catalog.py`) say *what* a role may do, e.g. `complaint.view`, `user.create`. Routes check them with `require_permission(...)`. Roles and their grants live in the database and are edited under *Roles & Permissions*; the catalog only seeds defaults.
- **Scopes** (`user_scopes`) say *where*: each row is a `(department, location)` pair, `NULL` meaning "all". A location covers its whole subtree. Complaint and end user queries are filtered through `AccessContext.apply_scope`, so a Mansarovar electricity agent never receives Water or Delhi complaints.
- **Hierarchy**: roles have a parent role. A user can only create/manage users whose role is strictly below theirs *and* whose scopes fit inside their own. Adding a level (e.g. Regional Manager between Manager and Supervisor) is a data change: create the role, then move Supervisor under it.
- The **Super Admin** role bypasses all three.

Staff (`users`) and end users (`end_users`) are separate tables with separate tokens; an end user token is rejected by staff endpoints and vice versa.

## Complaint engine

**Statuses** (`services/workflow_service.py`): `SUBMITTED → ASSIGNED → ACKNOWLEDGED → IN_PROGRESS ⇄ WAITING_FOR_INFORMATION → RESOLVED → CLOSED`, plus `REOPENED` (from resolved/closed) and `REJECTED` (from any open status, reason required). Dashboards group them as *open* (submitted, assigned, reopened), *in progress*, *resolved* (resolved, closed) and *rejected*.

**Routing** (`services/routing_service.py`): on submission a complaint goes to an active, available officer whose role has `complaint.receive` and `complaint.respond` and whose scope covers its department and location. The most specific scope wins (department-specific over "all departments", then the deepest location), then the lowest open workload, then whoever was assigned least recently. If nobody matches, it waits unassigned in the department queue; anyone with `complaint.assign` in scope can assign it (to themselves or someone below them) or re-run routing. Staff can mark themselves unavailable (header menu) and routing skips them.

**Who can act**: handling actions (acknowledge, start, ask for information, resolve) are open to the assignee and to supervisors holding `complaint.assign`; closing/reopening needs `complaint.close`; rejecting needs `complaint.reject.approve` and a reason category (agents can't reject). Changing a complaint's department, category, location or priority (**reclassify**) needs `complaint.reclassify` and a reason; the SLA clocks shift by the difference in targets and the complaint is re-routed if its handler no longer covers it. The API returns the actions available to the viewer, and the UIs render exactly those.

**End users** see a public timeline and the conversation (internal notes and officer names are hidden), can reply (which moves a *waiting for information* complaint back to *in progress*), confirm a resolution with a 1–5 rating, or reopen within the reopen window (Settings: *reopen window* days, at most *maximum reopens* times).

Every change is recorded in `complaint_history` (timeline), `complaint_assignments` (assignment history) and the audit log.

## Priorities, SLA & escalation

**Priorities** live in the `priorities` table and are managed under *SLA & Escalation* (`sla.manage` with an unrestricted scope): name, colour tone and order (most urgent first). Every complaint category has a **default priority**; a complaint gets its category's priority when it is filed. End users never choose one; staff can pick another when registering a complaint for someone, or change it later by reclassifying (with a reason, audited). A priority still used as a category default cannot be retired.

`services/sla_service.py` runs two clocks per complaint, with targets from `sla_rules`: one default rule per priority (created together with the priority, never deleted) and optional per-department overrides.

- **Response**: the handler must act within `response_hours` of being assigned (or of submission while unassigned, or of a reopen). Reassigning *before* the target gives the new handler a fresh window; once the target has been missed the breach stands, and the escalation keeps running, until someone responds.
- **Resolution**: resolved within `resolution_hours` of submission. Paused while waiting for information from the end user.

A "due soon" warning goes to the handler and their manager `warning_minutes` before a target. When a target is missed the complaint **escalates** along the handler's reporting line (`reports_to`), skipping people who are inactive or outside the complaint's scope, and falling back to the nearest supervisor role in scope when the line has gaps. Unassigned complaints escalate to the lowest supervisor covering them. Each level gets `level_hours` before it climbs again, up to `max_level` (`escalation_rules`: a default per breach type plus optional per-department overrides, which may disable escalation for that department). Responding (for a response breach) or resolving ends the escalation. End users only see "Escalated for priority handling".

## Background worker

`services/worker_service.py` does the periodic work: SLA warnings/breaches/escalations, routing complaints that wait in the department queue, sending queued SMS/email notifications (with retries), and clean-up (expired sessions and codes, old rate-limit windows, personal data in old import reports, and optionally old audit entries). A MySQL named lock (`GET_LOCK`) guarantees one run at a time across processes; each complaint is checked in its own transaction, so one bad record doesn't stop the rest.

It runs inside the API process every `WORKER_INTERVAL_SECONDS`. With several API workers, set that to `0` and run one `python worker.py` process instead (or `python worker.py --once` from cron). The Super Admin can also run the SLA check from the admin panel.

**Notifications** are in-app for staff (header bell) and end users. For end users each notification is also queued in `message_deliveries` as SMS and/or email when the organisation enabled that channel (Settings) and the end user has not opted out (profile). Each channel is configured on the server on its own: `SMS_DELIVERY` (`console`, `twilio` or `off`) and `EMAIL_DELIVERY` (`console`, `smtp` or `off`). `console` only logs messages and is refused in production. A channel that is `off` is not offered for sign-in, can't be enabled for notifications and sends nothing; at least one channel must be on (see `.env.example`).

## Rejection & governance

Agents cannot reject complaints (`services/rejection_service.py`). The handler **requests** rejection with a category and a reason; the complaint moves to `REJECTION_REQUESTED` (the end user sees "Under Review", never the internal reason) and the request is routed to the requester's reporting manager who holds `complaint.reject.approve`. Anyone above the requester in scope with that permission can **approve** (the complaint is rejected; the approver's message, or the category and reason, is what the end user sees) or **deny** (a note is required; the complaint goes back to work as acknowledged). The requester can **withdraw** a pending request. Approvers who reject directly get the same `rejection_requests` record (`direct = true`), so every rejection has requester, reason, approver and time on file.

Rejection reason categories are managed by the Super Admin under *Settings* (`rejection_reasons`); retired reasons stay on old records but can't be chosen.

The **audit log** is append-only (no edit/delete endpoints) and covers logins, user/role/department/location/SLA changes, complaint creation, status changes, assignments, rejections, end user confirm/reopen/rating, and system escalations. It can be filtered by action, entity, actor, text and date, and exported as CSV (`GET /audit-logs/export`).

## Reports

`GET /reports/overview | agents | departments | locations?level=<level key>` and `GET /reports/levels` (permission `reports.view`) report on complaints **submitted** in a date range (days in the organisation's time zone; default: the last `REPORT_DEFAULT_DAYS` days), optionally filtered by department, location and priority, always inside the caller's scope. The overview returns the metrics, the same-length previous period for comparison, and a daily trend (weekly for periods over 62 days). Tables accept `format=csv`.

- *Response time*: submission to first staff response; *resolution time*: submission to resolved (average, median, p90).
- *SLA met %*: a complaint misses a target if a breach was recorded, if it was answered/resolved after the due time, or if it is still open past it.
- *Reopen %*: reopened complaints out of those resolved at least once.
- *Staff* are grouped by current handler; *locations* roll up to the chosen level of the tree.

Metrics are computed in Python over the selected rows (fine for tens of thousands per query); move them to SQL or a reporting table if volumes grow well beyond that.

## Sessions and security

- Staff sign in with email or mobile + password (`POST /auth/login`); end users with a one-time code sent to their mobile or email. An unknown mobile/email gets exactly the same answer (a decoy challenge that never verifies), so the portal can't be used to find out who is registered. When several end users share a mobile or email, they choose their account after entering the code.
- The API returns a short-lived access token (kept in memory by the apps) and sets the refresh token as an httpOnly cookie limited to `/auth`. `POST /auth/refresh?principal=staff|end_user` rotates it (it needs the `X-Requested-With: cms` header); replaying an old refresh token after `REFRESH_TOKEN_REUSE_GRACE_SECONDS` ends the whole session. Deactivating an account, resetting a password or changing an end user's mobile/email signs out every session immediately.
- Accounts created by someone else, and passwords reset by an approver, must be changed at the next sign-in. Passwords need 8+ characters (72 bytes max) and three of: lowercase, uppercase, digit, symbol.
- Failed logins lock the account for `LOGIN_LOCKOUT_MINUTES` after `LOGIN_MAX_FAILURES`; logins, code requests, code checks and reset requests are also rate-limited per network.
- **Password reset**: staff who forgot their password raise a ticket (`POST /auth/reset-query`, same answer whether or not the account exists). Someone above them with `user.reset_password` approves it (a temporary password is shown once) or rejects it with a note.
- **Attachments** are stored outside the web root under `UPLOAD_DIR` with random names, checked against the allowed types in Settings, their size limit, and their real file signature, and served only through short-lived signed links (`/files/{id}`). Attachments on internal notes are never shown to end users.
- CSV exports neutralise values that spreadsheets would run as formulas.
- Uploads are received in full before they are checked, so limit the request size at the reverse proxy (e.g. nginx `client_max_body_size`) to a little more than the larger of *max attachments × max attachment size* (Settings) and `MAX_CSV_UPLOAD_BYTES`.
- In production the interactive API docs (`/docs`, `/redoc`, `/openapi.json`) are off and responses carry `Strict-Transport-Security`.

## Settings

Business settings are not in the code or the environment: the Super Admin fills them in under *Settings* (`system_settings`): organisation and product name, support contacts (hidden in the apps when empty), time zone, complaint ID prefix and next number, reopen window and limit, attachment count/size/types, the phone number format (country code, length, expected leading digits) and whether SMS/email notifications are sent. `GET /public/config` gives both frontends what they need before sign-in. Anything that depends on a missing setting answers `503` with the name of the setting, and `GET /settings/status` (or `python manage.py check`) lists what is still missing.

## Running

Requirements: Python 3.12+, MySQL 8 or MariaDB 10.6+.

```bash
python -m venv venv && venv/bin/pip install -r requirements-dev.txt
cp .env.example .env                 # then fill in every value
venv/bin/python manage.py migrate    # create or upgrade the schema, sync permissions and system roles
venv/bin/python manage.py create-super-admin --name "Your Name" --email you@example.org
venv/bin/uvicorn app:app --reload --port 5000
```

Behind a reverse proxy, run uvicorn with `--proxy-headers` and set `FORWARDED_ALLOW_IPS` to the proxy's address; otherwise every request seems to come from the proxy and all clients share one rate-limit budget.

`create-super-admin` asks for the password (twice) instead of taking it on the command line. Sign in to the admin panel with that account and complete *Settings*, *Locations* (levels, then the tree), *SLA & Escalation* (priorities), *Departments* and *Roles*; `python manage.py check` reports anything still missing. The application ships without sample data.

The app refuses to start when an environment variable is missing or invalid, when the database schema is not at the expected migration (`python manage.py migrate` upgrades it, including databases created by older versions that had no migration history), or when the permission catalog/system roles are out of sync.

Schema changes go through Alembic: change `models.py`, then `venv/bin/alembic revision --autogenerate -m "..."` (review the result), and update `EXPECTED_REVISION` in `schema_version.py`.

## CSV imports

Locations (`POST /locations/import`), one path per row; existing nodes are reused:

```csv
country,state,district,city,area
India,Rajasthan,Jaipur,Jaipur,Mansarovar
```

End users (`POST /end-users/import`); matched by `user_id`, else by mobile + email, and updated. Locations must exist first:

```csv
user_id,name,mobile,email,country,state,district,city,area
USR001,Rahul Sharma,9876543210,rahul@example.com,India,Rajasthan,Jaipur,Jaipur,Mansarovar
```

Every row is checked before anything is written for it. Problems come back per row as **errors** (row not imported) or **warnings** (imported, but check it):

- errors: missing/invalid fields, duplicate rows within the file, unknown locations, rows outside your scope, a mobile + email that already belongs to another end user;
- warnings: a mobile already registered with a different email (or vice versa), which is often outdated data; numbers that don't start with one of the expected leading digits (Settings); location names that differ from an existing one only in spaces/punctuation (matched to it) or look like a misspelling of one (created, flagged); unused columns.

Mobile numbers follow the phone format in Settings. Changing an existing end user's mobile or email through an import signs them out and notifies them, as a manual edit does. Blank rows are skipped and names have extra spaces collapsed. Every upload must say `dry_run=true` (the **Validate only** button) to get the full report without saving anything, or `dry_run=false`. Every upload, including validation runs and files rejected outright, is kept in **Import History** (`/imports`), where the failed rows can be downloaded as a CSV in the original columns plus an `issue` column, fixed, and uploaded again. `GET /locations/export` and `GET /end-users/export` download current data in the same format.

Imports run within the upload request. End users are written in batches of 500 rows (50,000 rows took about 11 seconds against a local MariaDB); a batch that hits a conflict nobody could see beforehand (someone saving the same person at that moment) is written again row by row, so only that row fails. Location rows are written one at a time, since every node needs its parent's id. Keep `MAX_IMPORT_ROWS` and `MAX_CSV_UPLOAD_BYTES` within what completes before your reverse proxy's timeout.

## Tests

The suite runs against a MySQL/MariaDB database that it drops and rebuilds on every run (through the real migrations, then `tests/factories.py`). Its name must end in `_test`:

```bash
cp .env.test.example .env.test       # set TEST_DATABASE_URI
venv/bin/python -m pytest
venv/bin/ruff check .
```
