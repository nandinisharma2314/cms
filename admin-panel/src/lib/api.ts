export const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const ACCESS_TOKEN_KEY = "cms_access_token";
const REFRESH_TOKEN_KEY = "cms_refresh_token";

/** Fired on window when the session can no longer be refreshed. */
export const UNAUTHORIZED_EVENT = "cms:unauthorized";

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
  path_ids: number[];
  path_names: string[];
  label: string;
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
  scopes: UserScope[];
  is_active: boolean;
  /** Off = skipped by automatic complaint routing (e.g. on leave). */
  is_available: boolean;
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

export interface Category {
  id: number;
  name: string;
  is_active: boolean;
}

export interface Department {
  id: number;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  categories: Category[];
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

export interface LocationType {
  id: number;
  key: string;
  name: string;
  depth: number;
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
  batch_id: number | null;
  dry_run: boolean;
  total_rows: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  warnings: number;
  errors: { row: number; message: string }[];
  warning_list: { row: number; message: string }[];
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
  issues?: { row: number; severity: "error" | "warning"; message: string }[];
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
  file_path: string;
  file_name: string;
  file_type: string;
  comment_id: number | null;
  uploaded_by_type: "staff" | "end_user" | null;
  created_at: string | null;
}

export type SlaState = "on_track" | "at_risk" | "breached" | "paused" | "met" | "met_late" | null;

export interface Escalation {
  level: number;
  type: "response" | "resolution";
  to: { id: number; name: string; role: string };
  next_at: string | null;
}

export interface ComplaintData {
  num?: number;
  id: string;
  title: string;
  description?: string;
  additional_details: string | null;
  department: string;
  department_id: number;
  category: string | null;
  priority: string;
  location: string;
  location_detail: LocationRef | null;
  end_user_name?: string | null;
  end_user_phone?: string | null;
  status: ComplaintStatus;
  status_label: string;
  status_group: StatusGroup;
  assignee: { id: number; name: string; role: string } | null;
  date: string;
  created_at: string;
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
  is_escalated: boolean;
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
  actor_name: string;
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

export interface ComplaintDetail extends ComplaintData {
  end_user: { id: number; name: string; mobile: string; email: string } | null;
  timeline: TimelineEvent[];
  comments: ComplaintComment[];
  assignments: {
    assignee: { id: number; name: string; role: string };
    method: "auto" | "manual";
    reason: string | null;
    assigned_by: string;
    assigned_at: string;
    ended_at: string | null;
  }[];
  actions: WorkflowAction[];
  can_assign: boolean;
  can_comment: boolean;
  escalations: {
    type: "response" | "resolution";
    level: number;
    from: string;
    to: string | null;
    created_at: string;
    resolved_at: string | null;
  }[];
  rejection: {
    can_request: boolean;
    categories: string[];
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
  complaint: { id: string; title: string; department: string; location: string; priority: string; status: ComplaintStatus };
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
  priority: string;
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

export interface DashboardStatsResponse {
  metrics: {
    total: number;
    total_trend: string | null;
    total_trend_type?: "positive" | "negative";
    open: number;
    open_trend: string | null;
    open_trend_type?: "positive" | "negative";
    resolved: number;
    resolved_trend: string | null;
    resolved_trend_type?: "positive" | "negative";
    in_progress: number;
    in_progress_trend: string | null;
    in_progress_trend_type?: "positive" | "negative";
    rejected: number;
    unassigned: number;
    sla_breached: number;
    sla_at_risk: number;
    escalated: number;
  };
  status_breakdown: Record<StatusGroup, { count: number; percentage: number }>;
  by_status: { status: ComplaintStatus; label: string; count: number }[];
  departments: { name: string; count: number }[];
  trend: { date: string; received: number; resolved: number }[];
  pending_summary?: {
    pending_resets: number;
    /** Open complaints nobody is assigned to. */
    pending_assignments: number;
    assigned_to_me: number;
    escalated_to_me: number;
    rejection_requests: number;
    escalations: number;
    total_users: number | null;
  };
}

export interface PasswordResetTicket {
  ticket_id: string;
  email_or_id: string;
  department: string;
  reason: string;
  status: string;
  created_at: string;
  matched_user: { id: number; name: string; role: string } | null;
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
  reopen_pct: number | null;
  rejection_pct: number | null;
}

export interface ReportSummary {
  period: { date_from: string; date_to: string };
  previous_period: { date_from: string; date_to: string };
  metrics: ReportMetrics;
  previous: ReportMetrics;
}

export interface ReportTrend {
  interval: "day" | "week";
  points: { date: string; label: string; received: number; resolved: number; breached: number }[];
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
  priority?: string;
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

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function hasAccessToken(): boolean {
  return !!storage()?.getItem(ACCESS_TOKEN_KEY);
}

function setTokens(access: string, refresh: string) {
  storage()?.setItem(ACCESS_TOKEN_KEY, access);
  storage()?.setItem(REFRESH_TOKEN_KEY, refresh);
}

export function clearTokens() {
  storage()?.removeItem(ACCESS_TOKEN_KEY);
  storage()?.removeItem(REFRESH_TOKEN_KEY);
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ");
    }
  } catch {
    // not JSON
  }
  return `Request failed (${res.status})`;
}

let refreshInFlight: Promise<boolean> | null = null;

function refreshTokens(): Promise<boolean> {
  const refreshToken = storage()?.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return Promise.resolve(false);
  refreshInFlight ??= fetch(`${BACKEND_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

type Query = Record<string, string | number | boolean | null | undefined>;

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; query?: Query } = {},
): Promise<T> {
  const url = new URL(`${BACKEND_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;

  const send = () => {
    const token = storage()?.getItem(ACCESS_TOKEN_KEY);
    return fetch(url, {
      method: options.method ?? "GET",
      headers: {
        ...(isForm || options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: isForm ? (options.body as FormData) : options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });
  };

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && (await refreshTokens())) res = await send();
  } catch {
    throw new ApiError("Unable to reach the backend server. Please check that it is running.", 0);
  }

  if (res.status === 401) {
    clearTokens();
    if (typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function loginApi(payload: {
  email?: string;
  mobile?: string;
  password: string;
}): Promise<{ success: boolean; user?: Me; error?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { success: false, error: await errorMessage(res) };
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return { success: true, user: data.user };
  } catch {
    return { success: false, error: "Unable to reach the backend server. Please check that it is running." };
  }
}

export async function raiseResetQueryApi(payload: {
  email_or_id: string;
  department: string;
  reason: string;
}): Promise<{ success: boolean; ticket_id?: string; error?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/reset-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { success: false, error: await errorMessage(res) };
    const data = await res.json();
    return { success: true, ticket_id: data.ticket_id };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

function uploadCsv(path: string, file: File, dryRun: boolean): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("dry_run", String(dryRun));
  return request<ImportResult>(path, { method: "POST", body: form });
}

/** Saves a file from an authenticated endpoint (a plain link can't send the auth header). */
async function downloadFile(path: string, query: Query = {}): Promise<void> {
  const url = new URL(`${BACKEND_URL}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const send = () => fetch(url, { headers: { Authorization: `Bearer ${storage()?.getItem(ACCESS_TOKEN_KEY) ?? ""}` } });
  let res = await send();
  if (res.status === 401 && (await refreshTokens())) res = await send();
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  const blobUrl = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "download.csv";
  link.click();
  URL.revokeObjectURL(blobUrl);
}

export const api = {
  auth: {
    me: () => request<Me>("/auth/me"),
    logout: async () => {
      const refreshToken = storage()?.getItem(REFRESH_TOKEN_KEY);
      if (refreshToken) {
        await request("/auth/logout", { method: "POST", body: { refresh_token: refreshToken } }).catch(() => undefined);
      }
      clearTokens();
    },
    setAvailability: (is_available: boolean) =>
      request<Me>("/auth/availability", { method: "POST", body: { is_available } }),
    changePassword: (current_password: string, new_password: string) =>
      request("/auth/change-password", { method: "POST", body: { current_password, new_password } }),
    resetQueries: () => request<PasswordResetTicket[]>("/auth/reset-queries"),
    approveResetQuery: (ticketId: string) =>
      request<{ temporary_key: string; message: string }>(`/auth/reset-queries/${ticketId}/approve`, { method: "POST" }),
  },
  complaints: {
    stats: () => request<DashboardStatsResponse>("/complaints/admin/stats"),
    list: (
      filters: {
        status?: string;
        group?: StatusGroup | "";
        assigned?: "me" | "unassigned" | "";
        priority?: string;
        department_id?: number;
        search?: string;
        sla?: "breached" | "at_risk" | "";
        escalated?: "me" | "any" | "";
      } = {},
    ) => request<ComplaintData[]>("/complaints/", { query: filters }),
    get: (id: string) => request<ComplaintDetail>(`/complaints/${encodeURIComponent(id)}`),
    act: (id: string, action: string, note?: string) =>
      request<ComplaintDetail>(`/complaints/${encodeURIComponent(id)}/actions`, {
        method: "POST",
        body: { action, note: note || null },
      }),
    assigneeOptions: (id: string) =>
      request<AssigneeOption[]>(`/complaints/${encodeURIComponent(id)}/assignee-options`),
    assign: (id: string, assignee_id: number, reason?: string) =>
      request<ComplaintDetail>(`/complaints/${encodeURIComponent(id)}/assign`, {
        method: "POST",
        body: { assignee_id, reason: reason || null },
      }),
    autoAssign: (id: string) =>
      request<ComplaintDetail>(`/complaints/${encodeURIComponent(id)}/auto-assign`, { method: "POST" }),
    requestRejection: (id: string, category: string, reason: string) =>
      request<ComplaintDetail>(`/complaints/${encodeURIComponent(id)}/rejection-requests`, {
        method: "POST",
        body: { category, reason },
      }),
    comment: (id: string, body: string, isInternal: boolean, files: File[]) => {
      const form = new FormData();
      form.append("body", body);
      form.append("is_internal", String(isInternal));
      files.forEach((f) => form.append("files", f));
      return request<ComplaintDetail>(`/complaints/${encodeURIComponent(id)}/comments`, { method: "POST", body: form });
    },
    quickCreate: (data: {
      title: string;
      department_id: number;
      category_id?: number | null;
      location_id: number;
      priority?: string;
      description?: string;
      end_user_name?: string;
      end_user_phone?: string;
    }) => request<{ id: string; assignee: string | null }>("/complaints/quick-create", { method: "POST", body: data }),
  },
  users: {
    list: (query: { search?: string; role_id?: number } = {}) => request<StaffUser[]>("/users/", { query }),
    create: (data: {
      name: string;
      email: string;
      mobile?: string;
      role_id: number;
      password: string;
      reports_to_id?: number | null;
      scopes: ScopeInput[];
    }) => request<StaffUser>("/users/", { method: "POST", body: data }),
    update: (
      id: number,
      data: Partial<{
        name: string;
        email: string;
        mobile: string;
        role_id: number;
        reports_to_id: number | null;
        clear_reports_to: boolean;
        scopes: ScopeInput[];
        is_available: boolean;
      }>,
    ) => request<StaffUser>(`/users/${id}`, { method: "PATCH", body: data }),
    setActive: (id: number, active: boolean) =>
      request<StaffUser>(`/users/${id}/${active ? "activate" : "deactivate"}`, { method: "POST" }),
    reportsToOptions: (roleId: number) =>
      request<{ id: number; name: string; role: string }[]>("/users/reports-to-options", { query: { role_id: roleId } }),
  },
  roles: {
    list: () => request<RoleDetail[]>("/roles/"),
    permissions: () => request<PermissionDef[]>("/roles/permissions"),
    create: (data: { key: string; name: string; description?: string; parent_id: number; permissions: string[] }) =>
      request<RoleDetail>("/roles/", { method: "POST", body: data }),
    update: (id: number, data: Partial<{ name: string; description: string; parent_id: number; permissions: string[] }>) =>
      request<RoleDetail>(`/roles/${id}`, { method: "PATCH", body: data }),
    remove: (id: number) => request(`/roles/${id}`, { method: "DELETE" }),
  },
  departments: {
    list: () => request<Department[]>("/departments/"),
    create: (data: { name: string; code: string; description?: string; categories: string[] }) =>
      request<Department>("/departments/", { method: "POST", body: data }),
    update: (id: number, data: Partial<{ name: string; code: string; description: string; is_active: boolean }>) =>
      request<Department>(`/departments/${id}`, { method: "PATCH", body: data }),
    addCategory: (id: number, name: string) =>
      request<Department>(`/departments/${id}/categories`, { method: "POST", body: { name } }),
    updateCategory: (id: number, categoryId: number, data: { name?: string; is_active?: boolean }) =>
      request<Department>(`/departments/${id}/categories/${categoryId}`, { method: "PATCH", body: data }),
  },
  locations: {
    types: () => request<LocationType[]>("/locations/types"),
    tree: (includeInactive = false) =>
      request<LocationNode[]>("/locations/tree", { query: { include_inactive: includeInactive } }),
    create: (name: string, parent_id: number | null) =>
      request<LocationRef>("/locations/", { method: "POST", body: { name, parent_id } }),
    update: (id: number, data: { name?: string; is_active?: boolean }) =>
      request<LocationRef>(`/locations/${id}`, { method: "PATCH", body: data }),
    importCsv: (file: File, dryRun = false) => uploadCsv("/locations/import", file, dryRun),
    exportCsv: () => downloadFile("/locations/export"),
  },
  endUsers: {
    list: (query: { search?: string; page?: number; page_size?: number } = {}) =>
      request<Paged<EndUserRow>>("/end-users/", { query }),
    update: (id: number, data: Partial<{ name: string; mobile: string; email: string; location_id: number; is_active: boolean }>) =>
      request<EndUserRow>(`/end-users/${id}`, { method: "PATCH", body: data }),
    importCsv: (file: File, dryRun = false) => uploadCsv("/end-users/import", file, dryRun),
    exportCsv: (search?: string) => downloadFile("/end-users/export", { search }),
  },
  imports: {
    list: (kind?: ImportKind) => request<ImportBatch[]>("/imports/", { query: { kind } }),
    get: (id: number) => request<ImportBatch>(`/imports/${id}`),
    downloadReport: (id: number, severity: "error" | "warning" | "all" = "error") =>
      downloadFile(`/imports/${id}/report`, { severity }),
  },
  rejections: {
    list: (view: "to_decide" | "mine" | "all") =>
      request<RejectionRequestItem[]>("/rejection-requests/", { query: { view } }),
    approve: (id: number, note?: string) =>
      request<ComplaintDetail>(`/rejection-requests/${id}/approve`, { method: "POST", body: { note: note || null } }),
    deny: (id: number, note: string) =>
      request<ComplaintDetail>(`/rejection-requests/${id}/deny`, { method: "POST", body: { note } }),
    withdraw: (id: number) => request<ComplaintDetail>(`/rejection-requests/${id}/withdraw`, { method: "POST" }),
  },
  notifications: {
    list: (unreadOnly = false) =>
      request<{ items: NotificationItem[]; unread_count: number }>("/notifications/", {
        query: { unread_only: unreadOnly, limit: 30 },
      }),
    markRead: (id: number) => request(`/notifications/${id}/read`, { method: "POST" }),
    markAllRead: () => request("/notifications/read-all", { method: "POST" }),
  },
  sla: {
    config: () =>
      request<{ priorities: string[]; sla_rules: SlaRule[]; escalation_rules: EscalationRule[] }>("/sla/config"),
    saveRule: (data: {
      priority: string;
      department_id: number | null;
      response_hours: number;
      resolution_hours: number;
      warning_minutes: number;
    }) => request<SlaRule>("/sla/rules", { method: "PUT", body: data }),
    deleteRule: (id: number) => request(`/sla/rules/${id}`, { method: "DELETE" }),
    saveEscalationRule: (data: {
      breach_type: string;
      department_id: number | null;
      level_hours: number;
      max_level: number;
      is_active: boolean;
    }) => request<EscalationRule>("/sla/escalation-rules", { method: "PUT", body: data }),
    runNow: () => request<Record<string, number>>("/sla/run", { method: "POST" }),
  },
  reports: {
    summary: (query: ReportQuery) => request<ReportSummary>("/reports/summary", { query }),
    trend: (query: ReportQuery) => request<ReportTrend>("/reports/trend", { query }),
    table: (kind: "agents" | "departments" | "locations", query: ReportQuery & { level?: string }) =>
      request<PerformanceRow[]>(`/reports/${kind}`, { query }),
    exportTable: (kind: "agents" | "departments" | "locations", query: ReportQuery & { level?: string }) =>
      downloadFile(`/reports/${kind}`, { ...query, format: "csv" }),
  },
  audit: {
    list: (query: AuditQuery & { page?: number; page_size?: number } = {}) =>
      request<Paged<AuditEntry>>("/audit-logs/", { query }),
    exportCsv: (query: AuditQuery = {}) => downloadFile("/audit-logs/export", query),
  },
};
