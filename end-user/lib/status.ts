import { PriorityTone, StatusGroup } from "./api";

/** Status pills by group, as end users see them (the same four buckets as their counts). */
export const GROUP_PILLS: Record<StatusGroup, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-red-50 text-red-600" },
  in_progress: { label: "In progress", className: "bg-blue-50 text-blue-700" },
  resolved: { label: "Resolved", className: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", className: "bg-slate-100 text-slate-700" },
};

/** Priorities are managed by the organisation; each one carries a colour tone. */
export const TONE_PILLS: Record<PriorityTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-sky-50 text-sky-800",
  success: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
  critical: "bg-red-600 text-white",
};

/** A stable colour per department name (departments are data, not code). */
const DOT_COLORS = [
  "bg-amber-400",
  "bg-blue-600",
  "bg-red-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-orange-400",
  "bg-cyan-500",
  "bg-pink-500",
];

export function departmentDot(department: string): string {
  const hash = [...department].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0);
  return DOT_COLORS[hash % DOT_COLORS.length];
}
