export const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

/** Fired on window when the session is gone; the dashboard layout redirects to /login. */
export const UNAUTHORIZED_EVENT = "citizen:unauthorized";

export type OtpChannel = "sms" | "email";

export interface LocationRef {
  id: number;
  name: string;
  type: string;
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

export interface CitizenProfile {
  id: number;
  external_id: string | null;
  name: string;
  mobile: string;
  email: string;
  location: LocationRef | null;
}

export interface PortalDepartment {
  id: number;
  name: string;
  code: string;
  categories: { id: number; name: string }[];
}

export interface Attachment {
  id: number;
  file_path: string;
  file_name: string;
  file_type: string;
  comment_id: number | null;
  uploaded_by_type: "staff" | "end_user" | null;
  created_at: string | null;
}

export type StatusGroup = "open" | "in_progress" | "resolved" | "rejected";

export interface Complaint {
  id: string;
  generated_id: string;
  title: string;
  description: string;
  additional_details: string | null;
  department: string;
  category: string | null;
  priority: string;
  location: string;
  location_detail: LocationRef | null;
  /** Workflow key, e.g. "IN_PROGRESS"; show `status_label` to people. */
  status: string;
  status_label: string;
  status_group: StatusGroup;
  date: string;
  created_at: string;
  updated_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_note: string | null;
  reopen_count: number;
  feedback_rating: number | null;
  feedback_comment: string | null;
  attachments: Attachment[];
  /** Targets while the complaint is open (null once met). */
  response_due_at: string | null;
  resolution_due_at: string | null;
  is_escalated: boolean;
}

export type CitizenAction = "comment" | "confirm" | "reopen" | "feedback";

export interface ComplaintDetail extends Complaint {
  timeline: {
    id: number;
    type: string;
    message: string;
    note: string | null;
    actor_name: string;
    created_at: string;
  }[];
  comments: {
    id: number;
    author_type: "staff" | "end_user";
    author_name: string;
    body: string;
    created_at: string;
    attachments: Attachment[];
  }[];
  actions: CitizenAction[];
  reopen_until: string | null;
}

export interface CitizenNotification {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  complaint_id: string | null;
  created_at: string;
  read_at: string | null;
}

export interface ComplaintStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  rejected: number;
}

export interface OtpChallengeResponse {
  success: boolean;
  challenge_id: string;
  channel: OtpChannel;
  sent_to: string;
  expires_in_seconds: number;
  resend_after_seconds: number;
  dev_otp?: string;
}

export interface LoginResponse {
  success: boolean;
  access_token: string;
  refresh_token: string;
  user: CitizenProfile;
}

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

export function hasSession(): boolean {
  return !!storage()?.getItem(ACCESS_TOKEN_KEY);
}

export function saveSession(tokens: { access_token: string; refresh_token: string }) {
  storage()?.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  storage()?.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export function clearSession() {
  storage()?.removeItem(ACCESS_TOKEN_KEY);
  storage()?.removeItem(REFRESH_TOKEN_KEY);
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ");
    }
  } catch {
    // not JSON
  }
  return `Request failed with status ${response.status}`;
}

let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  const refreshToken = storage()?.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return Promise.resolve(false);
  refreshInFlight ??= fetch(`${BACKEND_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) return false;
      saveSession(await res.json());
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const send = () => {
    const token = storage()?.getItem(ACCESS_TOKEN_KEY);
    return fetch(`${BACKEND_URL}${endpoint}`, {
      ...options,
      headers: {
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  };

  let response = await send();
  if (response.status === 401 && (await refreshSession())) response = await send();

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      clearSession();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(await errorMessage(response), response.status);
  }
  return response.json();
}

export const apis = {
  auth: {
    // Citizens are pre-registered by CSV; both mobile and email must match.
    requestOtp: (payload: { mobile: string; email: string; channel: OtpChannel }) =>
      fetchApi<OtpChallengeResponse>("/portal/auth/request-otp", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    verifyOtp: (payload: { challenge_id: string; otp: string }) =>
      fetchApi<LoginResponse>("/portal/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    me: () => fetchApi<CitizenProfile>("/portal/me"),
    logout: async () => {
      const refreshToken = storage()?.getItem(REFRESH_TOKEN_KEY);
      clearSession();
      if (refreshToken) {
        await fetch(`${BACKEND_URL}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        }).catch(() => undefined);
      }
    },
  },
  profile: {
    getProfile: async () => {
      const user = await fetchApi<any>("/portal/me");
      return { success: true, user };
    },
    updateProfile: (data: {
      name?: string;
      email?: string;
      mobile?: string;
      dob?: string;
      gender?: string;
      address?: string;
      language?: string;
      notify_sms?: boolean;
      notify_email?: boolean;
      notify_alerts?: boolean;
    }) =>
      fetchApi<{ success: boolean; message: string; user: any }>("/portal/profile", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  },
  notifications: {
    list: () =>
      fetchApi<{ items: CitizenNotification[]; unread_count: number }>("/portal/notifications?limit=30"),
    getNotifications: async () => {
      const res = await fetchApi<{ items: any[]; unread_count: number }>("/portal/notifications?limit=30");
      return {
        success: true,
        unread_count: res.unread_count,
        notifications: (res.items || []).map((n) => ({
          id: n.id,
          title: n.title,
          message: n.body || "",
          type: n.kind || "alert",
          complaint_id: n.complaint_id,
          is_read: !!n.read_at,
          time: n.created_at,
          created_at: n.created_at,
        })),
      };
    },
    markRead: (id: number) => fetchApi<{ success: boolean }>(`/portal/notifications/${id}/read`, { method: "POST" }),
    markAllRead: () => fetchApi<{ success: boolean }>("/portal/notifications/read-all", { method: "POST" }),
    clearAll: () => fetchApi<{ success: boolean }>("/portal/notifications", { method: "DELETE" }),
    getActivities: () =>
      fetchApi<{
        success: boolean;
        activities: Array<{
          id: number;
          title: string;
          desc: string;
          type: string;
          complaint_id?: string;
          time: string;
          created_at: string;
        }>;
      }>("/portal/activities"),
  },
  reference: {
    departments: () => fetchApi<PortalDepartment[]>("/portal/departments"),
    locationTree: () => fetchApi<LocationNode[]>("/portal/locations/tree"),
  },
  complaints: {
    registerComplaint: (formData: FormData) =>
      fetchApi<{ success: boolean; complaint_id: string; message: string }>("/portal/complaints", {
        method: "POST",
        body: formData,
      }),
    getComplaints: () => fetchApi<Complaint[]>("/portal/complaints"),
    getComplaint: (id: string) => fetchApi<ComplaintDetail>(`/portal/complaints/${encodeURIComponent(id)}`),
    getDashboardStats: () => fetchApi<ComplaintStats>("/portal/complaints/stats"),
    comment: (id: string, body: string, files: File[]) => {
      const form = new FormData();
      form.append("body", body);
      files.forEach((f) => form.append("files", f));
      return fetchApi<ComplaintDetail>(`/portal/complaints/${encodeURIComponent(id)}/comments`, {
        method: "POST",
        body: form,
      });
    },
    confirm: (id: string, rating: number | null, comment: string) =>
      fetchApi<ComplaintDetail>(`/portal/complaints/${encodeURIComponent(id)}/confirm`, {
        method: "POST",
        body: JSON.stringify({ rating, comment: comment || null }),
      }),
    reopen: (id: string, reason: string) =>
      fetchApi<ComplaintDetail>(`/portal/complaints/${encodeURIComponent(id)}/reopen`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    feedback: (id: string, rating: number, comment: string) =>
      fetchApi<ComplaintDetail>(`/portal/complaints/${encodeURIComponent(id)}/feedback`, {
        method: "POST",
        body: JSON.stringify({ rating, comment: comment || null }),
      }),
  },
};
