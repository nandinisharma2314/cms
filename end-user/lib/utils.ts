import type { Complaint } from "./apis";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "22 Sep 2026, 09:10 AM"; backend timestamps are naive UTC.
export function formatDateTime(iso: string) {
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = d.getHours();
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(hours % 12 || 12)}:${pad(d.getMinutes())} ${hours < 12 ? "AM" : "PM"}`;
}

// "Mansarovar, Jaipur": the area and the next distinct level up.
export function shortPlace(c: Pick<Complaint, "location" | "location_detail">) {
  const names = [...new Set([...(c.location_detail?.path_names ?? [])].reverse())].slice(0, 2);
  return names.length ? names.join(", ") : c.location;
}

// Backend timestamps are naive UTC ISO strings.
export function formatWhen(iso: string) {
  const date = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const getPriorityStyles = (priority: string) => {
 switch (priority) {
 case"High":
 case"Critical":
 return"bg-red-50 text-red-600";
 case"Medium":
 return"bg-blue-50 text-blue-600";
 case"Low":
 return"bg-emerald-50 text-emerald-600";
 default:
 return"bg-slate-50 text-slate-600";
 }
};

// Takes the workflow status key (e.g. "IN_PROGRESS").
export const getStatusStyles = (status: string) => {
 switch (status) {
 case"ACKNOWLEDGED":
 case"IN_PROGRESS":
 return"bg-emerald-50 text-emerald-700";
 case"WAITING_FOR_INFORMATION":
 case"REJECTION_REQUESTED": // shown to end users as "Under Review"
 return"bg-amber-50 text-amber-700";
 case"RESOLVED":
 case"CLOSED":
 return"bg-green-50 text-green-600";
 case"SUBMITTED":
 case"ASSIGNED":
 case"REOPENED":
 return"bg-red-50 text-red-500";
 case"REJECTED":
 return"bg-slate-700 text-white";
 default:
 return"bg-slate-50 text-slate-600";
 }
};
