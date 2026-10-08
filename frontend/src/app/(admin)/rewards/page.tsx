/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Award,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Flame,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import {
  api,
  Department,
  LeaderboardEntry,
  LocationNode,
  Paged,
  RewardStats,
  RewardTransaction,
  RewardUserSummary,
  StaffUser,
  resolveAvatarUrl,
} from "@/lib/api";
import { formatDateTime, initials } from "@/lib/format";
import { useAction, useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import {
  Card,
  ErrorBanner,
  Field,
  inputClass,
  PageHeader,
  primaryButtonClass,
  secondaryButtonClass,
  Spinner,
  tabClass,
} from "@/components/ui";
import { RequirePermission } from "@/components/RequirePermission";

function flattenLocations(nodes: LocationNode[], prefix = ""): { id: number; label: string }[] {
  let list: { id: number; label: string }[] = [];
  for (const n of nodes) {
    const label = prefix ? `${prefix} / ${n.name}` : n.name;
    list.push({ id: n.id, label });
    if (n.children && n.children.length > 0) {
      list = list.concat(flattenLocations(n.children, label));
    }
  }
  return list;
}

const RULE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  on_time_resolution: { label: "On-Time Resolution", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "⏱️" },
  speed_bonus: { label: "Speed Bonus (≤50% SLA)", color: "bg-sky-50 text-sky-700 border-sky-200", icon: "⚡" },
  five_star_rating: { label: "5★ Citizen Rating", color: "bg-amber-50 text-amber-700 border-amber-200", icon: "⭐" },
  four_star_rating: { label: "4★ Citizen Rating", color: "bg-yellow-50 text-yellow-700 border-yellow-200", icon: "✨" },
  zero_reopen_closure: { label: "Zero-Reopen Closure", color: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: "🎯" },
  streak_milestone: { label: "Clean Streak Milestone", color: "bg-purple-50 text-purple-700 border-purple-200", icon: "🔥" },
  manual_adjustment: { label: "Admin Adjustment", color: "bg-slate-100 text-slate-700 border-slate-200", icon: "🛡️" },
};

function RuleBadge({ rule }: { rule: string }) {
  const meta = RULE_LABELS[rule] || { label: rule, color: "bg-slate-100 text-slate-700 border-slate-200", icon: "🪙" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.color}`}>
      <span>{meta.icon}</span>
      <span>{meta.label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Manual Point Adjustment Modal
// ---------------------------------------------------------------------------
function ManualAdjustmentModal({
  users,
  onClose,
  onAdjusted,
}: {
  users: StaffUser[];
  onClose: () => void;
  onAdjusted: () => void;
}) {
  const [selectedUserId, setSelectedUserId] = useState<number | "">("");
  const [points, setPoints] = useState<number>(50);
  const [description, setDescription] = useState("");
  const action = useAction();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !description.trim()) return;

    action.run(async () => {
      await api.rewards.adjustPoints({
        user_id: Number(selectedUserId),
        points: Number(points),
        description: description.trim(),
      });
      onAdjusted();
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">Manual Reward / Point Adjustment</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <ErrorBanner message={action.error} />

          <Field label="Staff Member">
            <select
              className={inputClass}
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value === "" ? "" : Number(e.target.value))}
              required
            >
              <option value="">Select staff recipient…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role.name} — {u.email})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Points to Grant / Deduct" hint="Positive to award, negative to deduct">
            <input
              type="number"
              className={inputClass}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              required
            />
          </Field>

          <Field label="Reason / Justification" hint="Required for audit and recipient notification">
            <input
              className={inputClass}
              placeholder="e.g. Outstanding work during emergency night flood response"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={action.busy}>
              Cancel
            </button>
            <button type="submit" className={primaryButtonClass} disabled={action.busy || !selectedUserId}>
              {action.busy ? "Granting…" : "Apply Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Rewards Page Component
// ---------------------------------------------------------------------------
export default function RewardsPage() {
  const { me, can } = useSession();
  const isSuperAdmin = me.is_super_admin;
  const canManage = can("rewards.manage") || isSuperAdmin;

  const [activeTab, setActiveTab] = useState<"leaderboard" | "audit">("leaderboard");
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);

  // My Summary
  const { data: mySummary, reload: reloadMySummary } = useApiData<RewardUserSummary>(() => api.rewards.myRewards(), [me.id]);

  // Support / Option data
  const { data: departments } = useApiData<Department[]>(() => api.departments.list(), []);
  const { data: locationNodes } = useApiData<LocationNode[]>(() => api.locations.tree(), []);
  const { data: managers } = useApiData<StaffUser[]>(() => api.team.managers(), []);
  const { data: allStaffUsers } = useApiData<{ items: StaffUser[] }>(() => api.users.list({ page_size: 100 }), []);

  const flattenedLocations = useMemo(() => {
    return locationNodes ? flattenLocations(locationNodes) : [];
  }, [locationNodes]);

  // Supervisors list: users who have supervisor or manager roles or reportees
  const supervisors = useMemo(() => {
    if (!allStaffUsers?.items) return [];
    return allStaffUsers.items.filter((u) => u.role.key === "supervisor" || u.role.key === "manager");
  }, [allStaffUsers]);

  // -------------------------------------------------------------------------
  // Leaderboard State
  // -------------------------------------------------------------------------
  const [lbTimeframe, setLbTimeframe] = useState<"today" | "week" | "month" | "all">("month");
  const [lbDept, setLbDept] = useState<number | undefined>(undefined);
  const [lbLoc, setLbLoc] = useState<number | undefined>(undefined);

  const { data: leaderboard, loading: lbLoading, reload: reloadLeaderboard } = useApiData<LeaderboardEntry[]>(
    () => api.rewards.leaderboard({ timeframe: lbTimeframe, department_id: lbDept, location_id: lbLoc, limit: 30 }),
    [lbTimeframe, lbDept, lbLoc],
  );

  // -------------------------------------------------------------------------
  // Super Admin Audit State & Filters
  // -------------------------------------------------------------------------
  const [auditPage, setAuditPage] = useState(1);
  const [datePreset, setDatePreset] = useState<"all" | "today" | "7d" | "30d" | "custom">("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterDept, setFilterDept] = useState<number | undefined>(undefined);
  const [filterLoc, setFilterLoc] = useState<number | undefined>(undefined);
  const [filterManager, setFilterManager] = useState<number | undefined>(undefined);
  const [filterSupervisor, setFilterSupervisor] = useState<number | undefined>(undefined);
  const [filterRule, setFilterRule] = useState<string>("");
  const [filterSearch, setFilterSearch] = useState<string>("");
  const [appliedSearch, setAppliedSearch] = useState<string>("");

  const applyPreset = (preset: "all" | "today" | "7d" | "30d" | "custom") => {
    setDatePreset(preset);
    const now = new Date();
    const toStr = (d: Date) => d.toISOString().split("T")[0];

    if (preset === "all") {
      setFilterDateFrom("");
      setFilterDateTo("");
    } else if (preset === "today") {
      setFilterDateFrom(toStr(now));
      setFilterDateTo(toStr(now));
    } else if (preset === "7d") {
      const past = new Date();
      past.setDate(past.getDate() - 7);
      setFilterDateFrom(toStr(past));
      setFilterDateTo(toStr(now));
    } else if (preset === "30d") {
      const past = new Date();
      past.setDate(past.getDate() - 30);
      setFilterDateFrom(toStr(past));
      setFilterDateTo(toStr(now));
    }
    setAuditPage(1);
  };

  const resetAllFilters = () => {
    setDatePreset("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterDept(undefined);
    setFilterLoc(undefined);
    setFilterManager(undefined);
    setFilterSupervisor(undefined);
    setFilterRule("");
    setFilterSearch("");
    setAppliedSearch("");
    setAuditPage(1);
  };

  // Admin Transactions Query Object
  const auditQuery = useMemo(
    () => ({
      date_from: filterDateFrom || undefined,
      date_to: filterDateTo || undefined,
      department_id: filterDept,
      location_id: filterLoc,
      manager_id: filterManager,
      supervisor_id: filterSupervisor,
      rule_type: filterRule || undefined,
      q: appliedSearch || undefined,
      page: auditPage,
      page_size: 20,
    }),
    [filterDateFrom, filterDateTo, filterDept, filterLoc, filterManager, filterSupervisor, filterRule, appliedSearch, auditPage],
  );

  const {
    data: transactionsData,
    loading: auditLoading,
    reload: reloadAudit,
  } = useApiData<Paged<RewardTransaction>>(
    () => api.rewards.adminTransactions(auditQuery),
    [filterDateFrom, filterDateTo, filterDept, filterLoc, filterManager, filterSupervisor, filterRule, appliedSearch, auditPage],
  );

  const totalPages = transactionsData ? Math.max(1, Math.ceil(transactionsData.total / transactionsData.page_size)) : 1;

  const { data: statsData, reload: reloadStats } = useApiData<RewardStats>(
    () =>
      api.rewards.adminStats({
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
        department_id: filterDept,
        location_id: filterLoc,
        manager_id: filterManager,
        supervisor_id: filterSupervisor,
        rule_type: filterRule || undefined,
        q: appliedSearch || undefined,
      }),
    [filterDateFrom, filterDateTo, filterDept, filterLoc, filterManager, filterSupervisor, filterRule, appliedSearch],
  );

  const handleExportCsv = async () => {
    await api.rewards.exportCsv({
      date_from: filterDateFrom || undefined,
      date_to: filterDateTo || undefined,
      department_id: filterDept,
      location_id: filterLoc,
      manager_id: filterManager,
      supervisor_id: filterSupervisor,
      rule_type: filterRule || undefined,
      q: appliedSearch || undefined,
    });
  };

  const handleAdjustmentSuccess = () => {
    reloadMySummary();
    reloadLeaderboard();
    reloadAudit();
    reloadStats();
  };

  return (
    <RequirePermission anyOf={["rewards.view"]}>
      <div className="space-y-6 pb-12">
        {/* Page Header */}
        <PageHeader
          title="Rewards & Recognition"
          description="Incentives engine, performance leaderboard rankings, and staff recognition audit trail."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {canManage && (
                <button
                  type="button"
                  onClick={() => setAdjustModalOpen(true)}
                  className={primaryButtonClass}
                >
                  <Plus className="w-4 h-4" /> Manual Adjustment
                </button>
              )}
            </div>
          }
        />

        {/* 1. Personal Overview Banner */}
        {mySummary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <Card className="p-4 rounded-2xl border-amber-200/60 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Available Balance</p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-amber-900">{mySummary.balance}</span>
                  <span className="text-xs font-bold text-amber-700">{mySummary.currency_symbol} {mySummary.currency_name}</span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700 text-xl font-bold">
                🪙
              </div>
            </Card>

            <Card className="p-4 rounded-2xl border-slate-100 bg-white flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Lifetime Earned</p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-slate-800">{mySummary.lifetime_points}</span>
                  <span className="text-xs font-semibold text-slate-500">pts</span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                <TrendingUp className="w-5 h-5" />
              </div>
            </Card>

            <Card className="p-4 rounded-2xl border-slate-100 bg-white flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Current Standing</p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-slate-800">#{mySummary.rank ?? "—"}</span>
                  <span className="text-xs font-semibold text-slate-500">on leaderboard</span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                <Trophy className="w-5 h-5" />
              </div>
            </Card>

            <Card className="p-4 rounded-2xl border-slate-100 bg-white flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">System Status</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm font-bold text-slate-800">
                    {mySummary.is_enabled ? "Rewards Active" : "Paused"}
                  </span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Sparkles className="w-5 h-5" />
              </div>
            </Card>
          </div>
        )}

        {/* 2. Main Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("leaderboard")}
            className={tabClass(activeTab === "leaderboard")}
          >
            <span className="flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Leaderboard & Rankings
            </span>
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => setActiveTab("audit")}
              className={tabClass(activeTab === "audit")}
            >
              <span className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Super Admin Rewards Audit
              </span>
            </button>
          )}
        </div>

        {/* ================================================================= */}
        {/* TAB 1: LEADERBOARD & RANKINGS                                     */}
        {/* ================================================================= */}
        {activeTab === "leaderboard" && (
          <div className="space-y-6">
            {/* Leaderboard Filters Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <div className="flex flex-wrap items-center gap-1.5">
                {(["today", "week", "month", "all"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setLbTimeframe(t)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      lbTimeframe === t
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {t === "today" ? "Today" : t === "week" ? "This Week" : t === "month" ? "This Month" : "All Time"}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  value={lbDept ?? ""}
                  onChange={(e) => setLbDept(e.target.value ? Number(e.target.value) : undefined)}
                  className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-700"
                >
                  <option value="">All Departments</option>
                  {departments?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>

                <select
                  value={lbLoc ?? ""}
                  onChange={(e) => setLbLoc(e.target.value ? Number(e.target.value) : undefined)}
                  className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-700 max-w-xs truncate"
                >
                  <option value="">All Locations</option>
                  {flattenedLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Top 3 Podium (when >= 3 members exist) */}
            {leaderboard && leaderboard.length >= 3 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {/* 2nd Place */}
                <Card className="p-5 rounded-2xl border-slate-200 bg-gradient-to-t from-slate-50 via-white to-white flex flex-col items-center text-center order-2 md:order-1 relative shadow-xs">
                  <div className="absolute top-3 left-3 text-sm font-bold text-slate-400">#2</div>
                  <div className="w-16 h-16 rounded-full bg-slate-100 border-2 border-slate-300 flex items-center justify-center text-slate-600 font-bold text-lg overflow-hidden mb-2">
                    {leaderboard[1].user.avatar_url ? (
                      <img src={resolveAvatarUrl(leaderboard[1].user.avatar_url)!} alt="" className="w-full h-full object-cover" />
                    ) : (
                      initials(leaderboard[1].user.name)
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 truncate max-w-full">{leaderboard[1].user.name}</h4>
                  <p className="text-[11px] text-slate-400">{leaderboard[1].user.role_name}</p>
                  <div className="mt-3 inline-flex items-center gap-1 px-3 py-1 bg-slate-100 rounded-full text-xs font-black text-slate-800">
                    🥈 {leaderboard[1].points} pts
                  </div>
                </Card>

                {/* 1st Place (Champion) */}
                <Card className="p-6 rounded-2xl border-amber-300 bg-gradient-to-t from-amber-50/70 via-white to-amber-50/30 flex flex-col items-center text-center order-1 md:order-2 relative shadow-md scale-102">
                  <div className="absolute -top-3.5 px-3 py-0.5 rounded-full bg-amber-500 text-white font-extrabold text-[11px] shadow-sm flex items-center gap-1">
                    👑 Champion
                  </div>
                  <div className="w-20 h-20 rounded-full bg-amber-100 border-3 border-amber-400 flex items-center justify-center text-amber-800 font-bold text-xl overflow-hidden mb-2 shadow-sm">
                    {leaderboard[0].user.avatar_url ? (
                      <img src={resolveAvatarUrl(leaderboard[0].user.avatar_url)!} alt="" className="w-full h-full object-cover" />
                    ) : (
                      initials(leaderboard[0].user.name)
                    )}
                  </div>
                  <h4 className="text-base font-extrabold text-slate-900 truncate max-w-full">{leaderboard[0].user.name}</h4>
                  <p className="text-xs text-amber-700 font-medium">{leaderboard[0].user.role_name}</p>
                  <div className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-100 text-amber-900 rounded-full text-sm font-black shadow-xs">
                    🥇 {leaderboard[0].points} pts
                  </div>
                </Card>

                {/* 3rd Place */}
                <Card className="p-5 rounded-2xl border-amber-200/50 bg-gradient-to-t from-amber-50/30 via-white to-white flex flex-col items-center text-center order-3 relative shadow-xs">
                  <div className="absolute top-3 left-3 text-sm font-bold text-amber-700/60">#3</div>
                  <div className="w-16 h-16 rounded-full bg-amber-50 border-2 border-amber-300/80 flex items-center justify-center text-amber-700 font-bold text-lg overflow-hidden mb-2">
                    {leaderboard[2].user.avatar_url ? (
                      <img src={resolveAvatarUrl(leaderboard[2].user.avatar_url)!} alt="" className="w-full h-full object-cover" />
                    ) : (
                      initials(leaderboard[2].user.name)
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 truncate max-w-full">{leaderboard[2].user.name}</h4>
                  <p className="text-[11px] text-slate-400">{leaderboard[2].user.role_name}</p>
                  <div className="mt-3 inline-flex items-center gap-1 px-3 py-1 bg-amber-50 rounded-full text-xs font-black text-amber-900">
                    🥉 {leaderboard[2].points} pts
                  </div>
                </Card>
              </div>
            )}

            {/* Leaderboard Rankings Table */}
            <Card className="rounded-2xl border border-slate-100 overflow-hidden shadow-xs">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-600" />
                  Staff Rankings Table
                </h3>
                <span className="text-xs text-slate-400">{leaderboard?.length ?? 0} participants</span>
              </div>

              {lbLoading ? (
                <div className="p-8"><Spinner /></div>
              ) : !leaderboard || leaderboard.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  No reward transactions found for this timeframe and location selection.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4 w-16">Rank</th>
                        <th className="py-3 px-4">Staff Member</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Department & Area</th>
                        <th className="py-3 px-4 text-center">On-Time</th>
                        <th className="py-3 px-4 text-center">5★ Ratings</th>
                        <th className="py-3 px-4 text-right">Points Earned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leaderboard.map((row) => {
                        const isMe = row.user.id === me.id;
                        return (
                          <tr key={row.user.id} className={isMe ? "bg-amber-50/50 font-medium" : "hover:bg-slate-50/60"}>
                            <td className="py-3 px-4 font-bold text-slate-700">
                              {row.rank === 1 ? "🥇 1" : row.rank === 2 ? "🥈 2" : row.rank === 3 ? "🥉 3" : `#${row.rank}`}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center shrink-0 overflow-hidden">
                                  {row.user.avatar_url ? (
                                    <img src={resolveAvatarUrl(row.user.avatar_url)!} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    initials(row.user.name)
                                  )}
                                </div>
                                <div>
                                  <span className="font-bold text-slate-800">{row.user.name}</span>
                                  {isMe && (
                                    <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                                      You
                                    </span>
                                  )}
                                  <p className="text-[10px] text-slate-400">{row.user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-600">{row.user.role_name}</td>
                            <td className="py-3 px-4 text-slate-500">
                              <div className="truncate max-w-[200px]">
                                {row.user.department || "—"} {row.user.location ? `• ${row.user.location}` : ""}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center text-slate-700 font-semibold">{row.on_time_count}</td>
                            <td className="py-3 px-4 text-center text-amber-600 font-semibold">{row.five_star_count}</td>
                            <td className="py-3 px-4 text-right font-black text-amber-700 text-sm">
                              +{row.points} 🪙
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* My Recent Activity Feed */}
            {mySummary?.recent_transactions && mySummary.recent_transactions.length > 0 && (
              <Card className="p-5 rounded-2xl border border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-500" />
                  Your Recent Reward Events
                </h3>
                <div className="space-y-2.5">
                  {mySummary.recent_transactions.map((t) => (
                    <div
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <RuleBadge rule={t.rule_type} />
                        <div>
                          <p className="font-medium text-slate-800">{t.description}</p>
                          <p className="text-[10px] text-slate-400">{formatDateTime(t.created_at)}</p>
                        </div>
                      </div>
                      <span className={`font-black text-sm ${t.points >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {t.points >= 0 ? `+${t.points}` : t.points} 🪙
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: SUPER ADMIN AUDIT DASHBOARD (WITH EVERY FILTER)            */}
        {/* ================================================================= */}
        {activeTab === "audit" && canManage && (
          <div className="space-y-6">
            {/* 1. Deep Filter Bar (Who, When, Where, What, Manager, Supervisor) */}
            <Card className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Comprehensive Reward Intelligence Filters
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset Filters
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" /> Export CSV
                  </button>
                </div>
              </div>

              {/* Time Presets */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Time:
                </span>
                {(["all", "today", "7d", "30d", "custom"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                      datePreset === p
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {p === "all" ? "All Time" : p === "today" ? "Today" : p === "7d" ? "Last 7 Days" : p === "30d" ? "Last 30 Days" : "Custom"}
                  </button>
                ))}

                {(datePreset === "custom" || filterDateFrom || filterDateTo) && (
                  <div className="flex items-center gap-2 ml-2">
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => {
                        setDatePreset("custom");
                        setFilterDateFrom(e.target.value);
                        setAuditPage(1);
                      }}
                      className="h-8 px-2 border border-slate-200 rounded-lg text-xs"
                    />
                    <span className="text-slate-400">to</span>
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => {
                        setDatePreset("custom");
                        setFilterDateTo(e.target.value);
                        setAuditPage(1);
                      }}
                      className="h-8 px-2 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Grid of Dropdowns: Manager, Supervisor, Dept, Loc, Rule */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
                {/* Manager-wise Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Manager Tree</label>
                  <select
                    value={filterManager ?? ""}
                    onChange={(e) => {
                      setFilterManager(e.target.value ? Number(e.target.value) : undefined);
                      setAuditPage(1);
                    }}
                    className={inputClass}
                  >
                    <option value="">All Managers</option>
                    {managers?.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.role.name})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Supervisor-wise Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Supervisor Team</label>
                  <select
                    value={filterSupervisor ?? ""}
                    onChange={(e) => {
                      setFilterSupervisor(e.target.value ? Number(e.target.value) : undefined);
                      setAuditPage(1);
                    }}
                    className={inputClass}
                  >
                    <option value="">All Supervisors</option>
                    {supervisors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.role.name})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Department Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Department</label>
                  <select
                    value={filterDept ?? ""}
                    onChange={(e) => {
                      setFilterDept(e.target.value ? Number(e.target.value) : undefined);
                      setAuditPage(1);
                    }}
                    className={inputClass}
                  >
                    <option value="">All Departments</option>
                    {departments?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Location Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Location Subtree</label>
                  <select
                    value={filterLoc ?? ""}
                    onChange={(e) => {
                      setFilterLoc(e.target.value ? Number(e.target.value) : undefined);
                      setAuditPage(1);
                    }}
                    className={inputClass}
                  >
                    <option value="">All Locations</option>
                    {flattenedLocations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rule / Trigger Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Trigger Event</label>
                  <select
                    value={filterRule}
                    onChange={(e) => {
                      setFilterRule(e.target.value);
                      setAuditPage(1);
                    }}
                    className={inputClass}
                  >
                    <option value="">All Trigger Rules</option>
                    <option value="on_time_resolution">⏱️ On-Time SLA Resolution</option>
                    <option value="speed_bonus">⚡ Speed Bonus (≤50% SLA)</option>
                    <option value="five_star_rating">⭐ 5★ Citizen Rating</option>
                    <option value="four_star_rating">✨ 4★ Citizen Rating</option>
                    <option value="zero_reopen_closure">🎯 Zero-Reopen Closure</option>
                    <option value="streak_milestone">🔥 Clean Streak Milestone</option>
                    <option value="manual_adjustment">🛡️ Manual Adjustment</option>
                  </select>
                </div>
              </div>

              {/* Free Text Search Bar */}
              <div className="pt-1">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setAppliedSearch(filterSearch.trim());
                    setAuditPage(1);
                  }}
                  className="flex items-center gap-2"
                >
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      className="w-full h-9 pl-9 pr-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      placeholder="Search recipient name, email, or complaint ID (e.g. CMP-2026-0001)…"
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                    />
                  </div>
                  <button type="submit" className={primaryButtonClass}>
                    Search
                  </button>
                  {appliedSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterSearch("");
                        setAppliedSearch("");
                        setAuditPage(1);
                      }}
                      className={secondaryButtonClass}
                    >
                      Clear
                    </button>
                  )}
                </form>
              </div>
            </Card>

            {/* 2. Live Dynamic Summary Stat Cards */}
            {statsData && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <Card className="p-4 rounded-2xl border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Points Awarded</p>
                    <p className="text-2xl font-black text-amber-700 mt-1">{statsData.total_points} 🪙</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                    <Award className="w-5 h-5" />
                  </div>
                </Card>

                <Card className="p-4 rounded-2xl border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Award Events</p>
                    <p className="text-2xl font-black text-slate-800 mt-1">{statsData.total_transactions}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <Zap className="w-5 h-5" />
                  </div>
                </Card>

                <Card className="p-4 rounded-2xl border-slate-100 col-span-1 sm:col-span-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Rule Distribution</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {statsData.by_rule?.map((r) => (
                      <span key={r.rule} className="px-2.5 py-1 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-700">
                        {RULE_LABELS[r.rule]?.icon || "🪙"} {RULE_LABELS[r.rule]?.label || r.rule}: <strong className="text-slate-900">{r.points} pts</strong> ({r.count})
                      </span>
                    ))}
                    {(!statsData.by_rule || statsData.by_rule.length === 0) && (
                      <span className="text-xs text-slate-400">No events for current filter</span>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {/* 3. The Full Audit Table ("Who got how, when, where, what") */}
            <Card className="rounded-2xl border border-slate-100 overflow-hidden shadow-xs">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-600" />
                  Granular Reward Transactions & Audit Trail
                </h3>
                <span className="text-xs text-slate-500 font-medium">
                  Showing {transactionsData?.items?.length ?? 0} of {transactionsData?.total ?? 0} records
                </span>
              </div>

              {auditLoading ? (
                <div className="p-12"><Spinner /></div>
              ) : !transactionsData || transactionsData.items.length === 0 ? (
                <div className="p-16 text-center text-slate-400 text-xs">
                  No reward transactions found matching the selected filter criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4">When</th>
                        <th className="py-3 px-4">Recipient (Who)</th>
                        <th className="py-3 px-4">Supervisor / Manager</th>
                        <th className="py-3 px-4">Where (Dept & Loc)</th>
                        <th className="py-3 px-4">Trigger (What)</th>
                        <th className="py-3 px-4 text-center">Multiplier</th>
                        <th className="py-3 px-4 text-right">Points</th>
                        <th className="py-3 px-4">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transactionsData.items.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* When */}
                          <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                            <span className="font-semibold text-slate-700 block">{formatDateTime(tx.created_at)}</span>
                            <span className="text-[10px] text-slate-400">TX #{tx.id}</span>
                          </td>

                          {/* Who */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                                {initials(tx.user_name)}
                              </div>
                              <div>
                                <span className="font-bold text-slate-800 block">{tx.user_name}</span>
                                <span className="text-[10px] text-slate-400 block">{tx.user_email}</span>
                                <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                                  {tx.user_role}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Supervisor / Manager */}
                          <td className="py-3 px-4 text-slate-600">
                            <div className="space-y-0.5">
                              {Boolean(tx.breakdown?.supervisor) && (
                                <p className="text-[11px]">
                                  <span className="text-slate-400">Sup:</span> {String(tx.breakdown?.supervisor)}
                                </p>
                              )}
                              {Boolean(tx.breakdown?.manager) && (
                                <p className="text-[11px]">
                                  <span className="text-slate-400">Mgr:</span> {String(tx.breakdown?.manager)}
                                </p>
                              )}
                              {!tx.breakdown?.supervisor && !tx.breakdown?.manager && (
                                <span className="text-slate-400">—</span>
                              )}
                            </div>
                          </td>

                          {/* Where */}
                          <td className="py-3 px-4 text-slate-600">
                            <div>
                              <span className="font-semibold text-slate-700 block">{tx.department_name || "—"}</span>
                              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                {tx.location_name || "—"}
                              </span>
                            </div>
                          </td>

                          {/* What */}
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <RuleBadge rule={tx.rule_type} />
                              {tx.complaint_generated_id && (
                                <div className="block">
                                  <Link
                                    href={`/complaints/${encodeURIComponent(tx.complaint_generated_id)}`}
                                    className="font-mono text-[11px] text-blue-600 hover:text-blue-800 font-bold hover:underline"
                                  >
                                    {tx.complaint_generated_id}
                                  </Link>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Multiplier */}
                          <td className="py-3 px-4 text-center">
                            {tx.multiplier && tx.multiplier !== 1.0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold text-[10px] border border-purple-200">
                                {tx.multiplier}x
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">1.0x</span>
                            )}
                          </td>

                          {/* Points */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <span className={`font-black text-sm ${tx.points >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                              {tx.points >= 0 ? `+${tx.points}` : tx.points} 🪙
                            </span>
                          </td>

                          {/* Description */}
                          <td className="py-3 px-4 text-slate-600 max-w-xs">
                            <p className="line-clamp-2" title={tx.description}>{tx.description}</p>
                            {tx.granted_by_name && (
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                By: {tx.granted_by_name}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {transactionsData && totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                  <span className="text-xs text-slate-500">
                    Page {transactionsData.page} of {totalPages}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={transactionsData.page <= 1}
                      onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={transactionsData.page >= totalPages}
                      onClick={() => setAuditPage((p) => p + 1)}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Manual Point Adjustment Modal */}
        {adjustModalOpen && (
          <ManualAdjustmentModal
            users={allStaffUsers?.items || []}
            onClose={() => setAdjustModalOpen(false)}
            onAdjusted={handleAdjustmentSuccess}
          />
        )}
      </div>
    </RequirePermission>
  );
}
