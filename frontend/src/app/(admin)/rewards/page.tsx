/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Award,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Filter,
  Flame,
  Gift,
  MapPin,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  Search,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import {
  api,
  Department,
  DepartmentCupEntry,
  LeaderboardEntry,
  LocationNode,
  Paged,
  PublicScorecard,
  RewardPerk,
  RewardQuest,
  RewardRedemption,
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
  resolution_completed: { label: "Complaint Resolved", color: "bg-teal-50 text-teal-700 border-teal-200", icon: "✅" },
  on_time_resolution: { label: "On-Time Resolution", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "⏱️" },
  speed_bonus: { label: "Speed Bonus (≤50% SLA)", color: "bg-sky-50 text-sky-700 border-sky-200", icon: "⚡" },
  five_star_rating: { label: "5★ Citizen Rating", color: "bg-amber-50 text-amber-700 border-amber-200", icon: "⭐" },
  four_star_rating: { label: "4★ Citizen Rating", color: "bg-yellow-50 text-yellow-700 border-yellow-200", icon: "✨" },
  zero_reopen: { label: "Zero-Reopen Closure", color: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: "🎯" },
  zero_reopen_closure: { label: "Zero-Reopen Closure", color: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: "🎯" },
  streak_milestone: { label: "Clean Streak Milestone", color: "bg-purple-50 text-purple-700 border-purple-200", icon: "🔥" },
  manual_adjustment: { label: "Admin Adjustment", color: "bg-slate-100 text-slate-700 border-slate-200", icon: "🛡️" },
  perk_redemption: { label: "Perk Redemption", color: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", icon: "🎁" },
  reopen_clawback: { label: "Reopen Clawback", color: "bg-rose-50 text-rose-700 border-rose-200", icon: "↩️" },
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

function formatPoints(points: number | string): string {
  const n = Number(points);
  if (isNaN(n) || n === 0) return "0";
  if (n > 0) return `+${n}`;
  return `-${Math.abs(n)}`;
}

// ---------------------------------------------------------------------------
// Celebration Modal
// ---------------------------------------------------------------------------
function CelebrationModal({
  title,
  message,
  badge = "🎉",
  onClose,
}: {
  title: string;
  message: string;
  badge?: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-tr from-amber-200 to-amber-400 flex items-center justify-center text-3xl shadow-md animate-bounce">
          {badge}
        </div>
        <div>
          <h3 className="text-lg font-black text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500 mt-1">{message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm cursor-pointer"
        >
          Awesome!
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Certificate of Excellence Modal
// ---------------------------------------------------------------------------
function CertificateModal({
  userName,
  tier,
  onClose,
}: {
  userName: string;
  tier: { current_tier: string; badge: string };
  onClose: () => void;
}) {
  const handlePrint = () => {
    window.print();
  };

  const todayStr = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs print:p-0 print:bg-white animate-in fade-in">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border-4 border-amber-300 p-8 relative overflow-hidden print:border-none print:shadow-none print:p-4">
        <div className="absolute top-3 left-3 text-2xl select-none opacity-40">⚜️</div>
        <div className="absolute top-3 right-3 text-2xl select-none opacity-40">⚜️</div>
        <div className="absolute bottom-3 left-3 text-2xl select-none opacity-40">⚜️</div>
        <div className="absolute bottom-3 right-3 text-2xl select-none opacity-40">⚜️</div>

        <div className="text-center space-y-1">
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-700">CivicCare Municipal Service Excellence</p>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">CERTIFICATE OF RECOGNITION</h2>
          <p className="text-xs text-slate-500 italic">Official Performance & Public Redressal Honor</p>
        </div>

        <div className="w-24 h-1 bg-gradient-to-r from-amber-400 to-amber-600 rounded-full mx-auto my-4" />

        <div className="text-center my-6 space-y-3">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">This certificate is proudly awarded to</p>
          <h3 className="text-3xl font-black text-slate-900 underline decoration-amber-400 decoration-wavy decoration-1 underline-offset-8">
            {userName}
          </h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto pt-2 leading-relaxed">
            In recognition of exemplary commitment to citizen complaint resolution, continuous high SLA turnaround, and attaining the elite standing of:
          </p>
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-50 border border-amber-300/80 shadow-xs">
            <span className="text-2xl">{tier.badge}</span>
            <span className="text-lg font-black text-amber-900">{tier.current_tier}</span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-6 mt-6 text-xs text-slate-500">
          <div>
            <p className="font-bold text-slate-700">CivicCare Commission</p>
            <p className="text-[10px] text-slate-400">Public Grievance Redressal</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-amber-100 border-2 border-amber-400 flex items-center justify-center text-lg mx-auto mb-1">
              🎖️
            </div>
            <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Verified & Certified</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-slate-700">Date Issued</p>
            <p className="text-[10px] text-slate-400">{todayStr}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-8 pt-4 border-t border-slate-100 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manual Point Adjustment Modal (Add & Deduct Modes)
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
  const [mode, setMode] = useState<"add" | "deduct">("add");
  const [amount, setAmount] = useState<number>(50);
  const [category, setCategory] = useState<string>("Exceptional Performance Bonus");
  const [notes, setNotes] = useState<string>("");
  const action = useAction();

  const handleModeChange = (newMode: "add" | "deduct") => {
    setMode(newMode);
    if (newMode === "add") {
      setCategory("Exceptional Performance Bonus");
    } else {
      setCategory("SLA Negligence / Delay");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !notes.trim()) return;

    const signedPoints = mode === "deduct" ? -Math.abs(amount) : Math.abs(amount);
    const fullDesc = category ? `${category}: ${notes.trim()}` : notes.trim();

    action.run(async () => {
      await api.rewards.adjustPoints({
        user_id: Number(selectedUserId),
        points: signedPoints,
        description: fullDesc,
      });
      onAdjusted();
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">Manual Point Adjustment</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <ErrorBanner message={action.error} />

          {/* Action Mode Toggle */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Adjustment Action</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleModeChange("add")}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  mode === "add"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-400/50 shadow-xs"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>Add Points (Bonus)</span>
              </button>
              <button
                type="button"
                onClick={() => handleModeChange("deduct")}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  mode === "deduct"
                    ? "bg-rose-50 text-rose-800 border-rose-300 ring-2 ring-rose-400/50 shadow-xs"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Minus className="w-4 h-4 text-rose-600" />
                <span>Deduct Points (Penalty)</span>
              </button>
            </div>
          </div>

          {/* Staff User */}
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

          {/* Points Amount with clear +/- indicator */}
          <Field
            label={mode === "add" ? "Points to Add" : "Points to Deduct"}
            hint={mode === "add" ? "Points will be credited to balance & lifetime" : "Points will be deducted and tier/badge will recalibrate"}
          >
            <div className="relative">
              <div className={`absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none font-black text-sm ${mode === "add" ? "text-emerald-600" : "text-rose-600"}`}>
                {mode === "add" ? "+" : "-"}
              </div>
              <input
                type="number"
                min="1"
                className={`${inputClass} pl-8 font-bold text-slate-800`}
                value={amount}
                onChange={(e) => setAmount(Math.max(1, Math.abs(Number(e.target.value) || 0)))}
                required
              />
            </div>
          </Field>

          {/* Preset Reason Category */}
          <Field label="Reason Category">
            <select
              className={inputClass}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              {mode === "add" ? (
                <>
                  <option value="Exceptional Performance Bonus">Exceptional Performance Bonus</option>
                  <option value="Emergency / Night Shift Heroics">Emergency / Night Shift Heroics</option>
                  <option value="Citizen Commendation">Exemplary Citizen Feedback</option>
                  <option value="Management Discretionary Award">Management Discretionary Award</option>
                  <option value="Other">Other Custom Award</option>
                </>
              ) : (
                <>
                  <option value="SLA Negligence / Delay">SLA Negligence / Delay Penalty</option>
                  <option value="Premature Resolution Correction">Premature Resolution Correction</option>
                  <option value="Citizen Misconduct Penalty">Citizen Misconduct Penalty</option>
                  <option value="Administrative Error Correction">Administrative Error Correction</option>
                  <option value="Other">Other Custom Penalty</option>
                </>
              )}
            </select>
          </Field>

          {/* Details / Justification */}
          <Field label="Detailed Explanation" hint="Recorded in permanent audit log and sent to employee">
            <input
              className={inputClass}
              placeholder={mode === "add" ? "e.g. Cleared emergency flood complaints during storm warning" : "e.g. Marked ticket resolved before actual repairs were verified"}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              required
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={action.busy}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={action.busy || !selectedUserId}
              className={`py-2 px-4 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer disabled:opacity-50 transition-all ${
                mode === "add"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              }`}
            >
              {action.busy ? "Applying…" : mode === "add" ? "Add Points" : "Deduct Points"}
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

  const [activeTab, setActiveTab] = useState<"leaderboard" | "department_cup" | "scorecard" | "perks" | "audit">("leaderboard");
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [celebration, setCelebration] = useState<{ title: string; message: string; badge?: string } | null>(null);

  // My Summary
  const { data: mySummary, reload: reloadMySummary } = useApiData<RewardUserSummary>(() => api.rewards.myRewards(), [me.id]);

  // Quests, Department Cup & Public Scorecard
  const { data: quests, reload: reloadQuests } = useApiData<RewardQuest[]>(() => api.rewards.listQuests(), [me.id]);
  const { data: deptCup, loading: deptCupLoading, reload: reloadDeptCup } = useApiData<DepartmentCupEntry[]>(() => api.rewards.departmentLeaderboard(), []);
  const { data: scorecard, loading: scorecardLoading, reload: reloadScorecard } = useApiData<PublicScorecard>(() => api.publicScorecard(), []);

  // Support / Option data
  const { data: departments } = useApiData<Department[]>(() => api.departments.list(), []);
  const { data: locationNodes } = useApiData<LocationNode[]>(() => api.locations.tree(), []);
  const { data: managers } = useApiData<StaffUser[]>(() => api.team.managers(), []);
  const { data: allStaffUsers } = useApiData<{ items: StaffUser[] }>(() => api.users.list({ page_size: 100 }), []);

  // Perks Catalog
  const { data: perks } = useApiData<RewardPerk[]>(() => api.rewards.listPerks(), []);
  const { data: myRedemptions, reload: reloadRedemptions } = useApiData<Paged<RewardRedemption>>(
    () => api.rewards.listRedemptions({ user_id: canManage ? undefined : me.id, page_size: 20 }),
    [me.id, canManage],
  );

  const flattenLocationsList = useMemo(() => {
    return locationNodes ? flattenLocations(locationNodes) : [];
  }, [locationNodes]);

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
    reloadQuests();
    reloadDeptCup();
    reloadScorecard();
    setCelebration({
      title: "Adjustment Applied!",
      message: "Points have been successfully recorded in the audit trail.",
      badge: "⭐",
    });
  };

  const redeemAction = useAction();
  const handleRedeemPerk = (perk: RewardPerk) => {
    redeemAction.run(async () => {
      await api.rewards.redeemPerk({ perk_id: perk.id });
      reloadMySummary();
      reloadRedemptions();
      reloadAudit();
      setCelebration({
        title: "Perk Claimed! 🎉",
        message: `You successfully redeemed "${perk.title}". Your balance was deducted ${perk.points_cost} points.`,
        badge: perk.icon,
      });
    });
  };

  const statusAction = useAction();
  const handleUpdateRedemptionStatus = (id: number, status: string) => {
    statusAction.run(async () => {
      await api.rewards.updateRedemption(id, { status });
      reloadRedemptions();
      reloadMySummary();
      reloadAudit();
    });
  };

  const syncAction = useAction();
  const handleSyncRewards = () => {
    syncAction.run(async () => {
      const res = await api.rewards.backfill();
      reloadMySummary();
      reloadLeaderboard();
      reloadAudit();
      reloadStats();
      setCelebration({
        title: "Historical Rewards Synced! 🎉",
        message: `Successfully scanned ${res.complaints_scanned} complaints and created/verified ${res.transactions_created} reward transactions.`,
        badge: "✨",
      });
    });
  };

  return (
    <RequirePermission anyOf={["rewards.view"]}>
      <div className="space-y-6 pb-12">
        {/* Page Header */}
        <PageHeader
          title="Rewards & Recognition"
          description="Real-time employee gamification, performance leaderboard rankings, and perks redemption catalog."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {canManage && (
                <>
                  <button
                    type="button"
                    onClick={handleSyncRewards}
                    disabled={syncAction.busy}
                    className={secondaryButtonClass}
                    title="Scan all historical resolved complaints and credit eligible staff"
                  >
                    <RotateCcw className={`w-4 h-4 ${syncAction.busy ? "animate-spin" : ""}`} />
                    {syncAction.busy ? "Syncing..." : "Sync Past Points"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustModalOpen(true)}
                    className={primaryButtonClass}
                  >
                    <Plus className="w-4 h-4" /> Manual Adjustment
                  </button>
                </>
              )}
            </div>
          }
        />

        {/* 1. Personal Overview & Gamification Tier Progress */}
        {mySummary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <Card className="p-4 rounded-2xl border-amber-200/60 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30 flex items-center justify-between shadow-xs">
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

            <Card className="p-4 rounded-2xl border-slate-100 bg-white flex items-center justify-between shadow-xs">
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

            <Card className="p-4 rounded-2xl border-slate-100 bg-white flex items-center justify-between shadow-xs">
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

            {/* Gamification Tier Card */}
            {mySummary.tier && (
              <Card className="p-4 rounded-2xl border-indigo-100 bg-gradient-to-br from-indigo-50/60 via-white to-purple-50/30 shadow-xs">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Gamification Tier</p>
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1">
                    <span>{mySummary.tier.badge}</span> {mySummary.tier.current_tier}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mt-2">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${mySummary.tier.progress_pct}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1.5 font-medium">
                  <span>{mySummary.tier.progress_pct}% completed</span>
                  {mySummary.tier.next_tier ? (
                    <span>{mySummary.tier.points_to_next_tier} pts to {mySummary.tier.next_tier}</span>
                  ) : (
                    <span className="text-purple-700 font-bold">Top Tier Reached! 👑</span>
                  )}
                </div>
                <div className="mt-2 pt-2 border-t border-indigo-100/80 flex items-center justify-between">
                  <span className="text-[10px] text-indigo-700 font-semibold">Excellence Award</span>
                  <button
                    type="button"
                    onClick={() => setCertificateOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 cursor-pointer hover:underline"
                  >
                    <span>📜 Certificate</span>
                  </button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Monthly Performance Quests & Missions */}
        {quests && quests.length > 0 && (
          <Card className="p-4 rounded-2xl border-indigo-100/80 bg-gradient-to-r from-blue-50/50 via-indigo-50/30 to-purple-50/40 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-base">🎯</span>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Monthly Milestone Quests & Challenges
                </h3>
              </div>
              <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                Resets on 1st of month
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {quests.map((q) => (
                <div
                  key={q.id}
                  className={`p-3.5 rounded-xl border bg-white flex flex-col justify-between transition-all ${
                    q.completed ? "border-emerald-300 ring-2 ring-emerald-400/30 shadow-xs" : "border-slate-200/80"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{q.icon}</span>
                        <div>
                          <h4 className="text-xs font-bold text-slate-800">{q.title}</h4>
                          <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{q.description}</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 shrink-0">
                        +{q.reward_points} 🪙
                      </span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-slate-600 font-semibold mb-1">
                      <span>{q.completed ? "Completed! 🏆" : "Progress"}</span>
                      <span>
                        {q.current} / {q.target}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${
                          q.completed ? "bg-emerald-500" : "bg-blue-600"
                        }`}
                        style={{ width: `${Math.min(100, q.progress_pct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 2. Main Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("leaderboard")}
            className={tabClass(activeTab === "leaderboard")}
          >
            <span className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-600" />
              Leaderboard & Rankings
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("department_cup")}
            className={tabClass(activeTab === "department_cup")}
          >
            <span className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              Department Cup
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("scorecard")}
            className={tabClass(activeTab === "scorecard")}
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Civic Scorecard
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("perks")}
            className={tabClass(activeTab === "perks")}
          >
            <span className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-fuchsia-600" />
              Perks Redemption
            </span>
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => setActiveTab("audit")}
              className={tabClass(activeTab === "audit")}
            >
              <span className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-blue-600" />
                Rewards Audit & Intelligence
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
                  {flattenLocationsList.map((l) => (
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
                        <th className="py-3 px-4">Staff Member & Tier</th>
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
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-slate-800">{row.user.name}</span>
                                    {row.tier && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                        <span>{row.tier.badge}</span>
                                        <span>{row.tier.current_tier}</span>
                                      </span>
                                    )}
                                    {isMe && (
                                      <span className="ml-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                                        You
                                      </span>
                                    )}
                                  </div>
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
                              {formatPoints(row.points)} 🪙
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
                        {formatPoints(t.points)} 🪙
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: INTER-DEPARTMENT CHAMPIONSHIP CUP                          */}
        {/* ================================================================= */}
        {activeTab === "department_cup" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-100/30 to-amber-50/10 border border-amber-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-xl shadow-xs">
                  🏆
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Inter-Department Championship Cup</h3>
                  <p className="text-xs text-slate-600">
                    Department-wide aggregated rewards, SLA compliance speed, and top citizen redressal contributors.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => reloadDeptCup()}
                className="px-3 py-1.5 rounded-xl border border-amber-300 bg-white text-xs font-bold text-amber-900 hover:bg-amber-50 cursor-pointer shadow-2xs"
              >
                Refresh Rankings
              </button>
            </div>

            {deptCupLoading ? (
              <div className="p-12"><Spinner /></div>
            ) : !deptCup || deptCup.length === 0 ? (
              <div className="p-16 text-center text-slate-400 text-xs">
                No department reward statistics recorded yet.
              </div>
            ) : (
              <>
                {/* Department Podium (if >= 3 depts) */}
                {deptCup.length >= 3 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    {/* 2nd Place */}
                    <Card className="p-5 rounded-2xl border-slate-200 bg-gradient-to-t from-slate-50 via-white to-white flex flex-col items-center text-center order-2 md:order-1 relative shadow-xs">
                      <div className="absolute top-3 left-3 text-sm font-bold text-slate-400">#2</div>
                      <div className="w-16 h-16 rounded-2xl bg-slate-100 border-2 border-slate-300 flex items-center justify-center text-3xl mb-2 shadow-xs">
                        {deptCup[1].trophy}
                      </div>
                      <h4 className="text-sm font-extrabold text-slate-800">{deptCup[1].department_name}</h4>
                      <p className="text-[11px] text-slate-500">{deptCup[1].total_resolved} resolved ({deptCup[1].sla_compliance_pct}% on-time)</p>
                      <div className="mt-3 inline-flex items-center gap-1 px-3 py-1 bg-slate-100 rounded-full text-xs font-black text-slate-800">
                        🥈 {deptCup[1].total_points} pts
                      </div>
                      {deptCup[1].top_performer && (
                        <p className="text-[10px] text-slate-400 mt-2">
                          Star MVP: <strong className="text-slate-700">{deptCup[1].top_performer}</strong>
                        </p>
                      )}
                    </Card>

                    {/* 1st Place */}
                    <Card className="p-6 rounded-2xl border-amber-300 bg-gradient-to-t from-amber-50/70 via-white to-amber-50/30 flex flex-col items-center text-center order-1 md:order-2 relative shadow-md scale-102">
                      <div className="absolute -top-3.5 px-3 py-0.5 rounded-full bg-amber-500 text-white font-extrabold text-[11px] shadow-sm flex items-center gap-1">
                        🏆 Cup Leader
                      </div>
                      <div className="w-20 h-20 rounded-2xl bg-amber-100 border-3 border-amber-400 flex items-center justify-center text-4xl mb-2 shadow-sm">
                        {deptCup[0].trophy}
                      </div>
                      <h4 className="text-base font-black text-slate-900">{deptCup[0].department_name}</h4>
                      <p className="text-xs text-amber-700 font-medium">{deptCup[0].total_resolved} resolved ({deptCup[0].sla_compliance_pct}% on-time)</p>
                      <div className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-100 text-amber-900 rounded-full text-sm font-black shadow-xs">
                        🥇 {deptCup[0].total_points} pts
                      </div>
                      {deptCup[0].top_performer && (
                        <p className="text-[11px] text-amber-800 mt-2 font-medium">
                          Star MVP: <strong className="text-amber-950 font-bold">{deptCup[0].top_performer}</strong>
                        </p>
                      )}
                    </Card>

                    {/* 3rd Place */}
                    <Card className="p-5 rounded-2xl border-amber-200/50 bg-gradient-to-t from-amber-50/30 via-white to-white flex flex-col items-center text-center order-3 relative shadow-xs">
                      <div className="absolute top-3 left-3 text-sm font-bold text-amber-700/60">#3</div>
                      <div className="w-16 h-16 rounded-2xl bg-amber-50 border-2 border-amber-300/80 flex items-center justify-center text-3xl mb-2 shadow-xs">
                        {deptCup[2].trophy}
                      </div>
                      <h4 className="text-sm font-extrabold text-slate-800">{deptCup[2].department_name}</h4>
                      <p className="text-[11px] text-slate-500">{deptCup[2].total_resolved} resolved ({deptCup[2].sla_compliance_pct}% on-time)</p>
                      <div className="mt-3 inline-flex items-center gap-1 px-3 py-1 bg-amber-50 rounded-full text-xs font-black text-amber-900">
                        🥉 {deptCup[2].total_points} pts
                      </div>
                      {deptCup[2].top_performer && (
                        <p className="text-[10px] text-slate-400 mt-2">
                          Star MVP: <strong className="text-slate-700">{deptCup[2].top_performer}</strong>
                        </p>
                      )}
                    </Card>
                  </div>
                )}

                {/* Full Department Cup Table */}
                <Card className="rounded-2xl border border-slate-100 overflow-hidden shadow-xs">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-600" />
                      Department Leaderboard Standings
                    </h3>
                    <span className="text-xs text-slate-400">{deptCup.length} departments competing</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                          <th className="py-3 px-4 w-16">Rank</th>
                          <th className="py-3 px-4">Department</th>
                          <th className="py-3 px-4 text-center">Complaints Resolved</th>
                          <th className="py-3 px-4 text-center">On-Time SLA %</th>
                          <th className="py-3 px-4">Department Star Performer</th>
                          <th className="py-3 px-4 text-right">Department Total Points</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {deptCup.map((dept) => (
                          <tr key={dept.department_id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-700 text-sm">
                              {dept.trophy} #{dept.rank}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-800">
                              {dept.department_name}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-700 font-semibold">
                              {dept.total_resolved}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  dept.sla_compliance_pct >= 90
                                    ? "bg-emerald-100 text-emerald-800"
                                    : dept.sla_compliance_pct >= 75
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {dept.sla_compliance_pct}%
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {dept.top_performer ? (
                                <span className="font-bold text-slate-800">{dept.top_performer}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-black text-amber-700 text-sm">
                              {dept.total_points} 🪙
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: PUBLIC CIVIC SCORECARD                                     */}
        {/* ================================================================= */}
        {activeTab === "scorecard" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-100/30 to-emerald-50/10 border border-emerald-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-xl shadow-xs">
                  📊
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Citywide Transparency Scorecard</h3>
                  <p className="text-xs text-slate-600">
                    Real-time citizen grievance turnaround metrics, public satisfaction rating, and department efficiency scores.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => reloadScorecard()}
                className="px-3 py-1.5 rounded-xl border border-emerald-300 bg-white text-xs font-bold text-emerald-900 hover:bg-emerald-50 cursor-pointer shadow-2xs"
              >
                Refresh Metrics
              </button>
            </div>

            {scorecardLoading ? (
              <div className="p-12"><Spinner /></div>
            ) : !scorecard ? (
              <div className="p-16 text-center text-slate-400 text-xs">
                Unable to load civic scorecard data.
              </div>
            ) : (
              <>
                {/* 4 Macro Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <Card className="p-4 rounded-2xl border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Grievances</p>
                      <p className="text-2xl font-black text-slate-900 mt-1">{scorecard.total_complaints_registered}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{scorecard.total_complaints_resolved} resolved / closed</p>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold">
                      📑
                    </div>
                  </Card>

                  <Card className="p-4 rounded-2xl border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Resolution Rate</p>
                      <p className="text-2xl font-black text-emerald-700 mt-1">{scorecard.citywide_sla_compliance_pct}%</p>
                      <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">Citywide Redressal SLA</p>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold">
                      🎯
                    </div>
                  </Card>

                  <Card className="p-4 rounded-2xl border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Avg Turnaround</p>
                      <p className="text-2xl font-black text-indigo-700 mt-1">{scorecard.average_turnaround_hours}h</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">From filing to resolution</p>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl font-bold">
                      ⚡
                    </div>
                  </Card>

                  <Card className="p-4 rounded-2xl border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Citizen Satisfaction</p>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-2xl font-black text-amber-700">{scorecard.citizen_satisfaction_rating}</span>
                        <span className="text-xs font-bold text-slate-400">/ 5.0 ★</span>
                      </div>
                      <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Verified citizen ratings</p>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold">
                      ⭐
                    </div>
                  </Card>
                </div>

                {/* Department Efficiency Breakdown */}
                <Card className="rounded-2xl border border-slate-100 overflow-hidden shadow-xs">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-600" />
                      Departmental Redressal Efficiency Breakdown
                    </h3>
                    <span className="text-xs text-slate-400">{scorecard.departments?.length ?? 0} departments</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                          <th className="py-3 px-4">Department</th>
                          <th className="py-3 px-4 text-center">Total Received</th>
                          <th className="py-3 px-4 text-center">Resolved</th>
                          <th className="py-3 px-4 text-right">Resolution Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {scorecard.departments?.map((d) => (
                          <tr key={d.name} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-800">{d.name}</td>
                            <td className="py-3 px-4 text-center text-slate-600 font-medium">{d.total_complaints}</td>
                            <td className="py-3 px-4 text-center text-emerald-700 font-bold">{d.resolved_complaints}</td>
                            <td className="py-3 px-4 text-right">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  d.resolution_rate_pct >= 90
                                    ? "bg-emerald-100 text-emerald-800"
                                    : d.resolution_rate_pct >= 75
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {d.resolution_rate_pct}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: PERKS & REWARDS REDEMPTION CATALOG                         */}
        {/* ================================================================= */}
        {activeTab === "perks" && (
          <div className="space-y-6">
            <ErrorBanner message={redeemAction.error || statusAction.error} />

            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Gift className="w-4 h-4 text-fuchsia-600" />
                  Redeemable Rewards & Perks Catalog
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Convert your earned points into real certificates, scheduling perks, cafeteria vouchers, and shopping rewards.
                </p>
              </div>
              <div className="px-3.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-1.5">
                <span>🪙 Available:</span>
                <span className="text-sm">{mySummary?.balance ?? 0} pts</span>
              </div>
            </div>

            {/* Perks Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {perks?.map((perk) => {
                const canAfford = (mySummary?.balance ?? 0) >= perk.points_cost;
                return (
                  <Card key={perk.id} className="p-5 rounded-2xl border border-slate-100 hover:border-fuchsia-200 hover:shadow-md transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="w-12 h-12 rounded-2xl bg-fuchsia-50 border border-fuchsia-100 flex items-center justify-center text-2xl shadow-xs">
                          {perk.icon}
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-extrabold text-xs">
                          {perk.points_cost} pts
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-800">{perk.title}</h4>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{perk.description}</p>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase text-slate-400">{perk.category}</span>
                      <button
                        type="button"
                        disabled={!canAfford || redeemAction.busy}
                        onClick={() => handleRedeemPerk(perk)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          canAfford
                            ? "bg-fuchsia-600 hover:bg-fuchsia-700 text-white shadow-xs"
                            : "bg-slate-100 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        {canAfford ? "Redeem Perk" : `Need ${perk.points_cost - (mySummary?.balance ?? 0)} more`}
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Redemptions History */}
            <Card className="rounded-2xl border border-slate-100 overflow-hidden shadow-xs mt-6">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500" />
                  {canManage ? "All Employee Redemptions Queue" : "Your Redemption History"}
                </h3>
                <span className="text-xs text-slate-400">{myRedemptions?.total ?? 0} records</span>
              </div>

              {!myRedemptions || myRedemptions.items.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  No redemption requests found. Start redeeming perks when you earn enough points!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4">Date</th>
                        {canManage && <th className="py-3 px-4">Staff Member</th>}
                        <th className="py-3 px-4">Perk Claimed</th>
                        <th className="py-3 px-4">Points Spent</th>
                        <th className="py-3 px-4">Status</th>
                        {canManage && <th className="py-3 px-4 text-right">Review Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {myRedemptions.items.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 text-slate-500">{formatDateTime(r.created_at)}</td>
                          {canManage && (
                            <td className="py-3 px-4 font-bold text-slate-800">
                              {r.user_name} <span className="text-[10px] text-slate-400 font-normal">({r.user_email})</span>
                            </td>
                          )}
                          <td className="py-3 px-4">
                            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                              <span>{r.perk_icon}</span> {r.perk_title}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-amber-700">-{r.points_spent} 🪙</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                r.status === "fulfilled"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : r.status === "approved"
                                  ? "bg-blue-100 text-blue-800"
                                  : r.status === "rejected"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {r.status.toUpperCase()}
                            </span>
                          </td>
                          {canManage && (
                            <td className="py-3 px-4 text-right">
                              {r.status === "pending" || r.status === "approved" ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateRedemptionStatus(r.id, "fulfilled")}
                                    className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 cursor-pointer"
                                  >
                                    Fulfill
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateRedemptionStatus(r.id, "rejected")}
                                    className="px-2 py-1 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-[10px] font-bold cursor-pointer"
                                  >
                                    Reject & Refund
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: SUPER ADMIN AUDIT DASHBOARD (WITH EVERY FILTER)            */}
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
                    {flattenLocationsList.map((l) => (
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
                    <option value="perk_redemption">🎁 Perk Redemption</option>
                    <option value="reopen_clawback">↩️ Reopen Clawback</option>
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
                              {formatPoints(tx.points)} 🪙
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

        {/* Certificate Modal */}
        {certificateOpen && mySummary?.tier && (
          <CertificateModal
            userName={me.name}
            tier={mySummary.tier}
            onClose={() => setCertificateOpen(false)}
          />
        )}

        {/* Celebration Modal */}
        {celebration && (
          <CelebrationModal
            title={celebration.title}
            message={celebration.message}
            badge={celebration.badge}
            onClose={() => setCelebration(null)}
          />
        )}
      </div>
    </RequirePermission>
  );
}
