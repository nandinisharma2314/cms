import { ComplaintStatus } from "./api";

/** Badge colours per workflow status. */
export const STATUS_BADGE: Record<ComplaintStatus, string> = {
  SUBMITTED: "bg-rose-50 text-rose-600 border border-rose-100",
  ASSIGNED: "bg-amber-50 text-amber-700 border border-amber-100",
  REOPENED: "bg-orange-50 text-orange-700 border border-orange-100",
  ACKNOWLEDGED: "bg-sky-50 text-sky-700 border border-sky-100",
  IN_PROGRESS: "bg-blue-50 text-blue-600 border border-blue-100",
  WAITING_FOR_INFORMATION: "bg-violet-50 text-violet-700 border border-violet-100",
  RESOLVED: "bg-emerald-50 text-emerald-600 border border-emerald-100",
  CLOSED: "bg-slate-100 text-slate-600 border border-slate-200",
  REJECTED: "bg-slate-800 text-white border border-slate-800",
  REJECTION_REQUESTED: "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100",
};

export const PRIORITY_BADGE: Record<string, string> = {
  Critical: "bg-rose-600 text-white",
  High: "bg-rose-50 text-rose-600 border border-rose-100",
  Medium: "bg-amber-50 text-amber-700 border border-amber-100",
  Low: "bg-emerald-50 text-emerald-700 border border-emerald-100",
};

export const GROUP_LABELS = {
  open: "Awaiting Action",
  in_progress: "In Progress",
  resolved: "Resolved",
  rejected: "Rejected",
} as const;

/** Badge for an SLA clock; null state shows nothing. */
export const SLA_BADGE: Record<string, { label: string; className: string }> = {
  breached: { label: "SLA breached", className: "bg-rose-600 text-white" },
  at_risk: { label: "Due soon", className: "bg-amber-100 text-amber-800 border border-amber-200" },
  paused: { label: "SLA paused", className: "bg-violet-50 text-violet-700 border border-violet-100" },
  on_track: { label: "On track", className: "bg-emerald-50 text-emerald-700 border border-emerald-100" },
  met: { label: "Met", className: "bg-emerald-50 text-emerald-700 border border-emerald-100" },
  met_late: { label: "Met late", className: "bg-orange-50 text-orange-700 border border-orange-100" },
};

/** The clock that currently matters: response while awaiting it, otherwise resolution. */
export function currentSla(sla: { response: string | null; resolution: string | null }): string | null {
  if (sla.response === "breached" || sla.resolution === "breached") return "breached";
  if (sla.response === "at_risk" || sla.response === "on_track") return sla.response;
  return sla.resolution;
}
