export const BACKEND_URL =
 process.env.NEXT_PUBLIC_BACKEND_URL ||"http://localhost:5000";

export interface SendOtpPayload {
 mobile?: string;
 email?: string;
 method:"mobile" |"email";
}

export interface VerifyOtpPayload {
 target: string;
 otp: string;
}

export interface AuthResponse {
 success: boolean;
 message?: string;
 target?: string;
 userId?: string;
 user?: {
 id: string;
 identifier: string;
 role: string;
 name?: string;
 };
 token?: string;
 access_token?: string;
 refresh_token?: string;
 dev_otp?: string;
 error?: string;
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
 const url = `${BACKEND_URL}${endpoint}`;

 const defaultHeaders: Record<string, string> = {
"Content-Type":"application/json",
 };

 if (typeof FormData !== "undefined" && options.body instanceof FormData) {
 delete defaultHeaders["Content-Type"];
 }

 if (typeof window !=="undefined") {
 const token = localStorage.getItem("access_token");
 if (token) {
 defaultHeaders["Authorization"] = `Bearer ${token}`;
 }
 }

 const response = await fetch(url, {
 ...options,
 headers: {
 ...defaultHeaders,
 ...options.headers,
 },
 });

 if (!response.ok) {
 if (response.status === 401 || response.status === 403) {
 if (typeof window !=="undefined") {
 localStorage.removeItem("access_token");
 if (window.location.pathname.startsWith("/dashboard")) {
 window.location.href ="/login";
 }
 }
 }

 let errorDetail ="";
 try {
 const errorJson = await response.json();
 errorDetail = errorJson.detail || errorJson.message || errorJson.error || JSON.stringify(errorJson);
 } catch {
 errorDetail = await response.text();
 }

 const err: any = new Error(errorDetail || `Request failed with status ${response.status}`);
 err.status = response.status;
 throw err;
 }

 return response.json();
}

export const apis = {
 auth: {
 // New OTP-based authentication matching the 6-screen flow
 sendOtp: (payload: SendOtpPayload) =>
 fetchApi<AuthResponse>("/auth/send-otp", {
 method:"POST",
 body: JSON.stringify(payload),
 }),

 verifyOtp: (payload: VerifyOtpPayload) =>
 fetchApi<AuthResponse>("/auth/verify-otp", {
 method:"POST",
 body: JSON.stringify(payload),
 }),

 // Legacy checkUser support
 checkUser: (payload: { mobile?: string; email?: string }) =>
 fetchApi<AuthResponse>("/auth/send-otp", {
 method:"POST",
 body: JSON.stringify({
 ...payload,
 method: payload.email ?"email" :"mobile",
 }),
 }),
 },
 complaints: {
 registerComplaint: (formData: FormData) =>
 fetchApi<any>("/complaints/", {
 method:"POST",
 body: formData,
 }),
 getComplaints: async () => {
 let token ="";
 if (typeof window !=="undefined") token = localStorage.getItem('access_token') ||"";
 return fetchApi<any[]>("/complaints/", {
 method:"GET",
 headers: token ? {"Authorization": `Bearer ${token}` } : {}
 });
 },
 getDashboardStats: async () => {
 let token ="";
 if (typeof window !=="undefined") token = localStorage.getItem('access_token') ||"";
 return fetchApi<any>("/complaints/stats", {
 method:"GET",
 headers: token ? {"Authorization": `Bearer ${token}` } : {}
 });
 }
 },
};
