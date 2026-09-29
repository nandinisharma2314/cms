# CMS: Full Code Review

**Date:** 2026-09-26 · **Commit reviewed:** `42f7640` (main, clean tree)

## Status (2026-09-28)

Every finding below (sections 2–9) has been fixed in the working tree. The decisions asked for at the end are settled:

1. **Priority:** each category has a default priority. End users never choose one. Staff with `complaint.reclassify` can set a different one, with a reason, and it is audited.
2. **Branding:** set by the Super Admin under *Settings*. Both apps read it from `GET /public/config`.
3. **Defaults:** explicit UX defaults are kept, all in one place (`config.py`). Missing configuration raises an error instead of falling back.
4. **Demo data:** `seed.py` is gone. Tests build their own data, and new installs start with `manage.py create-super-admin`.

A second review pass over the fixed code found the issues below. They are fixed as well.

| Area | Issue found in the second pass | Fix |
|---|---|---|
| Database | Migrations failed on MySQL 8: a STORED generated column over a foreign key with `ON DELETE CASCADE`. MySQL also rounds fractional seconds up where MariaDB truncates them, so a message queued "now" was not yet due. | VIRTUAL generated columns. Timestamps are taken in whole seconds. The suite passes on MariaDB and on MySQL 8.4, and CI tests both. |
| Messaging | SMS and email could not be enabled on their own. Production needed both Twilio and SMTP, and sign-in offered channels that could not send. | `SMS_DELIVERY` and `EMAIL_DELIVERY` are set per channel (`off` allowed). Sign-in, contact changes and notification toggles follow them. |
| Limits | Text limits were duplicated across three codebases. Feedback (portal 5000 vs API 1000) and reopen reasons (5000 vs 2000) were refused. Role and department descriptions were silently cut short. | Limits come from the column sizes (`models.max_length`) and are published in `/public/config`. Text that is too long is refused, never truncated. |
| Sessions | The refresh grace window accepted a just-rotated token after sign-out or a password reset. A failed refresh did not clear the dead cookie. | Grace applies only while the session is alive. The failure response now carries the cookie removal. |
| Attachments | PDFs could not be viewed. The file CSP `sandbox` blocks browser PDF viewers, and `X-Frame-Options: DENY` blocked the portal preview. | PDFs are served without the sandbox. `frame-ancestors` lists the app origins. Stored names keep their extension. |
| Workflow | A staff reply counted as the first response in reports but did not stop the SLA response clock. | Only status actions count as a response, the same rule in both places. |
| Workflow | Approving a rejection without a message showed the requester's internal explanation to the end user. | The end user sees the reason category only. |
| Workflow | Reclassifying refused values that had been switched off since filing, even when unchanged. | Unchanged values are kept. The form shows them as "(inactive)". |
| Routing | Complaints were routed to roles with `complaint.receive` but not `complaint.respond`. A role that lost `respond` kept its complaints. | Routing requires both permissions. Removing `respond` re-routes the role's complaints. |
| Imports | 50,000 end users took about 2.5 minutes, past proxy timeouts. Lookup indexes went stale after a rolled-back row. | Batched writes with a per-row fallback: 11 s for 50,000 rows. Indexes are rebuilt after a rollback. |
| Access | `assignee-options` listed staff workloads to users who cannot assign. Migrate never removed permissions dropped from the code. | Needs assign or reassign permission. Retired permissions are removed with their grants. |
| Admin panel | Dialogs opened from the header were clipped: `fixed` positioning inside a blurred ancestor. `sr-only` labels in tables widened phone pages. Settings changes were not reflected until a reload. | Dialogs render in a portal. Scroll containers are positioned. The configuration reloads after a save. |
| Portal | Typing over a filled OTP box spread digits across all boxes. Login images were 1.4 MB. The default Vercel favicon was still in place. "Only you see your complaints" was untrue. | OTP input fixed. `next/image` serves a 26 KB WebP for the hero. Neutral icon and wording. |
| Smaller | Date of birth checked against the server date. The CLI accepted an empty name. The CSV size message read "0 MB". API docs were public in production. No HSTS. Proxy trust and request-size limits were undocumented. Two tests depended on run order. | Fixed or documented (README, `.env.example`). |

**Still to do by people, not code:**
- Rotate the database password (S2). It remains in git history, and history is not rewritten here.
- Existing databases: run `pip install -r requirements.txt`, then `python manage.py migrate`.
- Production: set the env values `.env.example` asks for, run behind TLS, set `FORWARDED_ALLOW_IPS`, and cap request sizes at the proxy.

**Verified:**
- Backend: `ruff` clean, 123 tests pass on MariaDB 12.3 and on MySQL 8.4.
- Both apps: `eslint`, `tsc`, `prettier --check` and `next build` are clean.
- Docker: the three images build, and a `docker compose up` smoke test covered migrate, API, worker, both apps and sign-in.
- Visual checks at 390 px and 1366 px.

## 0. Scope and method

- **Read in full:** every tracked source file in `backend/` (app, config, models, 20 services, 15 route modules, utils, seeds, 9 test files, Docker/README), `admin-panel/` (all pages, components, lib, config) and `end-user/` (all pages, components, lib, `globals.css`, plus the 8 root codemod scripts and the 15 files in `scratch/`). Images, lockfiles and `.pyc` files were checked for presence only.
- **Run:**
  - Backend: `pytest tests` against `cms_test`: **58 passed** (49.5 s).
  - Admin panel: `eslint`: **0 errors, 7 warnings**. `tsc --noEmit`: clean.
  - End-user portal: `eslint`: **22 errors, 28 warnings** in 14 files. `tsc --noEmit`: clean.
- **Reproduced against a live test client** (marked *verified* below): role save rejected for non-super-admins, `Content-Disposition` hidden from the browser, CORS reflecting any origin with credentials, attachments downloadable without a token, OTP account enumeration.
- Everything else comes from reading the code. Where behaviour depends on runtime conditions it's marked *likely*.

Severity: **P0** fix before any real deployment · **P1** users will hit it · **P2** edge case or design gap · **P3** quality and cleanup.

---

## 1. Verdict

| Area | Overall | Summary |
|---|---|---|
| Backend domain logic | Good | Clean service layer. Access scoping goes consistently through `AccessContext`. Workflow, SLA, escalation, rejection and audit all fit together. Integration tests are meaningful and pass. |
| Backend security and config | Poor | Insecure defaults when env vars are missing, a real DB password committed, attachments served publicly, no rate limiting, CSV injection. |
| Backend hardcoding | Needs work | Priorities, rejection categories, location levels, phone format, ID format and limits are all constants in code. There are also silent fallbacks (for example a default SLA when no rule exists). |
| Admin panel | Fair | Well structured and permission-driven, but has real bugs: role editing, download filenames, dashboard arrows, no change-password screen. Some fake contact data. |
| End-user portal | Poor | Dummy personal data on the live profile page. Hardcoded fallbacks such as `"Jaipur, Rajasthan"` and `"CMP-10231"`. Dead features (search, menu, map, photo upload, civic alerts). 12 unused components and a leftover OTP bypass file. Files mangled by regex scripts. About 80% of `globals.css` is unused. |

---

## 2. P0: Security and data safety

**S1. The app is insecure by default when `APP_ENV` is not set.** [backend/config.py:7](backend/config.py#L7) defaults to `"development"`. That means:
- The public dev JWT secret is used ([config.py:14](backend/config.py#L14)). Anyone can forge `{"sub":"1","typ":"staff"}` and become Super Admin.
- Every OTP is returned in the API response ([portal_routes.py:133](backend/routes/portal_routes.py#L133)), and the login screen displays it as "Dev Code". Anyone can sign in as any end user.

Fix: make `APP_ENV` and `JWT_SECRET_KEY` required, fail at startup when either is missing, and only return `dev_otp` when an explicit `EXPOSE_DEV_OTP=true` is set.

**S2. A real database password is in the code and in git history.** [backend/database.py:8](backend/database.py#L8) has a fallback URI with the MySQL root password. The same password is in [backend/tests/conftest.py:7](backend/tests/conftest.py#L7) and has been in history since `d81656e`.

Fix: rotate the password, read `DATABASE_URI` only from the environment (fail when it's missing), and purge it from history if the repo is shared anywhere.

**S3. Attachments are public (verified).** [backend/app.py:48](backend/app.py#L48) mounts `/uploads` with no auth. `GET /uploads/<file>` returns 200 without a token. That includes files attached to internal staff notes.
- An old SVG in `uploads/` is served as `image/svg+xml` from the API origin.
- `backend/uploads/` (11 real uploads, about 33 MB) is committed to git.

Fix: an authenticated download endpoint that checks complaint scope or ownership, storage outside any static mount, and removing the folder from git.

**S4. CORS allows every origin with credentials (verified).** [backend/app.py:39-45](backend/app.py#L39): a preflight from `http://evil.example` comes back with that origin and `allow-credentials: true`.

Fix: an explicit origin list from env.

**S5. There is no rate limiting anywhere.**
- **Staff login:** unlimited password guesses and no lockout. Response timing reveals whether an account exists, because bcrypt is skipped for unknown users ([auth_routes.py:62](backend/routes/auth_routes.py#L62)).
- **OTP request:** the only cooldown is per end user ([otp_service.py:38](backend/services/otp_service.py#L38)). A script can trigger an SMS to every registered user, which becomes an SMS bill once Twilio is live.
- **OTP verify:** 5 attempts per challenge, but challenges can be re-requested every 30 s with no overall limit.
- **`POST /auth/reset-query`:** unauthenticated, so anyone can flood the ticket table.

**S6. Account enumeration (verified).** `request-otp` returns 404 "No registered end user matches this mobile number" for unknown numbers and 200 for known ones. A 409 also reveals identifiers that several people share ([portal_routes.py:106-119](backend/routes/portal_routes.py#L106)).

**S7. End users can change their login identity without verifying it.** `PUT /portal/profile` accepts a new mobile or email with no OTP to the new contact ([portal_routes.py:168-177](backend/routes/portal_routes.py#L168)). The portal shows "Verified" badges regardless. Staff can also change these fields silently.

**S8. CSV exports are open to formula injection.** [backend/utils/csv_export.py:13](backend/utils/csv_export.py#L13) writes cells raw. End-user-controlled text (names, complaint titles, import rows) that starts with `= + - @` runs as a formula in Excel. This affects audit, end-user, location, report and failed-row exports.

**S9. Portal logout from the profile page doesn't end the session.** [end-user/app/dashboard/profile/page.tsx:149-153](end-user/app/dashboard/profile/page.tsx#L149) removes only `access_token` and `user`.
- The refresh token stays in `localStorage` and stays valid on the server for 7 days.
- The profile page also caches date of birth, address, profile photo and preferences in 9 `localStorage` keys that are never cleared, so the next person on a shared phone sees them.

**S10. Password resets are weak.**
- The temporary password never has to be changed. There is no must-change flag, and the admin panel has **no change-password screen at all**, although `api.auth.changePassword` exists.
- Tickets can't be rejected or closed. Status is a free string with only "Pending Approval" and "Approved" ([auth_routes.py:153](backend/routes/auth_routes.py#L153)).
- Staff mobile numbers aren't unique, so a ticket filed by mobile can match the wrong person ([user_service.py:97](backend/services/user_service.py#L97)).
- The login form invites an "Officer Employee ID" that the backend can't match.

**S11. The seed scripts are dangerous.**
- [backend/seed.py:60](backend/seed.py#L60) drops **every table** in whatever `DATABASE_URI` points at, with no environment check and no confirmation.
- [seed_super_admin.py:22,58](backend/seed_super_admin.py#L22) defaults the root account to `Admin@123`, prints it, and takes the password as a CLI argument, which leaks into shell history and the process list.

**S12. A leftover OTP bypass.** [end-user/lib/otpStore.ts](end-user/lib/otpStore.ts) accepts `123456` whenever `NODE_ENV` isn't `production`. Nothing imports it today. Delete it before someone wires it up.

**S13. Credentials and paths in scratch files.** `end-user/scratch/test_flow.js:74` and `test_flow_desktop.js` contain a signed JWT and another developer's absolute paths (`/home/nandini/...`).

**S14. Dependency pins are stale and drift from what you test.**
- [requirements.txt](backend/requirements.txt) pins `fastapi==0.109.2` and `cryptography==41.0.3` (known CVEs), plus `passlib`, which is unmaintained and unused (the code calls `bcrypt` directly).
- The venv the tests run in has FastAPI 0.141 and Starlette 1.7, so the Docker image would run different code from what passes the tests.
- Docker uses Python 3.11; the venv uses 3.12.

**S15. Uploads are read fully into memory before any size check.**
- CSV imports call `file.file.read()` before checking the size ([location_routes.py:101](backend/routes/location_routes.py#L101), [end_user_routes.py:147](backend/routes/end_user_routes.py#L147)).
- Attachment size is only checked when `upload.size` happens to be set ([complaint_service.py:131](backend/services/complaint_service.py#L131)).
- There is no global request-size limit.

---

## 3. P1: Functional bugs

| # | Bug | Where | Status |
|---|---|---|---|
| B1 | **Role editing fails for every role manager except Super Admin.** The Roles page sends the full permission list, including grants the editor doesn't hold. The backend rejects the whole request, for example: Admin editing Agent gets `403 You cannot grant: complaint.receive, complaint.reject.request` without changing anything. | [roles/page.tsx:150](admin-panel/src/app/(admin)/roles/page.tsx#L150), [role_routes.py:94](backend/routes/role_routes.py#L94) | verified |
| B2 | **Every admin CSV download is saved as `download.csv`.** CORS doesn't expose `Content-Disposition`, so the filename is unreadable. | [api.ts:665](admin-panel/src/lib/api.ts#L665), [app.py:39](backend/app.py#L39) | verified |
| B3 | **Complaint registration can double-submit.** The guard checks `loading`, but `loading` is never set to `true`, so there's no spinner and a double tap creates duplicates. | [register/page.tsx:231](end-user/app/dashboard/register/page.tsx#L231) | code |
| B4 | **A department with no active categories can't receive portal complaints.** The UI requires a category; the API treats it as optional. | [register/page.tsx:164,195](end-user/app/dashboard/register/page.tsx#L164) | code |
| B5 | **OTP resend fails at first.** The UI timer is hardcoded to 25 s but the backend cooldown is 30 s, so pressing Resend returns "Please wait 5 seconds". The UI should use `resend_after_seconds` from the response. | [LoginFlow.tsx:98](end-user/components/Login/LoginFlow.tsx#L98) | code |
| B6 | **Deactivated or on-leave staff keep their open complaints** and any rejection requests routed to them. Nothing re-routes them. When an end user reopens a complaint and no officer is available, it stays assigned to the inactive user, because `auto_route` never clears `assigned_to`. | [user_routes.py:205](backend/routes/user_routes.py#L205), [portal_routes.py:391](backend/routes/portal_routes.py#L391) | code |
| B7 | **The complaint list stops at 500 rows** (1000 maximum) with no pagination, so older complaints can't be reached from the UI. The page's department filter only filters those loaded rows. | [complaint_routes.py:116](backend/routes/complaint_routes.py#L116), [complaints/page.tsx:53](admin-panel/src/app/(admin)/complaints/page.tsx#L53) | code |
| B8 | **Dashboard arrows point the wrong way for Open and In Progress.** The API returns the change without its sign plus a good/bad flag, and the card picks the arrow from good/bad. An 18% drop in open complaints shows a green **up** arrow. | [MetricCards.tsx:75](admin-panel/src/components/MetricCards.tsx#L75), [complaint_service.py:443](backend/services/complaint_service.py#L443) | code |
| B9 | **The "high priority open" count doesn't match the list it links to.** The count includes in-progress complaints (and the field is misnamed `escalations`), but the link filters `group=open`. | [complaint_routes.py:96](backend/routes/complaint_routes.py#L96), [PendingActionsList.tsx:188](admin-panel/src/components/PendingActionsList.tsx#L188) | code |
| B10 | **"Reopened %" in Reports can go above 100%.** The numerator includes complaints that are currently open; the denominator is resolved complaints only. | [analytics_service.py:198](backend/services/analytics_service.py#L198) | code |
| B11 | **The status donut leaves out Rejected**, so its slices don't add up to the total in the middle. | [ComplaintsByStatusChart.tsx:33](admin-panel/src/components/ComplaintsByStatusChart.tsx#L33) | code |
| B12 | **Deactivating a location doesn't stop complaints under it.** Only the selected node's own flag is checked, and the end user's registered location is used as a fallback. The admin UI says "locations below it are hidden with it". | [complaint_service.py:46](backend/services/complaint_service.py#L46) | code |
| B13 | **Words run together in 7 places**, where a regex script turned `{" "}` into `{""}`: "code to******3210", "Welcome to theCivicCare…", "Showing 5 of 5complaints", "Email:admin@…". | [LoginFlow.tsx:800](end-user/components/Login/LoginFlow.tsx#L800), [NeedHelpModal.tsx:34](end-user/components/Login/NeedHelpModal.tsx#L34), [complaints/page.tsx:228](end-user/app/dashboard/complaints/page.tsx#L228) | code |
| B14 | **The portal has no navigation on desktop.** The header's "Profile Settings" and "My Complaints History" items only close the menu, the header search box filters nothing, and the bottom nav is mobile-only. | [TopHeader.tsx:85,132-145](end-user/components/Dashboard/TopHeader.tsx#L132) | code |
| B15 | **Portal complaint dates can be off by a day.** `new Date(created_at)` reads the naive UTC timestamp as local time, so dates are wrong for up to 5.5 h each day in IST. | [complaints/page.tsx:201](end-user/app/dashboard/complaints/page.tsx#L201) | code |
| B16 | **Staff can't change their own password**, because the admin panel has no screen for it (see S10). | admin-panel | code |
| B17 | **Password-reset request errors are invisible.** The error is set on the login form behind the modal. | [AdminLogin.tsx:88](admin-panel/src/components/AdminLogin.tsx#L88) | code |
| B18 | **Opening the admin notification bell marks everything read** immediately, so the unread highlight is gone before you can see it. | [TopHeader.tsx:61-67](admin-panel/src/components/TopHeader.tsx#L61) | code |
| B19 | **Registering a complaint from the header's Quick Actions doesn't refresh the current page.** No `onRefresh` is passed, and `DashboardView` imports `QuickActionsBar` but never uses it. | [TopHeader.tsx:197](admin-panel/src/components/TopHeader.tsx#L197) | code |
| B20 | **Two open tabs can log each other out.** Both refresh at the same time with the same refresh token; rotation revokes it, the second tab gets a 401 and clears the new tokens the first tab just stored. | [api.ts:540](admin-panel/src/lib/api.ts#L540), [apis.ts:219](end-user/lib/apis.ts#L219) | likely |
| B21 | **Portal notification features that can't work:** the "Civic Alerts" tab filters on `civic_alert`, which the backend never sends; the icon mapping never matches real notification kinds; the Help modal only opens via `?help=true`. | [notifications/page.tsx:83,89](end-user/app/dashboard/notifications/page.tsx#L83), [LoginFlow.tsx:65](end-user/components/Login/LoginFlow.tsx#L65) | code |
| B22 | **Profile photo "upload" is fake.** It writes a data URL to `localStorage`, never reaches the server, and throws `QuotaExceededError` on larger photos. | [profile/page.tsx:155-168](end-user/app/dashboard/profile/page.tsx#L155) | code |
| B23 | **Saving the profile writes a placeholder gender.** An empty gender is shown as `"Not Specified"` and saved back to the database. | [profile/page.tsx:81](end-user/app/dashboard/profile/page.tsx#L81) | code |
| B24 | **The country-code picker is misleading.** It offers +1, +44 and +971, but the backend keeps only the last 10 digits and always sends SMS with +91. The flag always shows India. | [LoginFlow.tsx:33,521](end-user/components/Login/LoginFlow.tsx#L33), [security.py:73](backend/utils/security.py#L73) | code |
| B25 | **The registration success screen is partly fake.** "View My Complaints" goes to Home, the Copy button does nothing, and the "What's next" steps are hardcoded ("A field agent will be assigned shortly") even when routing already assigned the complaint or it's waiting in the queue. | [register/page.tsx:1100-1190](end-user/app/dashboard/register/page.tsx#L1100) | code |
| B26 | **One bad complaint can block all SLA processing.** `run_check` commits once at the end, so an exception on any complaint rolls back every warning and escalation in that run, and the same failure repeats every minute. | [sla_service.py:378-394](backend/services/sla_service.py#L378) | code |
| B27 | **A department's escalation override can't be removed.** Disabling it turns escalation off for that department instead of falling back to the default rule, and there's no delete endpoint. | [sla_routes.py:128](backend/routes/sla_routes.py#L128), [sla_service.py:77](backend/services/sla_service.py#L77) | code |

---

## 4. Hardcoded values, dummy data and fallbacks

### 4a. Dummy or demo data in live code

| What | Where |
|---|---|
| Profile page starts with a fake person: "Rahul Sharma", `rahul.sharma@example.com`, "+91 98765 43210", "123, Mansarovar Colony, Jaipur…302020", DOB 1998-03-15, "Male". It shows before load, and permanently if the API call fails (the error is swallowed). Initials fall back to "RS". | [profile/page.tsx:23-29,176](end-user/app/dashboard/profile/page.tsx#L23) |
| Complaint location falls back to `"Jaipur, Rajasthan"`; also `"Low"`, `"Untitled"`, `"N/A"`, and legacy `cmpId` / `area` / `city` fields that the API doesn't return. | [complaints/page.tsx:183-201](end-user/app/dashboard/complaints/page.tsx#L183) |
| Registration fallbacks: complaint ID `"CMP-10231"`, country `"India"`, department `"Electricity"`; footer "© 2025 CivicConnect"; placeholder "Near Mansarovar Metro Station…". | [register/page.tsx:948,1100,1123,1201,835](end-user/app/dashboard/register/page.tsx#L1100) |
| Reset-request department dropdown lists 6 invented departments that don't match the DB (for example "Water Supply" vs "Water"). | [AdminLogin.tsx:402-407](admin-panel/src/components/AdminLogin.tsx#L402) |
| Fake support contacts: "+91 1800-CIVIC-CARE" / `support@civiccare.gov.in` in an `alert()`, a "Gov Gateway Secure" badge, `admin@civiccare.org`, "1800-112-345 (24/7)" next to "Mon–Sat 9–6". A tip tells end users that OTPs appear in the server logs. | [Sidebar.tsx:133](admin-panel/src/components/Sidebar.tsx#L133), [AdminLogin.tsx:335-343](admin-panel/src/components/AdminLogin.tsx#L335), [NeedHelpModal.tsx:55-79](end-user/components/Login/NeedHelpModal.tsx#L55) |
| CSV import templates use Indian sample rows and a fixed 5-column layout. | [locations/page.tsx:292](admin-panel/src/app/(admin)/locations/page.tsx#L292), [end-users/page.tsx:164-166](admin-panel/src/app/(admin)/end-users/page.tsx#L164) |
| Colour and icon maps keyed on the seed department names (Electricity, Water, Roads…). | [TopDepartments.tsx:11](admin-panel/src/components/TopDepartments.tsx#L11), [RecentComplaintsTable.tsx:30](admin-panel/src/components/RecentComplaintsTable.tsx#L30), [RecentComplaints.tsx:23](end-user/components/Dashboard/RecentComplaints.tsx#L23) |
| Claims the UI can't back up: "Verified" badges, a "Live real-time feed" that polls every 25 s, "Fast & Secure / Safe & Encrypted", a fake map with a dead "Use My Location" button and a background image from a third-party site, dead "View FAQs", "Contact Support", "View Departments" and "View All" buttons. | profile, [RecentActivity.tsx:118](end-user/components/Dashboard/RecentActivity.tsx#L118), [register/page.tsx:492,809-822](end-user/app/dashboard/register/page.tsx#L809), [TopDepartments.tsx:30](admin-panel/src/components/TopDepartments.tsx#L30) |
| 12 unused components full of sample data: `sampleComplaints` (12 fake complaints), `sampleActivities`, `StatsCards` defaulting to 12/3/8/1 with fake "↑ 2 since last week" trends, an Unsplash image fallback, toasts such as "Suggestion submitted to City Council". | `end-user/components/Dashboard/`: DashboardView, HeroBanner, MegaphoneArtwork, QuickActions, RecentActivityFeed, RecentComplaintsList, RecentComplaintsTable, StatsCards, Header, NotificationPanel, ProfileSettingsPanel; `Login/MobileLeaves` |
| `seed.py` is entirely demo data (8 civic departments, 13 staff with `.gov.in` emails sharing one password, 240 complaints), and **the whole test suite depends on it**. | [backend/seed.py](backend/seed.py), [tests/conftest.py](backend/tests/conftest.py) |

### 4b. Business settings written as code constants (should be data the admin can manage)

| Setting | Where it's hardcoded |
|---|---|
| Priorities Low / Medium / High / Critical | [complaint_service.py:23](backend/services/complaint_service.py#L23), `DEFAULT_SLA_RULES`, [complaint_routes.py:97](backend/routes/complaint_routes.py#L97); on the frontend in QuickActionsBar:293, complaints/page:109, reports/page:177, `status.ts`, register `PRIORITIES`, `getPriorityStyles` |
| Rejection reasons (including civic ones: "Outside municipal jurisdiction", "Private property matter") | [rejection_service.py:32](backend/services/rejection_service.py#L32) |
| Location levels country / state / district / city / area; there's no API to change them | [permission_catalog.py:118](backend/services/permission_catalog.py#L118), [register/page.tsx:40](end-user/app/dashboard/register/page.tsx#L40), end-user import columns, report default level `"district"` ([report_routes.py:78](backend/routes/report_routes.py#L78), [reports/page.tsx:116,257](admin-panel/src/app/(admin)/reports/page.tsx#L116)) |
| India-only phone rules: truncate to the last 10 digits, `+91`, "does not look like an Indian mobile", "10-digit", 🇮🇳 +91 on the admin login | [security.py:73](backend/utils/security.py#L73), [config.py:29](backend/config.py#L29), [import_service.py:266,319](backend/services/import_service.py#L319), [AdminLogin.tsx:241](admin-panel/src/components/AdminLogin.tsx#L241) |
| Complaint ID format `CMP-{10000+id}` | [complaint_service.py:97](backend/services/complaint_service.py#L97) |
| Limits: 5 attachments, 10 MB, extension list, 50k import rows, 0.85 name similarity, 50k audit export, 300 rejection requests, SLA bounds (30 d / 180 d / level 10), UI SLA defaults 24 / 72 / 120, SLA table thresholds 90 / 75 | complaint_service:25-31, import_service:29-31, audit_routes:14, rejection_routes:56, sla_routes:77-134, [sla/page.tsx:129-131](admin-panel/src/app/(admin)/sla/page.tsx#L129), PerformanceTable:16 |
| Welcome taglines chosen by role key, which breaks your "permissions, not role names" rule; custom roles fall back to the Super Admin tagline | [DashboardView.tsx:18-24,98](admin-panel/src/components/DashboardView.tsx#L18) |
| Escalation chain text "Agent → Supervisor → Manager → Admin → Super Admin", wrong as soon as roles change | [sla/page.tsx:276](admin-panel/src/app/(admin)/sla/page.tsx#L276) |
| Polling every 60 s and 25 s, a 25 s OTP timer, a 1.6 s artificial "verifying" delay | TopHeader, NotificationBell, RecentActivity, notifications page, LoginFlow |
| Default language "English (India)", although no translations exist | [models.py:173](backend/models.py#L173), profile page |
| The audit entity filter omits `import` and `sla` | [audit-logs/page.tsx:14](admin-panel/src/app/(admin)/audit-logs/page.tsx#L14) |

### 4c. Silent fallbacks that hide missing data or errors

- **SLA:** `FALLBACK_SLA = (24, 120, 120)` applies when no rule exists ([sla_service.py:45,67](backend/services/sla_service.py#L45)). This should raise an error or an admin alert.
- **Priority:** defaults to Medium in [complaint_service.py:52](backend/services/complaint_service.py#L52), [complaint_routes.py:27](backend/routes/complaint_routes.py#L27) and `Form("Medium")` in [portal_routes.py:295](backend/routes/portal_routes.py#L295); the portal UI defaults to Low.
- **Staff-registered complaints:** the description falls back to the title ([complaint_routes.py:180](backend/routes/complaint_routes.py#L180)).
- **Portal complaints:** the location falls back to the end user's registered location ([portal_routes.py:311](backend/routes/portal_routes.py#L311)).
- **Reports:**
  - An unknown `location_id` is silently ignored ([analytics_service.py:96](backend/services/analytics_service.py#L96)).
  - An unknown `level` becomes the deepest level (:289).
  - A missing department becomes `"?"` (:280).
  - An unknown status is grouped as `"open"`.
- **Role name:** `"End User"` in [portal_routes.py:82](backend/routes/portal_routes.py#L82); the portal header defaults the name to "End User" and the initials to "C".
- **API base URL:** both frontends fall back to `http://localhost:5000`, and the portal also accepts a second env name, `NEXT_PUBLIC_BACKEND_URL`.
- **Errors shown as empty states in the portal:**
  - StatCard shows "–" forever.
  - Recent complaints says "You haven't raised any complaints yet".
  - Activity says "No Recent Activity".
  - Notifications say "You are completely caught up".
  - The profile keeps the dummy person.
- **Environment config:** `os.getenv(name, default)` for every setting: the DB URI and JWT secret (S1, S2), plus OTP TTL, token lifetimes, reopen window, SMTP port and upload size. Decide which should be required.

### 4d. Infrastructure values in code

- [docker-compose.yml:8-11](docker-compose.yml#L8): MySQL root and user passwords.
- Frontend containers run `npm run dev` with `NODE_ENV=development`, and the API URL is baked in as `localhost:5000`.
- Backend `.env` points at `localhost`, which the MySQL container can't be reached through.
- Port 5000 is hardcoded in `app.py` and the Dockerfile; the uploads folder is relative to the working directory.
- Health check reports `"version": "1.0.0"` ([health_service.py:11](backend/services/health_service.py#L11)).

### 4e. Branding and wording

- **Three product names:** CivicCare (admin panel, portal login), CMS (portal header), CivicConnect (register footer).
- **Portal `<title>`** is still "Create Next App" ([end-user/app/layout.tsx:16](end-user/app/layout.tsx#L16)).
- **Civic wording in backend messages end users see:** "registered by a municipal officer", "under review by a senior officer", "contact your municipal office".
- **Civic wording in portal copy:** "Your city", "Municipal Portal", "Civic Alerts", "Cleaner Communities".

Branding was deliberately left alone earlier; it's listed here so it can be decided in one go.

---

## 5. P2: Backend edge cases and design gaps

**Workflow and routing**
- **No reclassification.** A complaint filed under the wrong department, category, location or priority can't be corrected; the only option is rejection.
- **End users pick their own priority**, which sets their SLA. Decide whether staff set it, or it comes from the category.
- **Complaints registered by staff "on behalf of" someone aren't linked to an end-user record**, so that person never sees them in the portal or gets notifications.
- **The unassigned queue is never retried automatically** when an officer becomes available; only the manual Auto-assign button does it.
- **Reassigning resets the SLA.** Reassigning a complaint that's still awaiting a response resets the response clock and ends the escalation ([sla_service.py:109-115](backend/services/sla_service.py#L109)). Repeated reassignment keeps a complaint "on track"; the breach event stays in the history, but reports and escalation lose it.
- **Staff "Reopen"** has no reopen-count or time-window limit (end users do).
- **A complaint awaiting a rejection decision can be reassigned.** The pending request stays with the original requester, and the new handler can't withdraw it.
- **Changing a user's scopes or role leaves their complaints assigned** even if they can no longer see them.
- **Attachments:**
  - The 5-file limit is per request, not per complaint.
  - Files are written before the DB commit, so a failure leaves orphan files.
  - The browser-supplied content type is stored as-is, with no content sniffing.

**SLA**
- **The check scans more and more rows each minute.** Every run loads every active complaint whose warning time has passed, forever ([sla_service.py:381-388](backend/services/sla_service.py#L381)). Filter on "not yet warned / not yet breached / escalation due".
- **Double escalations with several API workers.** Each worker runs its own checker; the docs mention it, but the default is in-process. Use a DB lock (`FOR UPDATE SKIP LOCKED`) or a single worker.
- **Duplicate default rules are possible.** `UNIQUE(priority, department_id)` doesn't stop duplicates when `department_id` is NULL in MySQL. Startup bootstrap also runs in every worker at once and can race on unique keys.
- **Wall-clock only**, no business hours or holidays. That's fine if intended, but document it.

**Auth and accounts**
- **Refresh tokens:**
  - Reusing an already-rotated refresh token doesn't revoke the whole session.
  - Two concurrent refreshes aren't locked.
  - `refresh_tokens` and `otp_challenges` are never cleaned up.
- **An access token stays valid for 60 minutes after a password change.**
- **Email validation is minimal**: `a@@b.c` passes ([security.py:84](backend/utils/security.py#L84)).
- **SMTP has no timeout** ([otp_service.py:85](backend/services/otp_service.py#L85)), so a slow mail server can hang a worker. Provider settings aren't validated at startup.
- **Notifications are in-app only.** The end user's SMS and email preferences have no effect.
- **Audit IP addresses** will be the proxy's IP behind a reverse proxy ([audit_service.py:46](backend/services/audit_service.py#L46)).

**Data**
- **No migrations.** `create_all` never alters existing tables, so every schema change needs a manual step or a reseed. Adopt Alembic.
- **Times are naive UTC, and day buckets are computed in UTC**: the dashboard 7-day trend, reports, the report date presets (`toISOString`) and the audit date filter. For IST users, "today" is wrong until 05:30.
- **Top-level location names aren't unique at the DB level** (NULL parent).
- **Reset ticket IDs have only 3 random bytes**, so a collision causes a 500.
- **Retention:** import issues keep the full CSV row (PII) indefinitely, and the audit log has no retention policy.
- **Access is broader than scope in two places:** the audit log isn't scope-filtered, and anyone with `sla.manage` (even with a department scope) can change global SLA defaults. Confirm both are intended.

**Imports and reports**
- **Imports run inside the request.** They do 4+ queries and a flush per row, so a 50k-row file will time out. Move them to a background job.
- **Inactive locations are matched during import**: children get created under them, and end users get attached to them.
- **One bad row can abort the whole import.** For example, an accent-insensitive duplicate raises `IntegrityError` ([import_service.py:229](backend/services/import_service.py#L229)).
- **`create_location` can crash with a 500** when no depth-0 location type exists: the error message reads `parent.name` while `parent` is `None` ([location_service.py:41](backend/services/location_service.py#L41)).
- **Reports select complaints by submission date only**, so "resolved per day" leaves out older complaints resolved in the period. Document this or add a resolved-date mode.

**Performance**
- **N+1 queries** in complaint serialization (attachments, comments, assignee), notification lists, portal activities and reset tickets (one query per ticket).
- **Whole tables loaded into Python:** `list_users`, `manual_candidates` and `next_up` load every user and filter in Python.
- **Dashboard load:** `dashboard_stats` runs about 30 COUNT queries, and the dashboard also fetches 500 full complaints to show 5.
- **Reports** re-read all rows for each of 3–4 calls per page view.

---

## 6. Admin panel: other issues

- **The user form depends on `role.view`.** Someone with `user.create` but no `role.view` sees an empty role list and can't create anyone.
- **New users default to the widest scope**, "All departments · All locations" ([users/page.tsx:34](admin-panel/src/app/(admin)/users/page.tsx#L34)). The initial password is shown in plain text, with no generator and no forced change.
- **Every user edit re-sends scopes and `clear_reports_to`**, so unrelated edits can fail scope validation.
- **Missing screens and safeguards:**
  - No screen to edit an end user (the API supports name, mobile, email and location) or to add a single end user.
  - No way to rename a category.
  - No UI for department escalation overrides.
  - SLA overrides are deleted without confirmation.
  - Categories deactivate on a single click.
- **Complaint detail page:**
  - It never refreshes, so actions go stale and return 409.
  - Note text carries over when you switch actions.
  - The "Internal note" box stays ticked after sending.
- **Accessibility:**
  - `Modal` has no Escape key or focus trap.
  - `CustomSelect` buttons lack `type="button"` (they would submit a surrounding form) and have no keyboard support.
  - Table rows are clickable by mouse only.
  - Location tree actions appear on hover only (no touch or keyboard).
- **Usability:**
  - All scrollbars are hidden globally ([globals.css:20-31](admin-panel/src/app/globals.css#L20)).
  - The layout isn't responsive.
  - "Today" is computed once and goes stale after midnight.
  - The locale is fixed to en-GB.
- **Roles page access:** it requires `role.manage`; users with only `role.view` can't open it.
- **Lint:** 7 unused imports.

## 7. End-user portal: other issues

- **Dead code:** 12 unused components (about 2,700 lines) plus `otpStore.ts`. `framer-motion` is installed but never imported.
- **Files damaged by the regex scripts.** `remove_roundness.py` and `strip_rounded.py` collapsed every double space and deleted spaces before quotes in all `.ts` / `.tsx` files. That produced the broken indentation, `from"react"`-style imports and the B13 text bugs. `fix_roundness.py` also walked `node_modules`.
- **`globals.css` (3,414 lines):**
  - 212 of 293 custom classes are unused, and 21 more are used only by dead components.
  - 75 forced `border-radius: 0` rules and 61 `!important` fight the rounded mockups.
- **ESLint:** 22 errors (`no-explicit-any` ×7, `set-state-in-effect` ×6, unescaped entities ×9) and 28 warnings.
- **Duplicate polling:**
  - NotificationBell every 60 s.
  - RecentActivity every 25 s, even on phones where it's hidden.
  - The notifications page every 25 s.
  - MobileBottomNav fetches again on every route change.
- **Profile page:**
  - Saving doesn't refresh the session, so the header keeps the old name.
  - Language is free text with a fake dropdown arrow.
  - The notification tab is hidden on mobile, and its settings do nothing (no SMS or email notifications exist).
  - The end user can't update their registered location.
- **Status is lost on Home.** The home "Recent Complaints" pill shows the group ("In Progress") instead of the status, so "Waiting for Information" (the end user needs to act) isn't visible there.
- **The My Complaints page isn't built for phones:** a 7-column table at 390 px, square corners, unlike the mockups.
- **Register page:**
  - Location levels are hardcoded.
  - Limits differ from the backend: title 100 vs 200, description 500 vs unlimited, details 200 vs 500.
  - Extra files beyond 5 are dropped silently.
  - Image preview object URLs are created on every render and never freed.
  - The accepted file types don't match the help text.
  - Fixed heights with `overflow-hidden` can cut the form off on short laptop screens.
- **Login:**
  - `?step=otp_mobile` or `?step=verifying` opens a broken screen.
  - Signed-in users aren't redirected away from `/login`.
  - The "verifying" back button guesses the channel from whether an email was typed.
- **Notifications:** "Clear" deletes everything permanently without asking.
- **Complaint detail:** doesn't refresh on its own, and the CSV preview parser splits on every comma.

## 8. Repository hygiene

- **Committed by mistake:** `backend/__pycache__` (10 `.pyc`), `backend/uploads` (11 files, about 33 MB), `end-user/scratch/` (15 files, including screenshots and a JWT), 8 root codemod scripts, `scratch_css.txt`, `test.jpg` (0 bytes) and `test.png`. `.gitignore` has the right patterns, but these were added earlier.
- **Documentation:**
  - The admin and portal READMEs are create-next-app boilerplate.
  - The backend README says tests use SQLite (they use MySQL `cms_test`) and publishes the demo password.
- **`.env.example`:**
  - It's missing `JWT_SECRET_KEY` (its comment sits above `DATABASE_URI`) and `MAX_CSV_UPLOAD_BYTES`.
  - The local `.env` uses the legacy `ENVIRONMENT` name.
- **docker-compose:**
  - No DB health check before the backend starts.
  - `uploads` isn't a volume, so it's lost on rebuild.
  - No service runs the SLA worker.
- **Tooling:** no Python lint or format config, and no CI.

## 9. Test coverage

**What's good:** 58 integration tests, all passing, covering RBAC scoping, routing, the workflow, SLA and escalation, rejection, imports and reports.

**What's missing:**
- The tests depend on `seed.py` demo data and a hardcoded DB password.
- They share one database for the whole session and change roles along the way, so they depend on run order.
- Untested areas:
  - Attachments: type, size and access control.
  - Refresh rotation and reuse, logout, change password, and the reset-ticket approval scope.
  - CSV injection and pagination.
  - Reassigning complaints when a handler is deactivated.
  - Location deactivation cascading to children.
  - SLA run isolation (B26).
  - Role saves by a non-super-admin (would have caught B1).
  - Profile validation.
- There are no frontend tests at all.

---

## 10. Suggested fix order

1. **Security (P0):**
   - S1–S9 and S11–S15.
   - Rotate the DB password.
   - Remove `uploads/`, `__pycache__/` and `scratch/` from git.
   - Pin the tested dependency versions.
2. **Confirmed bugs:** B1–B27.
3. **Remove hardcoding (section 4):**
   - Move priorities, rejection reasons, location levels, phone rules, the ID prefix and upload limits into the DB with admin screens (or into env where they're deployment settings).
   - Delete the dummy data and the 12 dead components.
   - Replace silent fallbacks with explicit errors and real error states.
   - Build non-demo test fixtures so `seed.py` can be retired or fenced off.
4. **Gaps:**
   - Reclassification.
   - Change-password screen and forced change on first login.
   - End-user edit screen.
   - Pagination.
   - Reassignment on deactivation.
   - Alembic migrations.
   - Background jobs for imports.
   - Email/SMS notifications that respect preferences.
5. **Quality:**
   - Prettier and ESLint clean-up of the portal, and trimming `globals.css`.
   - Responsive admin panel.
   - Portal pages matching the mockups.
   - Accessibility fixes.

**Decisions needed before step 3:**
1. **Priority:** who sets it — the end user, staff, or a per-category default?
2. **Which defaults count as "fallbacks" to remove?** UX defaults such as "last 30 days" on Reports or a page size of 25 aren't hiding errors. Keep them, or require an explicit choice everywhere?
3. **Product name and wording:** CivicCare, CMS or CivicConnect, and whether to drop the civic language now.
