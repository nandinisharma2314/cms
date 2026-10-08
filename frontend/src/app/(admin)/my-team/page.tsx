"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Star,
  Timer,
  Users,
} from "lucide-react";
import { api, ComplaintData, TeamDashboardResponse, TeamMemberPerformance, StaffUser } from "@/lib/api";
import { useDocumentTitle } from "@/lib/config";
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
    <Card className="p-2.5 sm:p-4 flex flex-col justify-between">
      <div className="flex items-start justify-between gap-1.5 sm:gap-2">
        <span className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 mt-0.5 leading-tight">
          {label}
        </span>
        <div className={`p-1.5 sm:p-2 shrink-0 rounded-lg border ${tones[tone]}`}>
          <Icon className={`w-3.5 sm:w-4 h-3.5 sm:h-4 ${iconTones[tone]}`} />
        </div>
      </div>
      <div className="mt-2 sm:mt-3">
        <div className="text-lg sm:text-2xl font-bold text-slate-900 leading-none sm:leading-normal">{value}</div>
        {subtext && <div className="text-[9px] sm:text-[11px] text-slate-500 mt-1 sm:mt-0.5 leading-tight">{subtext}</div>}
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
              <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setReassigning(null)}>
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
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${c.priority.tone === "danger" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}
                    >
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

export default function TeamsPage() {
  useDocumentTitle("Teams");
  const [directOnly, setDirectOnly] = useState(false);

  const [periodPreset, setPeriodPreset] = useState<"7" | "30" | "90" | "custom">("30");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");

  const [locationFilter, setLocationFilter] = useState("");
  const [selectedMember, setSelectedMember] = useState<TeamMemberPerformance | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState<number | "">("");
  const [viewMode, setViewMode] = useState<"overview" | "dashboard">("overview");
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: managers } = useApiData<StaffUser[]>(() => api.team.managers(), []);

  const [prevManagers, setPrevManagers] = useState<StaffUser[] | undefined>(undefined);

  if (managers !== prevManagers) {
    setPrevManagers(managers);
    if (managers && managers.length === 1) {
      setSelectedManagerId(managers[0].id);
      setViewMode("dashboard");
    } else if (managers && managers.length > 1 && selectedManagerId !== "") {
      setViewMode("dashboard");
    } else {
      setViewMode("overview");
    }
  }

  const { date_from, date_to } = React.useMemo(() => {
    if (periodPreset === "custom") {
      return {
        date_from: customDateFrom || undefined,
        date_to: customDateTo || undefined,
      };
    }
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - (Number(periodPreset) - 1));
    return {
      date_from: from.toISOString().split("T")[0],
      date_to: to.toISOString().split("T")[0],
    };
  }, [periodPreset, customDateFrom, customDateTo]);

  const {
    data,
    error: loadError,
    loading,
    reload,
  } = useApiData<TeamDashboardResponse>(
    () =>
      api.team.dashboard({
        date_from,
        date_to,
        direct_only: directOnly,
        manager_id: selectedManagerId ? Number(selectedManagerId) : undefined,
      }),
    [date_from, date_to, directOnly, selectedManagerId],
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

  // Filter derivations
  const activeLocations = Array.from(
    new Set(
      viewMode === "overview"
        ? managers?.map((m) => m.primary_location?.name).filter(Boolean)
        : data?.members.map((m) => m.primary_location?.name).filter(Boolean),
    ),
  ) as string[];

  const filteredManagers = managers?.filter((m) => !locationFilter || m.primary_location?.name === locationFilter);
  const filteredMembers = data?.members.filter((m) => !locationFilter || m.primary_location?.name === locationFilter);

  // Helper to generate initials
  const getInitials = (name: string) => {
    const parts = name.split(" ").filter(Boolean);
    return parts
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("");
  };

  return (
    <RequirePermission anyOf={["team.view"]}>
      <div className="space-y-4 -mt-5 sm:-mt-2">
        <PageHeader
          title="Teams"
          description="Live supervision portal: monitor team performance, workload distribution, and SLA adherence."
          actions={
            <div className="flex flex-wrap items-center gap-2 pb-1 sm:pb-0 justify-end w-full sm:w-auto">
              {/* Custom Date Filters */}
              {periodPreset === "custom" && (
                <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                  <input
                    type="date"
                    value={customDateFrom}
                    onChange={(e) => setCustomDateFrom(e.target.value)}
                    className="text-xs border-none bg-slate-50 focus:ring-sky-500 rounded-lg p-1.5 w-28 text-slate-600"
                    placeholder="From"
                  />
                  <span className="text-slate-300">-</span>
                  <input
                    type="date"
                    value={customDateTo}
                    onChange={(e) => setCustomDateTo(e.target.value)}
                    className="text-xs border-none bg-slate-50 focus:ring-sky-500 rounded-lg p-1.5 w-28 text-slate-600"
                    placeholder="To"
                  />
                </div>
              )}

              {/* Date Preset Selector */}
              <select
                value={periodPreset}
                onChange={(e) => setPeriodPreset(e.target.value as "7" | "30" | "90" | "custom")}
                className="rounded-xl border-slate-200 text-xs font-medium text-slate-700 py-2 pl-3 pr-8 focus:ring-sky-500 bg-white shadow-sm shrink-0"
              >
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="custom">Custom Range</option>
              </select>

              {/* Location Filter */}
              {activeLocations.length > 0 && (
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    className="rounded-xl border-slate-200 text-xs font-medium text-slate-700 py-2 pl-8 pr-8 focus:ring-sky-500 bg-white shadow-sm shrink-0 max-w-[140px]"
                  >
                    <option value="">All Locations</option>
                    {activeLocations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Direct Reports Toggle (Dashboard mode only) */}
              {viewMode === "dashboard" && (
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 px-3 py-2 rounded-xl cursor-pointer select-none shrink-0 shadow-sm">
                  <input
                    type="checkbox"
                    checked={directOnly}
                    onChange={(e) => setDirectOnly(e.target.checked)}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  Direct Reports
                </label>
              )}

              <button
                type="button"
                className={secondaryButtonClass + " !px-2.5 sm:!px-3 !py-2 shrink-0"}
                onClick={() => reload()}
                title="Refresh Data"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          }
        />

        <ErrorBanner message={actionError ?? loadError} />
        <Notice message={notice} />

        {viewMode === "overview" ? (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800">Teams Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredManagers?.map((manager) => (
                <Card
                  key={manager.id}
                  className="p-5 flex flex-col gap-4 border border-slate-200 hover:border-sky-300 hover:shadow-md transition-all duration-200 bg-gradient-to-br from-white to-slate-50/50"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex gap-3 items-center">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">
                        {getInitials(manager.name)}
                      </div>
                      <div>
                        <Link
                          href={`/users/staff/${manager.id}`}
                          className="font-bold text-slate-900 hover:text-sky-700 hover:underline line-clamp-1"
                        >
                          {manager.primary_department?.name || manager.name}&apos;s Team
                        </Link>
                        <p className="text-xs font-medium text-slate-500 line-clamp-1">{manager.role.name}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border border-slate-100 p-3 text-xs text-slate-600 flex flex-col gap-2.5 mt-1">
                    <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                      <span className="text-slate-400 font-medium">Team Lead:</span>
                      <Link
                        href={`/users/staff/${manager.id}`}
                        className="font-semibold text-slate-800 hover:text-sky-700 hover:underline"
                      >
                        {manager.name}
                      </Link>
                    </div>
                    {manager.reports_to && (
                      <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                        <span className="text-slate-400 font-medium">Manager:</span>
                        <Link
                          href={`/users/staff/${manager.reports_to.id}`}
                          className="font-semibold text-slate-800 hover:text-sky-700 hover:underline"
                        >
                          {manager.reports_to.name}
                        </Link>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate font-medium">{manager.primary_location?.name || "Global / Multiple"}</span>
                    </div>
                  </div>

                  <div className="pt-2 mt-auto grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setSelectedManagerId(manager.id);
                        setViewMode("dashboard");
                        setLocationFilter(""); // reset filter on drilldown
                      }}
                      className={primaryButtonClass + " !py-2 flex justify-center text-xs"}
                    >
                      View Members
                    </button>
                    <Link
                      href={`/users/staff/${manager.id}`}
                      className={secondaryButtonClass + " !py-2 flex justify-center text-xs bg-white hover:bg-slate-50"}
                    >
                      Lead Profile
                    </Link>
                  </div>
                </Card>
              ))}
              {filteredManagers?.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-500 bg-white border border-dashed rounded-xl">
                  No teams found matching your filters.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-300">
            {managers && managers.length > 1 && (
              <div className="flex items-center">
                <button
                  onClick={() => {
                    setViewMode("overview");
                    setSelectedManagerId("");
                    setLocationFilter(""); // reset
                  }}
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to Teams Overview
                </button>
              </div>
            )}

            {/* Aggregated KPI Cards */}
            {agg ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
                <KpiTile label="Team Size" value={data.team_size} subtext="Supervised staff" icon={Users} tone="info" />
                <KpiTile
                  label="Active Pending"
                  value={agg.pending}
                  subtext={`${agg.total_assigned} total`}
                  icon={Clock}
                  tone={agg.pending > 15 ? "warning" : "neutral"}
                />
                <KpiTile
                  label="Resolved"
                  value={agg.resolved}
                  subtext={`${agg.avg_resolution_hours ?? "—"}h avg res.`}
                  icon={CheckCircle2}
                  tone="success"
                />
                <KpiTile
                  label="Response SLA"
                  value={agg.response_sla_pct !== null ? `${agg.response_sla_pct}%` : "—"}
                  subtext={`${agg.avg_response_hours ?? "—"}h avg`}
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
                  subtext={`${agg.sla_breaches} breaches`}
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
                  subtext={`${agg.reopen_pct ?? 0}% reopen`}
                  icon={Star}
                  tone={agg.avg_rating && agg.avg_rating >= 4 ? "success" : "neutral"}
                />
              </div>
            ) : null}

            {/* Member Cards Grid */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Team Workload & Performance</h3>
                <p className="text-xs text-slate-500 mt-0.5">Individual performance statistics across the selected period.</p>
              </div>

              {loading ? (
                <div className="py-12 text-center text-sm text-slate-500 bg-white border border-dashed rounded-xl">
                  Loading team performance...
                </div>
              ) : !data || filteredMembers?.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500 bg-white border border-dashed rounded-xl">
                  {data?.members.length === 0
                    ? "No subordinates found under this management line."
                    : "No members match the selected filters."}
                </div>
              ) : (
                <div className="flex flex-col space-y-3">
                  {filteredMembers?.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-3 sm:p-4 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors shadow-sm"
                    >
                      <Link href={`/users/staff/${m.id}`} className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 group">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm sm:text-base shrink-0 group-hover:bg-blue-50 group-hover:text-blue-700 transition-colors">
                          {getInitials(m.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-sm sm:text-base truncate group-hover:text-blue-700 transition-colors">{m.name}</div>
                          <div className="text-[11px] sm:text-xs font-semibold text-blue-600 mt-0.5 truncate">{m.role}</div>
                          <div className="text-[10px] sm:text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" />
                            {m.primary_location?.name || "Global / Multiple"}
                          </div>
                        </div>
                      </Link>
                      
                      <div className="flex items-center gap-2 sm:gap-3 pl-3 border-l border-slate-100 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleAvailability(m)}
                          title={`Click to toggle availability. Currently ${m.is_available ? "Online" : "Away"}`}
                          className="shrink-0 p-2 rounded-full hover:bg-slate-50 transition-colors"
                        >
                          <span className={`flex w-3 h-3 rounded-full shadow-sm border border-white ${m.is_available ? "bg-emerald-500" : "bg-amber-500"}`} />
                        </button>
                        <button
                          type="button"
                          className="text-[11px] sm:text-xs font-semibold text-slate-700 bg-slate-100 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg hover:bg-slate-200 transition-colors shadow-xs"
                          onClick={() => setSelectedMember(m)}
                        >
                          Manage
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

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
