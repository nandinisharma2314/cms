"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  RefreshCw,
  ShieldCheck,
  Star,
  Timer,
  UserCheck,
  UserMinus,
  Users,
  UserX,
} from "lucide-react";
import { api, ComplaintData, TeamDashboardResponse, TeamMemberPerformance } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { useApiData } from "@/lib/hooks";
import { RequirePermission } from "@/components/RequirePermission";
import {
  Card,
  ErrorBanner,
  Field,
  inputClass,
  Modal,
  Notice,
  PageHeader,
  primaryButtonClass,
  secondaryButtonClass,
  StatusPill,
  TableMessage,
} from "@/components/ui";

function KpiTile({
  label,
  value,
  subtext,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ElementType;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    neutral: "bg-slate-50 text-slate-700 border-slate-200",
    success: "bg-emerald-50 text-emerald-800 border-emerald-200",
    warning: "bg-amber-50 text-amber-800 border-amber-200",
    danger: "bg-rose-50 text-rose-800 border-rose-200",
    info: "bg-sky-50 text-sky-800 border-sky-200",
  };

  const iconTones = {
    neutral: "text-slate-500",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-rose-600",
    info: "text-sky-600",
  };

  return (
    <Card className="p-4 flex flex-col justify-between">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <div className={`p-2 rounded-lg border ${tones[tone]}`}>
          <Icon className={`w-4 h-4 ${iconTones[tone]}`} />
        </div>
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        {subtext && <div className="text-[11px] text-slate-500 mt-0.5">{subtext}</div>}
      </div>
    </Card>
  );
}

function MemberComplaintsModal({
  member,
  teamMembers,
  onClose,
  onReassigned,
}: {
  member: TeamMemberPerformance;
  teamMembers: TeamMemberPerformance[];
  onClose: () => void;
  onReassigned: (msg: string) => void;
}) {
  const [complaints, setComplaints] = useState<ComplaintData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<ComplaintData | null>(null);
  const [newAssigneeId, setNewAssigneeId] = useState<number | "">("");
  const [reassignReason, setReassignReason] = useState("");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    let active = true;
    api.team.memberComplaints(member.id as number).then(
      (list) => {
        if (active) {
          setComplaints(list);
          setLoading(false);
        }
      },
      (err: Error) => {
        if (active) {
          setError(err.message);
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [member.id]);

  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassigning || !newAssigneeId) return;
    setSaving(true);
    try {
      await api.team.reassign({
        complaint_id: reassigning.id,
        new_assignee_id: Number(newAssigneeId),
        reason: reassignReason.trim() || undefined,
      });
      onReassigned(`Complaint ${reassigning.id} reassigned successfully.`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Active Complaints for ${member.name}`}
      description={`${member.role} • ${member.current_active_complaints} active complaint(s)`}
      onClose={onClose}
      wide
    >
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <ErrorBanner message={error} />

        {reassigning ? (
          <form onSubmit={handleReassign} className="p-4 rounded-xl border border-sky-200 bg-sky-50/60 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800">
                Reassign Complaint: <span className="font-mono text-sky-700">{reassigning.id}</span>
              </h4>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-800"
                onClick={() => setReassigning(null)}
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-slate-600 line-clamp-1">{reassigning.title}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Reassign To (Team Member)">
                <select
                  required
                  className={inputClass}
                  value={newAssigneeId}
                  onChange={(e) => setNewAssigneeId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Select team member…</option>
                  {teamMembers
                    .filter((m) => m.id !== member.id && m.is_active)
                    .map((m) => (
                      <option key={m.id} value={m.id as number}>
                        {m.name} ({m.role}) — {m.current_active_complaints} active
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Reason for Reassignment (optional)">
                <input
                  maxLength={255}
                  className={inputClass}
                  placeholder="e.g. Workload rebalancing"
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={secondaryButtonClass} onClick={() => setReassigning(null)}>
                Cancel
              </button>
              <button type="submit" className={primaryButtonClass} disabled={saving || !newAssigneeId}>
                {saving ? "Reassigning…" : "Confirm Reassignment"}
              </button>
            </div>
          </form>
        ) : null}

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading complaints…</div>
        ) : !complaints || complaints.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">No complaints currently assigned to this member.</div>
        ) : (
          <div className="divide-y divide-slate-100 border rounded-xl overflow-hidden">
            {complaints.map((c) => (
              <div key={c.id} className="p-3.5 hover:bg-slate-50/80 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-xs font-bold text-slate-800">{c.id}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {c.status}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${c.priority.tone === "danger" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                      {c.priority.name}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-slate-800 truncate">{c.title}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {c.department} • {c.location} • Filed {formatDateTime(c.created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                    onClick={() => {
                      setReassigning(c);
                      setNewAssigneeId("");
                      setReassignReason("");
                    }}
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Reassign
                  </button>
                  <Link
                    href={`/complaints/${c.id}`}
                    target="_blank"
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                    title="Open Complaint Details"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function MyTeamPage() {
  useDocumentTitle("My Team");
  const [directOnly, setDirectOnly] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<"7" | "30" | "90">("30");
  const [selectedMember, setSelectedMember] = useState<TeamMemberPerformance | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Compute dates based on preset
  const { date_from, date_to } = React.useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - (Number(periodPreset) - 1));
    return {
      date_from: from.toISOString().split("T")[0],
      date_to: to.toISOString().split("T")[0],
    };
  }, [periodPreset]);

  const {
    data,
    error: loadError,
    loading,
    reload,
  } = useApiData<TeamDashboardResponse>(
    () => api.team.dashboard({ date_from, date_to, direct_only: directOnly }),
    [date_from, date_to, directOnly],
  );

  const toggleAvailability = async (member: TeamMemberPerformance) => {
    const newStatus = !member.is_available;
    try {
      await api.team.setAvailability(member.id as number, newStatus);
      setNotice(`${member.name} marked as ${newStatus ? "available" : "unavailable"}.`);
      setActionError(null);
      reload();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const agg = data?.aggregate;

  return (
    <RequirePermission anyOf={["team.view"]}>
      <div className="space-y-4">
        <PageHeader
          title="My Team"
          description="Live supervision portal: monitor team performance, workload distribution, and SLA adherence."
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg transition-colors ${periodPreset === "7" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                  onClick={() => setPeriodPreset("7")}
                >
                  7 Days
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg transition-colors ${periodPreset === "30" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                  onClick={() => setPeriodPreset("30")}
                >
                  30 Days
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg transition-colors ${periodPreset === "90" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                  onClick={() => setPeriodPreset("90")}
                >
                  90 Days
                </button>
              </div>

              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={directOnly}
                  onChange={(e) => setDirectOnly(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                Direct Reports Only
              </label>

              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => reload()}
                title="Refresh Team Data"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
          }
        />

        <ErrorBanner message={actionError ?? loadError} />
        <Notice message={notice} />

        {/* Aggregated KPI Cards */}
        {agg ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiTile
              label="Team Size"
              value={data.team_size}
              subtext="Supervised staff"
              icon={Users}
              tone="info"
            />
            <KpiTile
              label="Active Pending"
              value={agg.pending}
              subtext={`${agg.total_assigned} total in period`}
              icon={Clock}
              tone={agg.pending > 15 ? "warning" : "neutral"}
            />
            <KpiTile
              label="Resolved"
              value={agg.resolved}
              subtext={`${agg.avg_resolution_hours ?? "—"}h avg resolution`}
              icon={CheckCircle2}
              tone="success"
            />
            <KpiTile
              label="Response SLA"
              value={agg.response_sla_pct !== null ? `${agg.response_sla_pct}%` : "—"}
              subtext={`${agg.avg_response_hours ?? "—"}h avg response`}
              icon={Timer}
              tone={
                agg.response_sla_pct === null
                  ? "neutral"
                  : agg.response_sla_pct >= 90
                  ? "success"
                  : agg.response_sla_pct >= 75
                  ? "warning"
                  : "danger"
              }
            />
            <KpiTile
              label="Resolution SLA"
              value={agg.resolution_sla_pct !== null ? `${agg.resolution_sla_pct}%` : "—"}
              subtext={`${agg.sla_breaches} SLA breach${agg.sla_breaches === 1 ? "" : "es"}`}
              icon={ShieldCheck}
              tone={
                agg.resolution_sla_pct === null
                  ? "neutral"
                  : agg.resolution_sla_pct >= 90
                  ? "success"
                  : agg.resolution_sla_pct >= 75
                  ? "warning"
                  : "danger"
              }
            />
            <KpiTile
              label="Customer Rating"
              value={agg.avg_rating !== null ? `${agg.avg_rating} / 5` : "—"}
              subtext={`${agg.reopen_pct ?? 0}% reopen rate`}
              icon={Star}
              tone={agg.avg_rating && agg.avg_rating >= 4 ? "success" : "neutral"}
            />
          </div>
        ) : null}

        {/* Team Members Workload Table */}
        <Card className="overflow-x-auto">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Team Workload & Performance Breakdown</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Individual performance statistics across the selected period. Click Availability to quickly adjust staff routing.
              </p>
            </div>
          </div>
          <table className="w-full min-w-215 text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 uppercase text-[11px] tracking-wider bg-slate-50/50">
                <th className="px-5 py-3 font-semibold">Team Member</th>
                <th className="px-3 py-3 font-semibold">Role & Workplace</th>
                <th className="px-3 py-3 font-semibold">Availability</th>
                <th className="px-3 py-3 font-semibold">Active Workload</th>
                <th className="px-3 py-3 font-semibold">Resolved</th>
                <th className="px-3 py-3 font-semibold">Response SLA</th>
                <th className="px-3 py-3 font-semibold">Resolution SLA</th>
                <th className="px-3 py-3 font-semibold">Breaches</th>
                <th className="px-3 py-3 font-semibold">Rating</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <TableMessage colSpan={10}>Loading team performance…</TableMessage>
              ) : !data || data.members.length === 0 ? (
                <TableMessage colSpan={10}>
                  No subordinates found under your management line. When team members report to you, they will appear here.
                </TableMessage>
              ) : (
                data.members.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70 align-middle">
                    <td className="px-5 py-3">
                      <div className="font-bold text-slate-800">{m.name}</div>
                      <div className="text-[11px] text-slate-400">{m.email}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded text-[10px]">
                        {m.role}
                      </span>
                      {m.primary_department || m.primary_location ? (
                        <div className="text-[11px] text-slate-500 mt-1">
                          {m.primary_department?.name}
                          {m.primary_location ? ` • ${m.primary_location.name}` : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => toggleAvailability(m)}
                        title="Click to toggle availability"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border ${
                          m.is_available
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                            : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${m.is_available ? "bg-emerald-500" : "bg-amber-500"}`} />
                        {m.is_available ? "Available" : "On Leave"}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${
                            m.current_active_complaints > 8
                              ? "bg-rose-100 text-rose-800 font-extrabold"
                              : m.current_active_complaints > 4
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {m.current_active_complaints}
                        </span>
                        <span className="text-[11px] text-slate-400">tickets</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-700">{m.resolved}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`font-semibold ${
                          m.response_sla_pct === null
                            ? "text-slate-400"
                            : m.response_sla_pct >= 90
                            ? "text-emerald-600"
                            : m.response_sla_pct >= 75
                            ? "text-amber-600"
                            : "text-rose-600"
                        }`}
                      >
                        {m.response_sla_pct !== null ? `${m.response_sla_pct}%` : "—"}
                      </span>
                      {m.avg_response_hours !== null && (
                        <div className="text-[10px] text-slate-400">{m.avg_response_hours}h avg</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`font-semibold ${
                          m.resolution_sla_pct === null
                            ? "text-slate-400"
                            : m.resolution_sla_pct >= 90
                            ? "text-emerald-600"
                            : m.resolution_sla_pct >= 75
                            ? "text-amber-600"
                            : "text-rose-600"
                        }`}
                      >
                        {m.resolution_sla_pct !== null ? `${m.resolution_sla_pct}%` : "—"}
                      </span>
                      {m.avg_resolution_hours !== null && (
                        <div className="text-[10px] text-slate-400">{m.avg_resolution_hours}h avg</div>
                      )}
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-700">
                      {m.sla_breaches > 0 ? (
                        <span className="text-rose-600 font-bold">{m.sla_breaches}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {m.avg_rating !== null ? (
                        <div className="flex items-center gap-1 font-semibold text-slate-800">
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                          {m.avg_rating}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        onClick={() => setSelectedMember(m)}
                      >
                        Manage Workload
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>

        {selectedMember && data && (
          <MemberComplaintsModal
            member={selectedMember}
            teamMembers={data.members}
            onClose={() => setSelectedMember(null)}
            onReassigned={(msg) => {
              setNotice(msg);
              reload();
            }}
          />
        )}
      </div>
    </RequirePermission>
  );
}
