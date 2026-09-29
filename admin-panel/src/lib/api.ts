/**
 * Typed client for the CMS API.
 *
 * Sessions: the API keeps the refresh token in an httpOnly cookie (never
 * visible here) and returns a short-lived access token, which lives only in
 * memory. On a 401 the client refreshes once (serialized across tabs with the
 * Web Locks API) and retries; when that fails the UNAUTHORIZED_EVENT fires.
 */

const configuredUrl = process.env.NEXT_PUBLIC_API_URL;
if (!configuredUrl) {
  throw new Error("NEXT_PUBLIC_API_URL is not set. Copy .env.example to .env.local and set it to the API's URL.");
}
export const API_URL = configuredUrl.replace(/\/+$/, "");

/** Fired on window when the session has ended and cannot be refreshed. */
export const UNAUTHORIZED_EVENT = "cms:unauthorized";
/** Fired after notifications were read or cleared, so every list of them refreshes. */
export const NOTIFICATIONS_CHANGED_EVENT = "cms:notifications-changed";

const CLIENT_HEADER = { "X-Requested-With": "cms" };
const PRINCIPAL = "staff";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoleRef {
  id: number;
  key: string;
  name: string;
}

export interface LocationRef {
  id: number;
  name: string;
  type: string;
  type_name: string;
  path_ids: number[];
  path_names: string[];
  label: string;
}

export interface UserCustomPermission {
  id: number;
  key: string;
  group: string;
  description: string;
  is_granted: boolean;
}

export interface UserScope {
  department: { id: number; name: string } | null;
  location: LocationRef | null;
}

export interface StaffUser {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  role: RoleRef;
  reports_to: { id: number; name: string } | null;
  primary_department?: { id: number; name: string } | null;
  primary_location?: LocationRef | null;
  custom_permissions?: UserCustomPermission[];
  scopes: UserScope[];
  is_active: boolean;
  /** Off = skipped by automatic complaint routing (e.g. on leave). */
  is_available: boolean;
  must_change_password: boolean;
  created_at: string;
  last_login_at: string | null;
  can_manage?: boolean;
}

export interface Me extends StaffUser {
  permissions: string[];
  is_super_admin: boolean;
}

/** Staff roles form the hierarchy; the End User role holds portal permissions. */
export type RoleAudience = "staff" | "end_user";

export interface RoleDetail extends RoleRef {
  description: string | null;
  audience: RoleAudience;
  parent_id: number | null;
  depth: number;
  is_system: boolean;
  is_root: boolean;
  permissions: string[];
  user_count: number;
  assignable: boolean;
  editable: boolean;
}

export interface PermissionDef {
  key: string;
  group: string;
  description: string;
  audience: RoleAudience;
}

export type PriorityTone = "neutral" | "info" | "success" | "warning" | "danger" | "critical";

export interface Priority {
  id: number;
  key: string;
  name: string;
  rank: number;
  tone: PriorityTone;
  is_active: boolean;
}

export type PriorityRef = Pick<Priority, "id" | "name" | "tone">;

export interface Category {
  id: number;
  name: string;
  is_active: boolean;
  default_priority: PriorityRef;
}

export interface Department {
  id: number;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  categories: Category[];
  open_complaints?: number;
}

export interface LocationNode {
  id: number;
  name: string;
  parent_id: number | null;
  type: string;
  type_name: string;
  is_active: boolean;
  children: LocationNode[];
}

export interface LocationLevel {
  id: number;
  key: string;
  name: string;
  depth: number;
  locations: number;
}

export interface EndUserRow {
  id: number;
  external_id: string | null;
  name: string;
  mobile: string;
  email: string;
  location: LocationRef | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ImportResult {
  batch_id: number;
  dry_run: boolean;
  total_rows: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  warnings: number;
  errors: { row: number; message: string }[];
  warning_list: { row: number; message: string }[];
  truncated: boolean;
}

export type ImportKind = "locations" | "end_users";

export interface ImportBatch {
  id: number;
  kind: ImportKind;
  filename: string | null;
  uploaded_by: string;
  dry_run: boolean;
  status: "completed" | "validated" | "rejected";
  error: string | null;
  total_rows: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  warnings: number;
  started_at: string;
  finished_at: string | null;
}

export interface ImportBatchDetail extends ImportBatch {
  issues: { row: number; severity: "error" | "warning"; message: string }[];
  issues_truncated: boolean;
}

export interface AuditEntry {
  id: number;
  actor_type: "staff" | "end_user" | "system";
  actor_id: number | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  changes: Record<string, [unknown, unknown]> | null;
  ip_address: string | null;
  created_at: string;
}

export type ComplaintStatus =
  | "SUBMITTED"
  | "ASSIGNED"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "WAITING_FOR_INFORMATION"
  | "RESOLVED"
  | "CLOSED"
  | "REJECTED"
  | "REOPENED"
  | "REJECTION_REQUESTED";

export type StatusGroup = "open" | "in_progress" | "resolved" | "rejected";

export interface Attachment {
  id: number;
  /** Signed, short-lived link relative to the API. */
  url: string;
  file_name: string;
  content_type: string;
  file_size: number | null;
  comment_id: number | null;
  uploaded_by_type: "staff" | "end_user" | null;
  created_at: string;
}

export type SlaState = "on_track" | "at_risk" | "breached" | "paused" | "met" | "met_late" | null;

export interface Escalation {
  level: number;
  type: "response" | "resolution";
  to: { id: number; name: string; role: string };
  next_at: string | null;
}

export interface ComplaintData {
  id: string;
  title: string;
  description: string;
  additional_details: string | null;
  department: string;
  department_id: number;
  /** Null only for complaints filed before categories were required. */
  category: string | null;
  category_id: number | null;
  priority: Priority;
  location: string;
  location_detail: LocationRef;
  end_user_name: string | null;
  end_user_phone: string | null;
  status: ComplaintStatus;
  status_label: string;
  status_group: StatusGroup;
  assignee: { id: number; name: string; role: string } | null;
  created_at: string;
  updated_at: string;
  assigned_at: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_note: string | null;
  reopen_count: number;
  feedback_rating: number | null;
  feedback_comment: string | null;
  attachments: Attachment[];
  response_due_at: string | null;
  resolution_due_at: string | null;
  sla: { response: SlaState; resolution: SlaState };
  sla_paused: boolean;
  escalation: Escalation | null;
}

export interface TimelineEvent {
  id: number;
  type: string;
  message: string;
  public: boolean;
  note: string | null;
  from_status: ComplaintStatus | null;
  to_status: ComplaintStatus | null;
  actor_type: "staff" | "end_user" | "system";
  actor_name: string | null;
  created_at: string;
}

export interface ComplaintComment {
  id: number;
  author_type: "staff" | "end_user";
  author_name: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  attachments: Attachment[];
}

export interface WorkflowAction {
  key: string;
  label: string;
  note: "required" | "optional";
  note_label: string;
}

export interface RejectionReason {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface ComplaintDetail extends ComplaintData {
  end_user: { id: number; name: string; mobile: string; email: string } | null;
  timeline: TimelineEvent[];
  comments: ComplaintComment[];
  assignments: {
    assignee: { id: number; name: string; role: string };
    method: "auto" | "manual";
    reason: string | null;
    assigned_by: string | null;
    assigned_at: string;
    ended_at: string | null;
  }[];
  actions: WorkflowAction[];
  can_assign: boolean;
  can_comment: boolean;
  can_reclassify: boolean;
  escalations: {
    type: "response" | "resolution";
    level: number;
    from: string | null;
    to: string | null;
    created_at: string;
    resolved_at: string | null;
  }[];
  rejection: {
    can_request: boolean;
    reasons: RejectionReason[];
    requests: RejectionRequestItem[];
  };
  sla_due: {
    response_due_at: string | null;
    response_breached_at: string | null;
    resolution_due_at: string | null;
    resolution_breached_at: string | null;
  };
}

export interface RejectionRequestItem {
  id: number;
  complaint: {
    id: string;
    title: string;
    department: string;
    location: string;
    priority: Pick<Priority, "name" | "tone">;
    status: ComplaintStatus;
  };
  requested_by: { id: number; name: string; role: string };
  approver: string | null;
  category: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "WITHDRAWN";
  direct: boolean;
  decided_by: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  can_decide?: boolean;
  can_withdraw?: boolean;
}

export interface NotificationItem {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  complaint_id: string | null;
  created_at: string;
  read_at: string | null;
}

export interface SlaRule {
  id: number;
  priority: Priority;
  department: { id: number; name: string } | null;
  response_hours: number;
  resolution_hours: number;
  warning_minutes: number;
}

export interface EscalationRule {
  id: number;
  breach_type: "response" | "resolution";
  department: { id: number; name: string } | null;
  level_hours: number;
  max_level: number;
  is_active: boolean;
}

export interface AssigneeOption {
  id: number;
  name: string;
  role: string;
  workload: number;
  is_available: boolean;
  is_current: boolean;
}

/** Change vs the previous comparison window; null when there is no baseline. */
export interface Change {
  percent: number;
  direction: "up" | "down" | "flat";
  sentiment: "good" | "bad" | "neutral";
}

export interface DashboardStats {
  metrics: {
    total: number;
    total_change: Change | null;
    open: number;
    open_change: Change | null;
    in_progress: number;
    in_progress_change: Change | null;
    resolved: number;
    resolved_change: Change | null;
    rejected: number;
    rejected_change: Change | null;
    unassigned: number;
    sla_breached: number;
    sla_at_risk: number;
    escalated: number;
  };
  status_breakdown: Record<StatusGroup, { count: number; percentage: number }>;
  by_status: { status: ComplaintStatus; label: string; count: number }[];
  departments: { name: string; count: number }[];
  trend: { date: string; received: number; resolved: number }[];
  pending_summary: {
    /** null: the user can't act on these. */
    pending_resets: number | null;
    unassigned: number;
    assigned_to_me: number;
    escalated_to_me: number;
    rejection_requests: number;
    total_users: number | null;
  };
}

export interface ClassificationOptions {
  departments: { id: number; name: string; categories: { id: number; name: string; default_priority: PriorityRef }[] }[];
  locations: LocationNode[];
  priorities: Priority[];
}

export interface ComplaintFacets {
  departments: { id: number; name: string }[];
  priorities: Priority[];
  statuses: { key: ComplaintStatus; label: string }[];
}

export interface PasswordResetTicket {
  ticket_id: string;
  identifier: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: string;
  matched_user: { id: number; name: string; role: string; email: string } | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface DurationStats {
  avg: number | null;
  median: number | null;
  p90: number | null;
  count: number;
}

export interface ReportMetrics {
  total: number;
  open: number;
  in_progress: number;
  pending: number;
  resolved: number;
  rejected: number;
  unassigned: number;
  escalated_now: number;
  response_hours: DurationStats;
  resolution_hours: DurationStats;
  response_sla: { met: number; missed: number; met_pct: number | null };
  resolution_sla: { met: number; missed: number; met_pct: number | null };
  sla_breaches: number;
  avg_rating: number | null;
  rated: number;
  reopened: number;
  resolved_at_least_once: number;
  reopen_pct: number | null;
  rejection_pct: number | null;
}

export interface ReportPeriod {
  date_from: string;
  date_to: string;
}

export interface ReportOverview {
  period: ReportPeriod;
  previous_period: ReportPeriod;
  metrics: ReportMetrics;
  previous: ReportMetrics;
  trend: {
    interval: "day" | "week";
    points: { date: string; received: number; resolved: number; breached: number }[];
  };
}

export interface PerformanceRow {
  id: number | null;
  name: string;
  role?: string | null;
  path?: string;
  type?: string;
  total: number;
  pending: number;
  resolved: number;
  rejected: number;
  escalated_now: number;
  avg_response_hours: number | null;
  avg_resolution_hours: number | null;
  response_sla_pct: number | null;
  resolution_sla_pct: number | null;
  sla_breaches: number;
  avg_rating: number | null;
  reopened: number;
}

export type ReportQuery = {
  date_from?: string;
  date_to?: string;
  department_id?: number;
  location_id?: number;
  priority_id?: number;
};

export type AuditQuery = {
  action?: string;
  entity_type?: string;
  entity_id?: string;
  actor?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
};

export interface ScopeInput {
  department_id: number | null;
  location_id: number | null;
}

export interface CustomPermissionInput {
  permission_id?: number | null;
  permission_key?: string | null;
  is_granted: boolean;
}

export type GrievanceTargetType = "colleague" | "superior" | "management" | "department" | "other";
export type GrievanceSeverity = "low" | "medium" | "high" | "critical";
export type GrievanceStatus = "submitted" | "under_review" | "investigating" | "action_taken" | "resolved" | "dismissed";

export interface GrievanceAttachment {
  id: number;
  file_name: string;
  content_type: string;
  file_size: number | null;
  url: string;
  created_at: string;
}

export interface GrievanceEvent {
  id: number;
  event_type: string;
  actor_name: string;
  from_status: string | null;
  to_status: string | null;
  message: string;
  is_confidential_note: boolean;
  note: string | null;
  created_at: string;
}

export interface StaffGrievance {
  id: number;
  tracking_id: string;
  reporter: {
    id: number | null;
    name: string;
    email: string | null;
    is_anonymous: boolean;
  };
  is_anonymous: boolean;
  accused_user: {
    id: number;
    name: string;
    role: string | null;
  } | null;
  target_type: GrievanceTargetType;
  category: string;
  severity: GrievanceSeverity;
  subject: string;
  description: string;
  incident_date: string | null;
  department: { id: number; name: string } | null;
  location: { id: number; name: string } | null;
  status: GrievanceStatus;
  assigned_investigator: {
    id: number;
    name: string;
    role: string | null;
  } | null;
  resolution_summary: string | null;
  resolution_action: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  attachments: GrievanceAttachment[];
  events?: GrievanceEvent[];
}

export interface GrievanceOptions {
  target_types: GrievanceTargetType[];
  categories: string[];
  severities: GrievanceSeverity[];
  statuses: GrievanceStatus[];
  colleagues: { id: number; name: string }[];
  investigators: { id: number; name: string; role: string }[];
  departments: { id: number; name: string }[];
  locations: { id: number; name: string }[];
}

export interface TeamAggregateMetrics {
  total_assigned: number;
  pending: number;
  resolved: number;
  rejected: number;
  escalated_now: number;
  avg_response_hours: number | null;
  avg_resolution_hours: number | null;
  response_sla_pct: number | null;
  resolution_sla_pct: number | null;
  sla_breaches: number;
  avg_rating: number | null;
  reopen_pct: number | null;
}

export interface TeamMemberPerformance extends PerformanceRow {
  email: string;
  is_available: boolean;
  is_active: boolean;
  current_active_complaints: number;
  reports_to_id: number | null;
  reports_to_name: string | null;
  primary_department: { id: number; name: string } | null;
  primary_location: { id: number; name: string } | null;
}

export interface TeamDashboardResponse {
  period: { date_from: string; date_to: string };
  team_size: number;
  aggregate: TeamAggregateMetrics | null;
  members: TeamMemberPerformance[];
}

export interface SystemSettings {
  organisation_name: string | null;
  product_name: string | null;
  support_email: string | null;
  support_phone: string | null;
  support_hours: string | null;
  timezone: string | null;
  complaint_id_prefix: string | null;
  complaint_next_number: number | null;
  reopen_window_days: number | null;
  max_reopens: number | null;
  max_attachments_per_complaint: number | null;
  max_attachment_mb: number | null;
  allowed_attachment_types: string[];
  phone_country_code: string | null;
  phone_number_length: number | null;
  phone_expected_prefixes: string | null;
  sms_notifications_enabled: boolean;
  email_notifications_enabled: boolean;
  updated_at: string | null;
}

export type SettingsForm = Omit<SystemSettings, "updated_at">;
// complaint_next_number: null keeps the current number (see the Settings page).

export interface SettingsResponse extends SystemSettings {
  supported_attachment_types: string[];
  timezones: string[];
  /** Notifications can only be enabled on these (the server may switch SMS or email off). */
  available_channels: ("sms" | "email")[];
}

export interface ConfigurationProblem {
  area: "settings" | "locations" | "priorities" | "sla";
  field: string;
  message: string;
}

/** What the app needs before sign-in (GET /public/config). */
export interface PublicConfig {
  organisation_name: string | null;
  product_name: string | null;
  support: { email: string | null; phone: string | null; hours: string | null };
  timezone: string | null;
  phone: { country_code: string | null; number_length: number | null };
  attachments: { max_per_complaint: number | null; max_mb: number | null; allowed_types: string[] };
  notifications: { sms: boolean; email: boolean };
  /** `channels`: what end users can sign in with (the server may switch SMS or email off). */
  otp: { length: number; resend_after_seconds: number; expires_in_seconds: number; channels: ("sms" | "email")[] };
  password: { min_length: number; max_bytes: number; character_classes: number };
  /** Text limits the API enforces; most are the size of the column the text is stored in. */
  limits: {
    description: number;
    comment: number;
    note: number;
    rejection_reason_min: number;
    title: number;
    additional_details: number;
    feedback: number;
    assignment_reason: number;
    person_name: number;
    external_id: number;
    address: number;
    email: number;
    staff_name: number;
    role_key: number;
    role_name: number;
    role_description: number;
    department_name: number;
    department_code: number;
    department_description: number;
    category_name: number;
    location_name: number;
    location_level_key: number;
    location_level_name: number;
    priority_key: number;
    priority_name: number;
    rejection_reason_name: number;
    reset_identifier: number;
    reset_reason: number;
    reset_note: number;
    organisation_name: number;
    product_name: number;
    support_email: number;
    support_phone: number;
    support_hours: number;
    complaint_id_prefix: number;
    phone_country_code: number;
    phone_expected_prefixes: number;
  };
  ui: {
    default_page_size: number;
    max_page_size: number;
    report_default_days: number;
    report_preset_days: number[];
    report_max_days: number;
    dashboard_recent_items: number;
    notification_menu_items: number;
    search_debounce_ms: number;
    lookup_min_chars: number;
    lookup_results: number;
    toast_seconds: number;
    csv_preview_rows: number;
    dashboard_trend_days: number;
    dashboard_comparison_days: number;
    notification_poll_seconds: number;
    complaint_refresh_seconds: number;
    sla_good_pct: number;
    sla_watch_pct: number;
  };
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const UNREACHABLE = "The server can't be reached. Check your connection and try again.";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((d: { msg?: string }) => d.msg)
        .filter(Boolean)
        .join("; ");
    }
  } catch {
    // not JSON
  }
  return `Request failed (${res.status})`;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, query: Query = {}): URL {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

let refreshInFlight: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const res = await fetch(buildUrl("/auth/refresh", { principal: PRINCIPAL }), {
    method: "POST",
    credentials: "include",
    headers: CLIENT_HEADER,
  });
  if (!res.ok) {
    accessToken = null;
    return false;
  }
  accessToken = (await res.json()).access_token;
  return true;
}

/** Exchanges the refresh cookie for a new access token. One refresh at a time, across tabs. */
export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    const attempt: Promise<boolean> =
      typeof navigator !== "undefined" && navigator.locks
        ? navigator.locks.request("cms-staff-session-refresh", doRefresh).then((refreshed) => refreshed)
        : doRefresh();
    refreshInFlight = attempt
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function send(path: string, init: RequestInit, query?: Query): Promise<Response> {
  const attempt = () =>
    fetch(buildUrl(path, query), {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: { ...(init.headers ?? {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    });
  let res: Response;
  try {
    // After a page load there is no access token yet: get one from the refresh cookie first.
    if (!accessToken) await refreshSession();
    res = await attempt();
    if (res.status === 401 && (await refreshSession())) res = await attempt();
  } catch {
    throw new ApiError(UNREACHABLE, 0);
  }
  if (res.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return res;
}

async function request<T>(path: string, options: { method?: string; body?: unknown; query?: Query } = {}): Promise<T> {
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const res = await send(
    path,
    {
      method: options.method ?? "GET",
      headers: isForm || options.body === undefined ? {} : { "Content-Type": "application/json" },
      body: isForm ? (options.body as FormData) : options.body === undefined ? undefined : JSON.stringify(options.body),
    },
    options.query,
  );
  return res.json() as Promise<T>;
}

/** Calls that must not trigger a refresh (sign-in, public data). */
async function publicRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path), {
      method: options.method ?? "GET",
      credentials: "include",
      cache: "no-store",
      headers: options.body === undefined ? {} : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(UNREACHABLE, 0);
  }
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return res.json() as Promise<T>;
}

function uploadCsv(path: string, file: File, dryRun: boolean): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("dry_run", String(dryRun));
  return request<ImportResult>(path, { method: "POST", body: form });
}

/** Saves a file from an authenticated endpoint (a plain link can't send the auth header). */
async function downloadFile(path: string, query: Query = {}): Promise<void> {
  const res = await send(path, { method: "GET" }, query);
  const disposition = res.headers.get("content-disposition") ?? "";
  const name = disposition.match(/filename="?([^";]+)"?/)?.[1];
  if (!name) throw new ApiError("The server did not name the file.", res.status);
  const blobUrl = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = name;
  link.click();
  URL.revokeObjectURL(blobUrl);
}

/** A signed attachment link as an absolute URL. */
export function attachmentUrl(attachment: Attachment): string {
  return `${API_URL}${attachment.url}`;
}

const id = (value: string) => encodeURIComponent(value);

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const api = {
  config: () => publicRequest<PublicConfig>("/public/config"),
  auth: {
    login: async (identifier: string, password: string): Promise<Me> => {
      const data = await publicRequest<{ access_token: string; user: Me }>("/auth/login", {
        method: "POST",
        body: { identifier, password },
      });
      accessToken = data.access_token;
      return data.user;
    },
    /** Picks up an existing session (after a reload) from the refresh cookie. */
    restore: () => refreshSession(),
    me: () => request<Me>("/auth/me"),
    logout: async () => {
      await fetch(buildUrl("/auth/logout", { principal: PRINCIPAL }), {
        method: "POST",
        credentials: "include",
        headers: CLIENT_HEADER,
      }).catch(() => undefined);
      accessToken = null;
    },
    setAvailability: (is_available: boolean) => request<Me>("/auth/availability", { method: "POST", body: { is_available } }),
    changePassword: async (current_password: string, new_password: string): Promise<Me> => {
      const data = await request<{ access_token: string; user: Me }>("/auth/change-password", {
        method: "POST",
        body: { current_password, new_password },
      });
      accessToken = data.access_token;
      return data.user;
    },
    raiseResetQuery: (identifier: string, reason: string) =>
      publicRequest<{ ticket_id: string; status: string }>("/auth/reset-query", {
        method: "POST",
        body: { identifier, reason },
      }),
    resetQueries: (query: { pending_only?: boolean; page?: number; page_size?: number } = {}) =>
      request<Paged<PasswordResetTicket>>("/auth/reset-queries", { query }),
    approveResetQuery: (ticketId: string) =>
      request<{ ticket_id: string; status: string; temporary_password: string; user: { id: number; name: string } }>(
        `/auth/reset-queries/${id(ticketId)}/approve`,
        { method: "POST" },
      ),
    rejectResetQuery: (ticketId: string, note: string) =>
      request<PasswordResetTicket>(`/auth/reset-queries/${id(ticketId)}/reject`, { method: "POST", body: { note } }),
  },
  settings: {
    get: () => request<SettingsResponse>("/settings/"),
    save: (form: SettingsForm) => request<SystemSettings>("/settings/", { method: "PUT", body: form }),
    status: () => request<{ problems: ConfigurationProblem[] }>("/settings/status"),
    reasons: () => request<RejectionReason[]>("/settings/rejection-reasons"),
    addReason: (name: string) => request<RejectionReason>("/settings/rejection-reasons", { method: "POST", body: { name } }),
    updateReason: (reasonId: number, data: { name?: string; is_active?: boolean }) =>
      request<RejectionReason>(`/settings/rejection-reasons/${reasonId}`, { method: "PATCH", body: data }),
    orderReasons: (ids: number[]) =>
      request<RejectionReason[]>("/settings/rejection-reasons/order", { method: "PUT", body: { ids } }),
  },
  priorities: {
    list: (includeInactive = false) => request<Priority[]>("/priorities/", { query: { include_inactive: includeInactive } }),
    create: (data: {
      key: string;
      name: string;
      tone: PriorityTone;
      response_hours: number;
      resolution_hours: number;
      warning_minutes: number;
    }) => request<Priority>("/priorities/", { method: "POST", body: data }),
    update: (priorityId: number, data: { name?: string; tone?: PriorityTone; is_active?: boolean }) =>
      request<Priority>(`/priorities/${priorityId}`, { method: "PATCH", body: data }),
    order: (ids: number[]) => request<Priority[]>("/priorities/order", { method: "PUT", body: { ids } }),
  },
  complaints: {
    stats: () => request<DashboardStats>("/complaints/admin/stats"),
    facets: () => request<ComplaintFacets>("/complaints/facets"),
    classificationOptions: () => request<ClassificationOptions>("/complaints/classification-options"),
    list: (
      filters: {
        status_filter?: string;
        group?: StatusGroup | "";
        assigned?: "me" | "unassigned" | "";
        priority_ids?: string;
        department_id?: number;
        search?: string;
        sla?: "breached" | "at_risk" | "";
        escalated?: "me" | "any" | "";
        page?: number;
        page_size?: number;
      } = {},
    ) => request<Paged<ComplaintData>>("/complaints/", { query: filters }),
    get: (complaintId: string) => request<ComplaintDetail>(`/complaints/${id(complaintId)}`),
    act: (complaintId: string, action: string, note: string | null, reasonId: number | null) =>
      request<ComplaintDetail>(`/complaints/${id(complaintId)}/actions`, {
        method: "POST",
        body: { action, note, reason_id: reasonId },
      }),
    reclassify: (
      complaintId: string,
      data: { department_id: number; category_id: number; location_id: number; priority_id: number; reason: string },
    ) => request<ComplaintDetail>(`/complaints/${id(complaintId)}/reclassify`, { method: "POST", body: data }),
    assigneeOptions: (complaintId: string) => request<AssigneeOption[]>(`/complaints/${id(complaintId)}/assignee-options`),
    assign: (complaintId: string, assignee_id: number, reason: string | null) =>
      request<ComplaintDetail>(`/complaints/${id(complaintId)}/assign`, {
        method: "POST",
        body: { assignee_id, reason },
      }),
    autoAssign: (complaintId: string) =>
      request<ComplaintDetail>(`/complaints/${id(complaintId)}/auto-assign`, { method: "POST" }),
    requestRejection: (complaintId: string, reason_id: number, reason: string) =>
      request<ComplaintDetail>(`/complaints/${id(complaintId)}/rejection-requests`, {
        method: "POST",
        body: { reason_id, reason },
      }),
    comment: (complaintId: string, body: string, isInternal: boolean, files: File[]) => {
      const form = new FormData();
      form.append("body", body);
      form.append("is_internal", String(isInternal));
      files.forEach((f) => form.append("files", f));
      return request<ComplaintDetail>(`/complaints/${id(complaintId)}/comments`, { method: "POST", body: form });
    },
    quickCreate: (data: {
      title: string;
      description: string;
      additional_details: string | null;
      department_id: number;
      category_id: number;
      location_id: number;
      priority_id: number | null;
      priority_reason: string | null;
      end_user_id: number | null;
      end_user_name: string | null;
      end_user_phone: string | null;
    }) => request<{ id: string; assignee: string | null }>("/complaints/quick-create", { method: "POST", body: data }),
  },
  users: {
    list: (query: { search?: string; role_id?: number; page?: number; page_size?: number } = {}) =>
      request<Paged<StaffUser>>("/users/", { query }),
    assignableRoles: () => request<RoleRef[]>("/users/assignable-roles"),
    create: (data: {
      name: string;
      email: string;
      mobile: string | null;
      role_id: number;
      password: string;
      reports_to_id: number | null;
      primary_department_id?: number | null;
      primary_location_id?: number | null;
      scopes?: ScopeInput[];
      custom_permissions?: CustomPermissionInput[];
    }) => request<StaffUser>("/users/", { method: "POST", body: data }),
    /** Only the fields that are sent change. */
    update: (
      userId: number,
      data: Partial<{
        name: string;
        email: string;
        mobile: string;
        clear_mobile: boolean;
        role_id: number;
        reports_to_id: number;
        clear_reports_to: boolean;
        primary_department_id: number;
        clear_primary_department: boolean;
        primary_location_id: number;
        clear_primary_location: boolean;
        scopes: ScopeInput[];
        custom_permissions: CustomPermissionInput[];
        is_available: boolean;
      }>,
    ) => request<StaffUser>(`/users/${userId}`, { method: "PATCH", body: data }),
    setActive: (userId: number, active: boolean) =>
      request<StaffUser>(`/users/${userId}/${active ? "activate" : "deactivate"}`, { method: "POST" }),
    reportsToOptions: (roleId: number) =>
      request<{ id: number; name: string; role: string }[]>("/users/reports-to-options", { query: { role_id: roleId } }),
  },
  roles: {
    list: () => request<RoleDetail[]>("/roles/"),
    permissions: () => request<PermissionDef[]>("/roles/permissions"),
    create: (data: { key: string; name: string; description: string | null; parent_id: number; permissions: string[] }) =>
      request<RoleDetail>("/roles/", { method: "POST", body: data }),
    update: (roleId: number, data: Partial<{ name: string; description: string; parent_id: number; permissions: string[] }>) =>
      request<RoleDetail>(`/roles/${roleId}`, { method: "PATCH", body: data }),
    remove: (roleId: number) => request(`/roles/${roleId}`, { method: "DELETE" }),
  },
  departments: {
    list: () => request<Department[]>("/departments/"),
    create: (data: {
      name: string;
      code: string;
      description: string | null;
      categories: { name: string; default_priority_id: number }[];
    }) => request<Department>("/departments/", { method: "POST", body: data }),
    update: (departmentId: number, data: Partial<{ name: string; code: string; description: string; is_active: boolean }>) =>
      request<Department>(`/departments/${departmentId}`, { method: "PATCH", body: data }),
    addCategory: (departmentId: number, name: string, default_priority_id: number) =>
      request<Department>(`/departments/${departmentId}/categories`, {
        method: "POST",
        body: { name, default_priority_id },
      }),
    updateCategory: (
      departmentId: number,
      categoryId: number,
      data: { name?: string; default_priority_id?: number; is_active?: boolean },
    ) => request<Department>(`/departments/${departmentId}/categories/${categoryId}`, { method: "PATCH", body: data }),
  },
  locations: {
    levels: () => request<LocationLevel[]>("/locations/types"),
    addLevel: (key: string, name: string) => request<LocationLevel>("/locations/types", { method: "POST", body: { key, name } }),
    renameLevel: (levelId: number, name: string) =>
      request<LocationLevel>(`/locations/types/${levelId}`, { method: "PATCH", body: { name } }),
    removeLevel: (levelId: number) => request(`/locations/types/${levelId}`, { method: "DELETE" }),
    tree: (includeInactive = false) =>
      request<LocationNode[]>("/locations/tree", { query: { include_inactive: includeInactive } }),
    create: (name: string, parent_id: number | null) =>
      request<LocationRef>("/locations/", { method: "POST", body: { name, parent_id } }),
    update: (locationId: number, data: { name?: string; is_active?: boolean }) =>
      request<LocationRef>(`/locations/${locationId}`, { method: "PATCH", body: data }),
    remove: (locationId: number) => request(`/locations/${locationId}`, { method: "DELETE" }),
    importCsv: (file: File, dryRun: boolean) => uploadCsv("/locations/import", file, dryRun),
    exportCsv: (includeInactive = false) => downloadFile("/locations/export", { include_inactive: includeInactive }),
  },
  endUsers: {
    list: (query: { search?: string; page?: number; page_size?: number } = {}) =>
      request<Paged<EndUserRow>>("/end-users/", { query }),
    create: (data: { external_id: string | null; name: string; mobile: string; email: string; location_id: number | null }) =>
      request<EndUserRow>("/end-users/", { method: "POST", body: data }),
    update: (
      endUserId: number,
      data: Partial<{
        external_id: string;
        name: string;
        mobile: string;
        email: string;
        location_id: number;
        clear_location: boolean;
        is_active: boolean;
      }>,
    ) => request<EndUserRow>(`/end-users/${endUserId}`, { method: "PATCH", body: data }),
    importCsv: (file: File, dryRun: boolean) => uploadCsv("/end-users/import", file, dryRun),
    exportCsv: (search?: string) => downloadFile("/end-users/export", { search }),
  },
  imports: {
    list: (query: { kind?: ImportKind; page?: number; page_size?: number } = {}) =>
      request<Paged<ImportBatch>>("/imports/", { query }),
    get: (batchId: number) => request<ImportBatchDetail>(`/imports/${batchId}`),
    downloadReport: (batchId: number, severity: "error" | "warning" | "all") =>
      downloadFile(`/imports/${batchId}/report`, { severity }),
  },
  rejections: {
    reasons: () => request<RejectionReason[]>("/rejection-requests/reasons"),
    list: (query: { view: "to_decide" | "mine" | "all"; page?: number; page_size?: number }) =>
      request<Paged<RejectionRequestItem>>("/rejection-requests/", { query }),
    approve: (requestId: number, note: string | null) =>
      request<ComplaintDetail>(`/rejection-requests/${requestId}/approve`, { method: "POST", body: { note } }),
    deny: (requestId: number, note: string) =>
      request<ComplaintDetail>(`/rejection-requests/${requestId}/deny`, { method: "POST", body: { note } }),
    withdraw: (requestId: number) => request<ComplaintDetail>(`/rejection-requests/${requestId}/withdraw`, { method: "POST" }),
  },
  notifications: {
    list: (query: { unread_only?: boolean; page?: number; page_size?: number } = {}) =>
      request<Paged<NotificationItem> & { unread_count: number }>("/notifications/", { query }),
    markRead: (notificationId: number) => request(`/notifications/${notificationId}/read`, { method: "POST" }),
    markAllRead: () => request("/notifications/read-all", { method: "POST" }),
  },
  sla: {
    config: () => request<{ priorities: Priority[]; sla_rules: SlaRule[]; escalation_rules: EscalationRule[] }>("/sla/config"),
    saveRule: (data: {
      priority_id: number;
      department_id: number | null;
      response_hours: number;
      resolution_hours: number;
      warning_minutes: number;
    }) => request<SlaRule>("/sla/rules", { method: "PUT", body: data }),
    deleteRule: (ruleId: number) => request(`/sla/rules/${ruleId}`, { method: "DELETE" }),
    saveEscalationRule: (data: {
      breach_type: "response" | "resolution";
      department_id: number | null;
      level_hours: number;
      max_level: number;
      is_active: boolean;
    }) => request<EscalationRule>("/sla/escalation-rules", { method: "PUT", body: data }),
    deleteEscalationRule: (ruleId: number) => request(`/sla/escalation-rules/${ruleId}`, { method: "DELETE" }),
    runNow: () => request<Record<string, number>>("/sla/run", { method: "POST" }),
  },
  reports: {
    overview: (query: ReportQuery) => request<ReportOverview>("/reports/overview", { query }),
    levels: () => request<{ key: string; name: string; depth: number }[]>("/reports/levels"),
    table: (kind: "agents" | "departments" | "locations", query: ReportQuery & { level?: string }) =>
      request<PerformanceRow[]>(`/reports/${kind}`, { query }),
    exportTable: (kind: "agents" | "departments" | "locations", query: ReportQuery & { level?: string }) =>
      downloadFile(`/reports/${kind}`, { ...query, format: "csv" }),
  },
  audit: {
    list: (query: AuditQuery & { page?: number; page_size?: number } = {}) =>
      request<Paged<AuditEntry>>("/audit-logs/", { query }),
    entityTypes: () => request<string[]>("/audit-logs/entity-types"),
    exportCsv: (query: AuditQuery = {}) => downloadFile("/audit-logs/export", query),
  },
  grievances: {
    options: () => request<GrievanceOptions>("/grievances/options"),
    list: (
      query: {
        view?: "my_filed" | "investigations" | "all";
        status_filter?: string;
        severity?: string;
        page?: number;
        page_size?: number;
      } = {},
    ) => request<Paged<StaffGrievance>>("/grievances/", { query }),
    get: (identifier: string) => request<StaffGrievance>(`/grievances/${id(identifier)}`),
    file: (data: FormData) => request<StaffGrievance>("/grievances/", { method: "POST", body: data }),
    assign: (identifier: string, data: { investigator_id: number; note?: string }) =>
      request<StaffGrievance>(`/grievances/${id(identifier)}/assign`, { method: "POST", body: data }),
    updateStatus: (
      identifier: string,
      data: {
        status: string;
        message: string;
        is_confidential_note?: boolean;
        resolution_action?: string;
        resolution_summary?: string;
      },
    ) => request<StaffGrievance>(`/grievances/${id(identifier)}/status`, { method: "POST", body: data }),
    addNote: (identifier: string, data: { note: string; is_confidential?: boolean }) =>
      request<StaffGrievance>(`/grievances/${id(identifier)}/notes`, { method: "POST", body: data }),
  },
  team: {
    dashboard: (query: { date_from?: string; date_to?: string; direct_only?: boolean } = {}) =>
      request<TeamDashboardResponse>("/team/dashboard", { query }),
    members: (query: { direct_only?: boolean } = {}) => request<StaffUser[]>("/team/members", { query }),
    memberComplaints: (memberId: number) => request<ComplaintData[]>(`/team/members/${memberId}/complaints`),
    setAvailability: (memberId: number, is_available: boolean) =>
      request<{ id: number; name: string; is_available: boolean }>(`/team/members/${memberId}/availability`, {
        method: "POST",
        body: { is_available },
      }),
    reassign: (data: { complaint_id: string; new_assignee_id: number; reason?: string }) =>
      request<ComplaintData>("/team/reassign", { method: "POST", body: data }),
  },
};
