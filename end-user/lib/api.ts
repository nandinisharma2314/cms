/**
 * Typed client for the end-user part of the CMS API (/portal/*).
 *
 * Sessions: the API keeps the refresh token in an httpOnly cookie and returns
 * a short-lived access token, kept only in memory. On a 401 the client
 * refreshes once (one refresh at a time across tabs, via the Web Locks API)
 * and retries; when that fails UNAUTHORIZED_EVENT fires.
 */

const configuredUrl = process.env.NEXT_PUBLIC_API_URL;
if (!configuredUrl) {
  throw new Error("NEXT_PUBLIC_API_URL is not set. Copy .env.example to .env.local and set it to the API's URL.");
}
export const API_URL = configuredUrl.replace(/\/+$/, "");

/** Fired on window when the session has ended and cannot be refreshed. */
export const UNAUTHORIZED_EVENT = "portal:unauthorized";
/** Fired after notifications were read or cleared, so the bell and the tab bar refresh at once. */
export const NOTIFICATIONS_CHANGED_EVENT = "portal:notifications-changed";

const CLIENT_HEADER = { "X-Requested-With": "cms" };
const PRINCIPAL = "end_user";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OtpChannel = "sms" | "email";
export type Gender = "female" | "male" | "other" | "prefer_not_to_say";

export interface LocationRef {
  id: number;
  name: string;
  type: string;
  type_name: string;
  path_ids: number[];
  path_names: string[];
  label: string;
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

export interface Profile {
  id: number;
  external_id: string | null;
  name: string;
  mobile: string;
  email: string;
  location: LocationRef | null;
  dob: string | null;
  gender: Gender | null;
  address: string | null;
  notify_sms: boolean;
  notify_email: boolean;
  role: { key: string; name: string };
  /** Portal permissions of the End User role, e.g. "portal.complaint.create". */
  permissions: string[];
}

export interface PortalDepartment {
  id: number;
  name: string;
  code: string;
  /** `priority`: the name of the priority new complaints in this category get. */
  categories: { id: number; name: string; priority: string }[];
}

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

export type StatusGroup = "open" | "in_progress" | "resolved" | "rejected";
export type PriorityTone = "neutral" | "info" | "success" | "warning" | "danger" | "critical";

export interface Complaint {
  id: string;
  title: string;
  description: string;
  additional_details: string | null;
  department: string;
  department_id: number;
  category: string | null;
  category_id: number | null;
  priority: { id: number; key: string; name: string; tone: PriorityTone; rank: number };
  location: string;
  location_detail: LocationRef;
  /** Workflow key, e.g. "IN_PROGRESS"; show `status_label` to people. */
  status: string;
  status_label: string;
  status_group: StatusGroup;
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
  /** Targets while they still apply (null once met). */
  response_due_at: string | null;
  resolution_due_at: string | null;
}

export type EndUserAction = "comment" | "confirm" | "reopen" | "feedback";

export interface ComplaintDetail extends Complaint {
  timeline: { id: number; type: string; message: string; note: string | null; actor_name: string | null; created_at: string }[];
  comments: {
    id: number;
    author_type: "staff" | "end_user";
    author_name: string;
    body: string;
    is_internal: boolean;
    created_at: string;
    attachments: Attachment[];
  }[];
  actions: EndUserAction[];
  reopen_until: string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
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

/** A public update on one of the end user's complaints. */
export interface Activity {
  id: number;
  kind: string;
  title: string;
  message: string;
  complaint_id: string;
  created_at: string;
}

export interface ComplaintStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  rejected: number;
}

export interface OtpChallenge {
  challenge_id: string;
  channel: OtpChannel;
  sent_to: string;
  expires_in_seconds: number;
  resend_after_seconds: number;
  /** Only when the server runs in development mode. */
  dev_otp?: string;
}

export interface Session {
  access_token: string;
  user: Profile;
}

/** Several end users share the phone/email: they choose who is signing in. */
export interface AccountChoice {
  selection_token: string;
  accounts: { id: number; name: string; location: string | null }[];
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

const UNREACHABLE = "We can't reach the server right now. Check your connection and try again.";

let accessToken: string | null = null;

export function hasAccessToken(): boolean {
  return accessToken !== null;
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
  const base = typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_FRONTEND_URL || "http://localhost:3000");
  const fullPath = API_URL.startsWith('http') ? `${API_URL}${path}` : `${API_URL}${path}`;
  const url = new URL(fullPath, API_URL.startsWith('http') ? undefined : base);
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
        ? navigator.locks.request("cms-end-user-session-refresh", doRefresh).then((refreshed) => refreshed)
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
  if (res.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    // Wait forever so the UI doesn't render an error while the session provider redirects to /login.
    await new Promise(() => {});
  }
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

/** Calls made before signing in (they must not try to refresh). */
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

function keep(session: Session): Profile {
  accessToken = session.access_token;
  return session.user;
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
    requestOtp: (channel: OtpChannel, identifier: string) =>
      publicRequest<OtpChallenge>("/portal/auth/request-otp", { method: "POST", body: { channel, identifier } }),
    /** A profile when the code identifies one person, otherwise the accounts to choose from. */
    verifyOtp: async (challengeId: string, otp: string): Promise<Profile | AccountChoice> => {
      const data = await publicRequest<Session | AccountChoice>("/portal/auth/verify-otp", {
        method: "POST",
        body: { challenge_id: challengeId, otp },
      });
      return "access_token" in data ? keep(data) : data;
    },
    selectAccount: async (selectionToken: string, endUserId: number): Promise<Profile> =>
      keep(
        await publicRequest<Session>("/portal/auth/select-account", {
          method: "POST",
          body: { selection_token: selectionToken, end_user_id: endUserId },
        }),
      ),
    /** Picks up an existing session (after a reload) from the refresh cookie. */
    restore: () => refreshSession(),
    logout: async () => {
      await fetch(buildUrl("/auth/logout", { principal: PRINCIPAL }), {
        method: "POST",
        credentials: "include",
        headers: CLIENT_HEADER,
      }).catch(() => undefined);
      accessToken = null;
    },
  },
  profile: {
    me: () => request<Profile>("/portal/me"),
    update: (
      data: Partial<{
        name: string;
        dob: string;
        clear_dob: boolean;
        gender: Gender;
        clear_gender: boolean;
        address: string;
        notify_sms: boolean;
        notify_email: boolean;
      }>,
    ) => request<Profile>("/portal/profile", { method: "PUT", body: data }),
    requestContactChange: (channel: OtpChannel, value: string) =>
      request<OtpChallenge>("/portal/profile/contact/request", { method: "POST", body: { channel, value } }),
    verifyContactChange: async (challengeId: string, otp: string): Promise<Profile> =>
      keep(
        await request<Session>("/portal/profile/contact/verify", { method: "POST", body: { challenge_id: challengeId, otp } }),
      ),
  },
  reference: {
    departments: () => request<PortalDepartment[]>("/portal/departments"),
    locationTree: () => request<LocationNode[]>("/portal/locations/tree"),
  },
  complaints: {
    list: (query: { group?: StatusGroup | ""; search?: string; page?: number; page_size?: number } = {}) =>
      request<Paged<Complaint>>("/portal/complaints", { query }),
    stats: () => request<ComplaintStats>("/portal/complaints/stats"),
    get: (complaintId: string) => request<ComplaintDetail>(`/portal/complaints/${id(complaintId)}`),
    create: (data: {
      department_id: number;
      category_id: number;
      location_id: number;
      title: string;
      description: string;
      additional_details: string;
      files: File[];
    }) => {
      const form = new FormData();
      form.append("department_id", String(data.department_id));
      form.append("category_id", String(data.category_id));
      form.append("location_id", String(data.location_id));
      form.append("title", data.title);
      form.append("description", data.description);
      if (data.additional_details.trim()) form.append("additional_details", data.additional_details);
      data.files.forEach((file) => form.append("files", file));
      return request<ComplaintDetail>("/portal/complaints", { method: "POST", body: form });
    },
    comment: (complaintId: string, body: string, files: File[]) => {
      const form = new FormData();
      form.append("body", body);
      files.forEach((file) => form.append("files", file));
      return request<ComplaintDetail>(`/portal/complaints/${id(complaintId)}/comments`, { method: "POST", body: form });
    },
    confirm: (complaintId: string, rating: number | null, comment: string | null) =>
      request<ComplaintDetail>(`/portal/complaints/${id(complaintId)}/confirm`, {
        method: "POST",
        body: { rating, comment },
      }),
    reopen: (complaintId: string, reason: string) =>
      request<ComplaintDetail>(`/portal/complaints/${id(complaintId)}/reopen`, { method: "POST", body: { reason } }),
    feedback: (complaintId: string, rating: number, comment: string | null) =>
      request<ComplaintDetail>(`/portal/complaints/${id(complaintId)}/feedback`, {
        method: "POST",
        body: { rating, comment },
      }),
  },
  activities: (query: { page?: number; page_size?: number } = {}) => request<Paged<Activity>>("/portal/activities", { query }),
  notifications: {
    list: (query: { unread_only?: boolean; page?: number; page_size?: number } = {}) =>
      request<Paged<NotificationItem> & { unread_count: number }>("/portal/notifications", { query }),
    markRead: (notificationId: number) => request(`/portal/notifications/${notificationId}/read`, { method: "POST" }),
    markAllRead: () => request("/portal/notifications/read-all", { method: "POST" }),
    clear: () => request("/portal/notifications", { method: "DELETE" }),
  },
};
