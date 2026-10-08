import { ComplaintStatus, PriorityTone, SlaState, StatusGroup } from "./api";

/** Badge colours per workflow status (the statuses are fixed by the workflow engine). */
export const STATUS_BADGE: Record<ComplaintStatus, string> = {
  SUBMITTED: "bg-rose-50 text-rose-700 border border-rose-100",
  ASSIGNED: "bg-amber-50 text-amber-800 border border-amber-100",
  REOPENED: "bg-orange-50 text-orange-800 border border-orange-100",
  ACKNOWLEDGED: "bg-sky-50 text-sky-800 border border-sky-100",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border border-blue-100",
  WAITING_FOR_INFORMATION: "bg-violet-50 text-violet-700 border border-violet-100",
  RESOLVED: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  CLOSED: "bg-slate-100 text-slate-700 border border-slate-200",
  REJECTED: "bg-slate-800 text-white border border-slate-800",
  REJECTION_REQUESTED: "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100",
};

/** Priorities are managed by admins; each one carries a colour tone. */
export const TONE_BADGE: Record<PriorityTone, string> = {
  neutral: "bg-slate-100 text-slate-700 border border-slate-200",
  info: "bg-sky-50 text-sky-800 border border-sky-100",
  success: "bg-emerald-50 text-emerald-800 border border-emerald-100",
  warning: "bg-amber-50 text-amber-800 border border-amber-100",
  danger: "bg-rose-50 text-rose-700 border border-rose-100",
  critical: "bg-rose-600 text-white border border-rose-600",
};

export const TONE_LABELS: Record<PriorityTone, string> = {
  neutral: "Grey",
  info: "Blue",
  success: "Green",
  warning: "Amber",
  danger: "Red",
  critical: "Solid red",
};

export const GROUP_LABELS: Record<StatusGroup, string> = {
  open: "Awaiting action",
  in_progress: "In progress",
  resolved: "Resolved",
  rejected: "Rejected",
};

export const GROUP_COLORS: Record<StatusGroup, string> = {
  open: "#f87171",
  in_progress: "#8b5cf6",
  resolved: "#14b8a6",
  rejected: "#475569",
};

/** Badge for an SLA clock. */
export const SLA_BADGE: Record<Exclude<SlaState, null>, { label: string; className: string }> = {
  breached: { label: "SLA breached", className: "bg-rose-600 text-white" },
  at_risk: { label: "Due soon", className: "bg-amber-100 text-amber-900 border border-amber-200" },
  paused: { label: "SLA paused", className: "bg-violet-50 text-violet-700 border border-violet-100" },
  on_track: { label: "On track", className: "bg-emerald-50 text-emerald-700 border border-emerald-100" },
  met: { label: "Met", className: "bg-emerald-50 text-emerald-700 border border-emerald-100" },
  met_late: { label: "Met late", className: "bg-orange-50 text-orange-800 border border-orange-100" },
};

/** The clock that currently matters: response while awaiting it, otherwise resolution. */
export function currentSla(sla: { response: SlaState; resolution: SlaState }): SlaState {
  if (sla.response === "breached" || sla.resolution === "breached") return "breached";
  if (sla.response === "at_risk" || sla.response === "on_track") return sla.response;
  return sla.resolution;
}

/** Categorical colours for charts where the categories are data (e.g. departments). */
export const CHART_PALETTE = ["#2563eb", "#14b8a6", "#f97316", "#8b5cf6", "#e11d48", "#eab308", "#0ea5e9", "#64748b"];
