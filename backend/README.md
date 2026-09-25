# CMS Backend (FastAPI)

## Access model

Access = **role permissions + department/location scopes + role hierarchy**.

- **Permissions** (`services/permission_catalog.py`) say *what* a role may do, e.g. `complaint.view`, `user.create`. Routes check them with `require_permission(...)`. Roles and their grants live in the database and are edited under *Roles & Permissions*; the catalog only seeds defaults.
- **Scopes** (`user_scopes`) say *where*: each row is a `(department, location)` pair, `NULL` meaning "all". A location covers its whole subtree. Complaint and citizen queries are filtered through `AccessContext.apply_scope`, so a Mansarovar electricity agent never receives Water or Delhi complaints.
- **Hierarchy**: roles have a parent role. A user can only create/manage users whose role is strictly below theirs *and* whose scopes fit inside their own. Adding a level (e.g. Regional Manager between Manager and Supervisor) is a data change: create the role, then move Supervisor under it.
- The **Super Admin** role bypasses all three.

Staff (`users`) and citizens (`end_users`) are separate tables with separate tokens; a citizen token is rejected by staff endpoints and vice versa.

## Complaint engine

**Statuses** (`services/workflow_service.py`): `SUBMITTED → ASSIGNED → ACKNOWLEDGED → IN_PROGRESS ⇄ WAITING_FOR_INFORMATION → RESOLVED → CLOSED`, plus `REOPENED` (from resolved/closed) and `REJECTED` (from any open status, reason required). Dashboards group them as *open* (submitted, assigned, reopened), *in progress*, *resolved* (resolved, closed) and *rejected*.

**Routing** (`services/routing_service.py`): on submission a complaint goes to an active, available officer whose role has `complaint.receive` and whose scope covers its department and location. The most specific scope wins (department-specific over "all departments", then the deepest location), then the lowest open workload, then whoever was assigned least recently. If nobody matches, it waits unassigned in the department queue; anyone with `complaint.assign` in scope can assign it (to themselves or someone below them) or re-run routing. Staff can mark themselves unavailable (header menu) and routing skips them.

**Who can act**: handling actions (acknowledge, start, ask for information, resolve) are open to the assignee and to supervisors holding `complaint.assign`; closing/reopening needs `complaint.close`; rejecting needs `complaint.reject.approve` (agents can't reject). The API returns the actions available to the viewer, and the UIs render exactly those.

**Citizens** see a public timeline and the conversation (internal notes and officer names are hidden), can reply (which moves a *waiting for information* complaint back to *in progress*), confirm a resolution with a 1–5 rating, or reopen within `REOPEN_WINDOW_DAYS` (default 7, at most `MAX_REOPENS` = 3 times).

Every change is recorded in `complaint_history` (timeline), `complaint_assignments` (assignment history) and the audit log.

## SLA & escalation

`services/sla_service.py` runs two clocks per complaint, with targets from `sla_rules` (per priority, optionally overridden per department; edited under *SLA & Escalation*):

- **Response**: the assigned officer must act within `response_hours` (default 24h for every priority) of being assigned, or of submission while unassigned, or of a reopen.
- **Resolution**: resolved within `resolution_hours` of submission (Low 168h, Medium 120h, High 72h, Critical 24h by default). Paused while waiting for information from the citizen.

A "due soon" warning goes to the officer and their manager `warning_minutes` before a target. When a target is missed the complaint **escalates** along the officer's reporting line (`reports_to`: Agent → Supervisor → Manager → Admin → Super Admin), skipping people who are inactive or outside the complaint's scope, and falling back to the nearest supervisor role in scope when the line has gaps. Unassigned complaints escalate to the lowest supervisor covering them. The escalated person is notified and becomes accountable; each level gets `level_hours` (default 24h) before it climbs again, up to `max_level` (default 4). Responding (for a response breach), resolving, or reassigning the complaint ends the escalation.

The check runs every `SLA_CHECK_INTERVAL_SECONDS` (default 60) inside the API process. With several API workers, set it to `0` and run one `python sla_worker.py` process instead (or `python sla_worker.py --once` from cron). The Super Admin can also trigger it from the admin panel.

**Notifications** are in-app for staff (header bell) and citizens: assignments, SLA warnings/breaches, escalations, status changes, replies and ratings. `services/notification_service.notify` is the single place to add email/SMS delivery later.

## Rejection & governance

Agents cannot reject complaints (`services/rejection_service.py`). The handler **requests** rejection with a category and a reason; the complaint moves to `REJECTION_REQUESTED` (the citizen sees "Under Review", never the internal reason) and the request is routed to the requester's reporting manager who holds `complaint.reject.approve`. Anyone above the requester in scope with that permission can **approve** (the complaint is rejected; the approver's message, or the category and reason, is what the citizen sees) or **deny** (a note is required; the complaint goes back to work as acknowledged). The requester can **withdraw** a pending request. Approvers who reject directly get the same `rejection_requests` record (`direct = true`), so every rejection has requester, reason, approver and time on file.

The **audit log** is append-only (no edit/delete endpoints) and covers logins, user/role/department/location/SLA changes, complaint creation, status changes, assignments, rejections, citizen confirm/reopen/rating, and system escalations. It can be filtered by action, entity, actor, text and date, and exported as CSV (`GET /audit-logs/export`).

## Reports

`GET /reports/summary | trend | agents | departments | locations?level=district` (permission `reports.view`) report on complaints **submitted** in a date range (default: last 30 days), optionally filtered by department, location and priority, always inside the caller's scope. The summary also returns the same-length previous period for comparison. Tables accept `format=csv`.

- *Response time*: submission to first staff response; *resolution time*: submission to resolved (average, median, p90).
- *SLA met %*: a complaint misses a target if a breach was recorded on its timeline, if it was answered/resolved after the due time, or if it is still open past it.
- *Officers* are grouped by current handler; *locations* roll up to the chosen level of the tree.

Metrics are computed in Python over the selected rows (fine for tens of thousands per query); move them to SQL or a reporting table if volumes grow well beyond that.

## Running

```bash
python -m venv venv && venv/bin/pip install -r requirements-dev.txt
venv/bin/python seed.py              # DROPS all tables, then loads demo data
venv/bin/uvicorn app:app --reload --port 5000
```

For a fresh non-demo database use `seed_super_admin.py [email] [password] [name] [mobile]` instead of `seed.py`; it only creates the root account. On startup the app creates missing tables and adds any new permissions/system roles, but it does not migrate changed tables.

Demo staff (password `Admin@123`): `rahul.sharma@example.com` (Super Admin), `admin@civiccare.gov.in` (Admin, everything), `manager@civiccare.gov.in` (Electricity · Jaipur district), `supervisor@civiccare.gov.in` (Electricity · Jaipur city), `agent@civiccare.gov.in` (Electricity · Mansarovar), `water.agent@civiccare.gov.in` (Water · Mansarovar), `delhi.agent@civiccare.gov.in` (Electricity · New Delhi), plus agents `rohit.jain@` (Electricity · Jaipur city), `farhan.ali@` (Water · Jaipur district), `roads.agent@` (Roads · Rajasthan), `sanitation.agent@` (Sanitation · Jaipur district) and `delhi.general@` (all departments · Delhi), all `@civiccare.gov.in`. Seeded complaints are created through the real workflow, so they have routing, timelines and conversations.

Demo citizen: mobile `9876543210` + email `rahul@example.com`. In development (`APP_ENV=development`, the default) the OTP is printed to the console and returned as `dev_otp`; no SMS/email provider is integrated yet.

## CSV imports

Locations (`POST /locations/import`), one path per row; existing nodes are reused:

```csv
country,state,district,city,area
India,Rajasthan,Jaipur,Jaipur,Mansarovar
```

Citizens (`POST /end-users/import`); matched by `user_id`, else by mobile + email, and updated. Locations must exist first:

```csv
user_id,name,mobile,email,country,state,district,city,area
USR001,Rahul Sharma,9876543210,rahul@example.com,India,Rajasthan,Jaipur,Jaipur,Mansarovar
```

Every row is checked before anything is written for it. Problems come back per row as **errors** (row not imported) or **warnings** (imported, but check it):

- errors: missing/invalid fields, duplicate rows within the file, unknown locations, rows outside your scope, a mobile + email that already belongs to another citizen;
- warnings: a mobile already registered with a different email (or vice versa), which is often outdated data; numbers that don't look like Indian mobiles; location names that differ from an existing one only in spaces/punctuation (matched to it) or look like a misspelling of one (created, flagged); unused columns.

Blank rows are skipped and names have extra spaces collapsed. Send `dry_run=true` (the **Validate only** button) to get the full report without saving anything. Every upload, including validation runs and files rejected outright, is kept in **Import History** (`/imports`), where the failed rows can be downloaded as a CSV in the original columns plus an `issue` column, fixed, and uploaded again. `GET /locations/export` and `GET /end-users/export` download current data in the same format.

## Tests

```bash
venv/bin/python -m pytest tests
```

Tests run against a throwaway SQLite file seeded with the demo data.
