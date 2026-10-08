"use client";

import React, { useState } from "react";
import { Award, Plus, Shield, Sparkles, Target, Trash2, Trophy } from "lucide-react";
import {
  api,
  BadgeTier,
  ChampionshipConfig,
  QuestConfig,
  QuestMetric,
  RewardSettings,
  RoleDetail,
} from "@/lib/api";
import { useAction, useApiData } from "@/lib/hooks";
import {
  Card,
  ErrorBanner,
  Field,
  inputClass,
  Notice,
  primaryButtonClass,
  Spinner,
} from "@/components/ui";

const DEFAULT_PRIORITIES = [
  { key: "critical", label: "Critical" },
  { key: "danger", label: "Danger / High" },
  { key: "warning", label: "Warning / Medium" },
  { key: "info", label: "Info / Low" },
  { key: "neutral", label: "Neutral / Standard" },
];

const DEFAULT_TIERS: BadgeTier[] = [
  { name: "Bronze Resolver", badge: "🥉", min_points: 0, max_points: 499 },
  { name: "Silver Specialist", badge: "🥈", min_points: 500, max_points: 1999 },
  { name: "Gold Champion", badge: "🥇", min_points: 2000, max_points: 4999 },
  { name: "Platinum Legend", badge: "💎", min_points: 5000, max_points: null },
];

const DEFAULT_QUESTS: QuestConfig[] = [
  {
    id: "speed_demon",
    title: "Speed Demon",
    description: "Resolve 5 complaints under 2 hours this month",
    icon: "⚡",
    metric: "speed_bonus",
    target: 5,
    reward_points: 250,
    is_active: true,
  },
  {
    id: "five_star_hero",
    title: "Citizen Hero",
    description: "Earn 10 five-star ratings from citizens",
    icon: "⭐",
    metric: "five_star",
    target: 10,
    reward_points: 500,
    is_active: true,
  },
  {
    id: "perfect_streak",
    title: "Perfectionist",
    description: "Resolve 15 complaints with zero re-openings",
    icon: "🛡️",
    metric: "zero_reopen",
    target: 15,
    reward_points: 400,
    is_active: true,
  },
];

const DEFAULT_CHAMPIONSHIP: ChampionshipConfig = {
  title: "Inter-Department Championship Cup",
  description: "Department-wide aggregated rewards, SLA compliance speed, and top citizen redressal contributors.",
  trophies: ["🏆", "🥈", "🥉", "🏅", "🎖️"],
  points_weight: 1.0,
  sla_weight: 1.0,
  season: "Current Season",
  is_enabled: true,
};

function RewardSettingsForm({
  initial,
  roles,
  onSaved,
}: {
  initial: RewardSettings;
  roles: RoleDetail[] | undefined;
  onSaved?: () => void;
}) {
  const [form, setForm] = useState<RewardSettings>(initial);
  const [success, setSuccess] = useState<string | null>(null);
  const action = useAction();

  const toggleRole = (roleKey: string) => {
    const current = form.eligible_roles || [];
    if (current.includes(roleKey)) {
      setForm({ ...form, eligible_roles: current.filter((r) => r !== roleKey) });
    } else {
      setForm({ ...form, eligible_roles: [...current, roleKey] });
    }
  };

  const setMultiplier = (priorityKey: string, val: number) => {
    setForm({
      ...form,
      priority_multipliers: {
        ...form.priority_multipliers,
        [priorityKey]: val,
      },
    });
  };

  const currentTiers = form.tier_config && form.tier_config.length > 0 ? form.tier_config : DEFAULT_TIERS;

  const updateTier = (idx: number, patch: Partial<BadgeTier>) => {
    const updated = currentTiers.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    setForm({ ...form, tier_config: updated });
  };

  const addTier = () => {
    const lastTier = currentTiers[currentTiers.length - 1];
    const minPoints = lastTier && lastTier.max_points !== null ? lastTier.max_points + 1 : 10000;
    const newTier: BadgeTier = {
      name: `Tier ${currentTiers.length + 1}`,
      badge: "⭐",
      min_points: minPoints,
      max_points: null,
    };
    setForm({ ...form, tier_config: [...currentTiers, newTier] });
  };

  const removeTier = (idx: number) => {
    if (currentTiers.length <= 1) return;
    const updated = currentTiers.filter((_, i) => i !== idx);
    setForm({ ...form, tier_config: updated });
  };

  const currentQuests = form.quest_config && form.quest_config.length > 0 ? form.quest_config : DEFAULT_QUESTS;

  const updateQuestItem = (idx: number, patch: Partial<QuestConfig>) => {
    const updated = currentQuests.map((q, i) => (i === idx ? { ...q, ...patch } : q));
    setForm({ ...form, quest_config: updated });
  };

  const addQuestItem = () => {
    const newQuest: QuestConfig = {
      id: `quest_${Date.now()}`,
      title: `Quest ${currentQuests.length + 1}`,
      description: "Monthly resolution challenge",
      icon: "🎯",
      metric: "total_resolved",
      target: 10,
      reward_points: 200,
      is_active: true,
    };
    setForm({ ...form, quest_config: [...currentQuests, newQuest] });
  };

  const removeQuestItem = (idx: number) => {
    if (currentQuests.length <= 1) return;
    const updated = currentQuests.filter((_, i) => i !== idx);
    setForm({ ...form, quest_config: updated });
  };

  const currentChampionship = form.championship_config || DEFAULT_CHAMPIONSHIP;

  const updateChampionship = (patch: Partial<ChampionshipConfig>) => {
    setForm({ ...form, championship_config: { ...currentChampionship, ...patch } });
  };

  const updateChampTrophy = (idx: number, val: string) => {
    const list = [...(currentChampionship.trophies || ["🏆", "🥈", "🥉", "🏅", "🎖️"])];
    list[idx] = val;
    updateChampionship({ trophies: list });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    action.run(async () => {
      const updated = await api.rewards.updateSettings(form);
      setForm(updated);
      setSuccess("Reward system configuration successfully updated!");
      onSaved?.();
    });
  };

  const staffRoles = roles?.filter((r) => r.audience === "staff") || [];

  return (
    <Card className="p-5 space-y-5 rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              Rewards & Recognition Rules
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Staff Gamification
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure who earns points, performance multipliers, SLA resolution bonuses, and customer rating rewards.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
            checked={form.is_enabled}
            onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
          />
          <span className="text-xs font-bold text-slate-700">
            {form.is_enabled ? "Rewards Active" : "Rewards Disabled"}
          </span>
        </label>
      </div>

      <Notice message={success} />
      <ErrorBanner message={action.error} />

      <form onSubmit={handleSave} className="space-y-6">
        {/* Currency & Identity */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Currency & Branding</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Currency Name" hint="e.g. Points, Coins, Credits">
              <input
                className={inputClass}
                value={form.currency_name}
                onChange={(e) => setForm({ ...form, currency_name: e.target.value })}
                required
              />
            </Field>
            <Field label="Currency Symbol / Icon" hint="Emoji or short text e.g. 🪙, ⭐">
              <input
                className={inputClass}
                value={form.currency_symbol}
                onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })}
                required
              />
            </Field>
          </div>
        </div>

        {/* Role Eligibility */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Eligible Staff Roles</h3>
            <span className="text-[11px] text-slate-500">Only staff with checked roles receive points for actions</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {staffRoles.map((r) => {
              const checked = (form.eligible_roles || []).includes(r.key);
              return (
                <label
                  key={r.id}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                    checked
                      ? "bg-amber-50/60 border-amber-300 text-amber-900 font-semibold"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 text-amber-600 rounded"
                    checked={checked}
                    onChange={() => toggleRole(r.key)}
                  />
                  <span className="truncate">{r.name}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Point Award Rules */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Point Award Amounts</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="On-Time Resolution Points" hint="Base points granted when resolved before SLA deadline">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.points_on_time_resolution}
                onChange={(e) => setForm({ ...form, points_on_time_resolution: Number(e.target.value) })}
              />
            </Field>

            <Field label="Speed Bonus Points" hint="Extra points if resolved in ≤ 50% of allotted SLA time">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.points_speed_bonus}
                onChange={(e) => setForm({ ...form, points_speed_bonus: Number(e.target.value) })}
              />
            </Field>

            <Field label="5-Star Citizen Rating Bonus" hint="Bonus awarded when citizen leaves a 5-star review">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.points_five_star}
                onChange={(e) => setForm({ ...form, points_five_star: Number(e.target.value) })}
              />
            </Field>

            <Field label="4-Star Citizen Rating Bonus" hint="Bonus awarded when citizen leaves a 4-star review">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.points_four_star}
                onChange={(e) => setForm({ ...form, points_four_star: Number(e.target.value) })}
              />
            </Field>

            <Field label="Zero-Reopen Closure Bonus" hint="Bonus when complaint is closed with zero reopen requests">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.points_zero_reopen}
                onChange={(e) => setForm({ ...form, points_zero_reopen: Number(e.target.value) })}
              />
            </Field>

            <Field label="Clean Streak Interval (Resolutions)" hint="Consecutive on-time resolutions needed for streak milestone">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.streak_interval}
                onChange={(e) => setForm({ ...form, streak_interval: Number(e.target.value) })}
              />
            </Field>

            <Field label="Clean Streak Milestone Bonus" hint="Special point prize when reaching clean streak interval">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.streak_bonus}
                onChange={(e) => setForm({ ...form, streak_bonus: Number(e.target.value) })}
              />
            </Field>
          </div>
        </div>

        {/* Priority Multipliers */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Priority Multipliers (Applied to On-Time Points)
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {DEFAULT_PRIORITIES.map((p) => {
              const currentMul = form.priority_multipliers?.[p.key] ?? 1.0;
              return (
                <Field key={p.key} label={`${p.label} Multiplier`} hint={`e.g. ${p.key === "critical" ? "2.0x" : "1.0x"}`}>
                  <input
                    type="number"
                    step="0.1"
                    min={0.5}
                    max={10}
                    className={inputClass}
                    value={currentMul}
                    onChange={(e) => setMultiplier(p.key, Number(e.target.value))}
                  />
                </Field>
              );
            })}
          </div>
        </div>

        {/* Badges & Progression Tiers */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Badges & Gamification Progression Tiers
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Customize badge titles, emojis, and point milestones awarded to staff as their lifetime earnings grow.
              </p>
            </div>
            <button
              type="button"
              onClick={addTier}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Tier</span>
            </button>
          </div>

          <div className="space-y-3">
            {currentTiers.map((tier, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center gap-3"
              >
                <div className="flex items-center gap-2 min-w-32">
                  <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="w-12">
                    <input
                      type="text"
                      className="w-12 h-9 text-center text-lg bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500"
                      value={tier.badge}
                      onChange={(e) => updateTier(idx, { badge: e.target.value })}
                      title="Badge emoji or icon"
                    />
                  </div>
                </div>

                <div className="flex-1 min-w-44">
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">Tier Label</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={tier.name}
                    onChange={(e) => updateTier(idx, { name: e.target.value })}
                    placeholder="e.g. Gold Champion"
                    required
                  />
                </div>

                <div className="w-32">
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">Min Points</label>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={tier.min_points}
                    onChange={(e) => updateTier(idx, { min_points: Number(e.target.value) })}
                    required
                  />
                </div>

                <div className="w-36">
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">Max Points</label>
                  <input
                    type="number"
                    min={tier.min_points}
                    className={inputClass}
                    value={tier.max_points ?? ""}
                    onChange={(e) =>
                      updateTier(idx, {
                        max_points: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    placeholder="Unlimited (Top)"
                  />
                </div>

                <div className="self-end md:self-center">
                  <button
                    type="button"
                    onClick={() => removeTier(idx)}
                    disabled={currentTiers.length <= 1}
                    className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition disabled:opacity-30 cursor-pointer"
                    title="Remove this tier"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Performance Quests & Missions */}
        <div className="pt-4 border-t border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Monthly Milestone Quests & Challenges
                </h3>
                <p className="text-[11px] text-slate-500">
                  Target metrics, threshold counts, and points rewards reset on the 1st of every month.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={addQuestItem}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Quest
            </button>
          </div>

          <div className="space-y-3">
            {currentQuests.map((quest, idx) => (
              <div
                key={quest.id}
                className="p-3.5 rounded-2xl border border-slate-200/80 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center"
              >
                <div className="lg:col-span-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Icon</label>
                  <input
                    type="text"
                    maxLength={4}
                    className={`${inputClass} text-center font-bold text-lg p-1`}
                    value={quest.icon}
                    onChange={(e) => updateQuestItem(idx, { icon: e.target.value })}
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Title</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={quest.title}
                    onChange={(e) => updateQuestItem(idx, { title: e.target.value })}
                    required
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Target Metric</label>
                  <select
                    className={inputClass}
                    value={quest.metric}
                    onChange={(e) => updateQuestItem(idx, { metric: e.target.value as QuestMetric })}
                  >
                    <option value="speed_bonus">Speed Bonus (&lt;2h resolution)</option>
                    <option value="five_star">5-Star Citizen Ratings</option>
                    <option value="four_star">High Ratings (4★ or 5★)</option>
                    <option value="on_time">On-Time Redressals</option>
                    <option value="zero_reopen">Zero-Reopen Cases</option>
                    <option value="total_resolved">Total Resolved Complaints</option>
                    <option value="total_points">Total Points Earned</option>
                  </select>
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Target Count</label>
                  <input
                    type="number"
                    min={1}
                    className={inputClass}
                    value={quest.target}
                    onChange={(e) => updateQuestItem(idx, { target: Math.max(1, Number(e.target.value) || 1) })}
                    required
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Reward (pts)</label>
                  <input
                    type="number"
                    min={0}
                    className={`${inputClass} font-bold text-amber-700`}
                    value={quest.reward_points}
                    onChange={(e) => updateQuestItem(idx, { reward_points: Math.max(0, Number(e.target.value) || 0) })}
                    required
                  />
                </div>

                <div className="lg:col-span-1 flex items-center justify-end gap-2 self-end lg:self-center">
                  <button
                    type="button"
                    onClick={() => updateQuestItem(idx, { is_active: !quest.is_active })}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                      quest.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {quest.is_active ? "Active" : "Paused"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeQuestItem(idx)}
                    disabled={currentQuests.length <= 1}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition disabled:opacity-30 cursor-pointer"
                    title="Remove quest"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Inter-Department Championship Cup */}
        <div className="pt-4 border-t border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <Trophy className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Inter-Department Championship Cup
                </h3>
                <p className="text-[11px] text-slate-500">
                  Configure cup title, seasonal label, trophies, and tournament active status.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-amber-50/60 border border-amber-200 cursor-pointer text-xs font-bold text-amber-900">
              <input
                type="checkbox"
                checked={currentChampionship.is_enabled}
                onChange={(e) => updateChampionship({ is_enabled: e.target.checked })}
                className="w-4 h-4 text-amber-600 rounded"
              />
              <span>{currentChampionship.is_enabled ? "Tournament Active" : "Tournament Inactive"}</span>
            </label>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/40 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="Championship Title" hint="Display tournament name">
                <input
                  className={inputClass}
                  value={currentChampionship.title}
                  onChange={(e) => updateChampionship({ title: e.target.value })}
                  required
                />
              </Field>

              <Field label="Season Label" hint="e.g. Q1 2026, Annual Cup 2026">
                <input
                  className={inputClass}
                  value={currentChampionship.season}
                  onChange={(e) => updateChampionship({ season: e.target.value })}
                />
              </Field>

              <Field label="Points Multiplier Weight" hint="Scoring points formula weighting">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  className={inputClass}
                  value={currentChampionship.points_weight}
                  onChange={(e) => updateChampionship({ points_weight: Number(e.target.value) || 1.0 })}
                />
              </Field>
            </div>

            <Field label="Tournament Description" hint="Summary banner note">
              <textarea
                rows={2}
                className={inputClass}
                value={currentChampionship.description}
                onChange={(e) => updateChampionship({ description: e.target.value })}
                required
              />
            </Field>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Trophy Badges (1st to 5th Place)
              </label>
              <div className="grid grid-cols-5 gap-2 max-w-sm">
                {[0, 1, 2, 3, 4].map((idx) => (
                  <div key={idx} className="text-center">
                    <span className="block text-[10px] text-slate-400 font-bold mb-0.5">#{idx + 1}</span>
                    <input
                      type="text"
                      maxLength={4}
                      className={`${inputClass} text-center text-lg font-bold p-1`}
                      value={currentChampionship.trophies?.[idx] || (idx === 0 ? "🏆" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "🏅")}
                      onChange={(e) => updateChampTrophy(idx, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button type="submit" className={primaryButtonClass} disabled={action.busy}>
            {action.busy ? "Saving…" : "Save Reward Rules"}
          </button>
        </div>
      </form>
    </Card>
  );
}

export function RewardSettingsEditor({ onSaved }: { onSaved?: () => void }) {
  const { data: settings, error: fetchError, reload } = useApiData(() => api.rewards.getSettings(), []);
  const { data: roles } = useApiData(() => api.roles.list(), []);

  if (fetchError) {
    return <ErrorBanner message={fetchError} />;
  }

  if (!settings) {
    return <Spinner />;
  }

  return (
    <RewardSettingsForm
      key={settings.updated_at ?? "initial"}
      initial={settings}
      roles={roles}
      onSaved={() => {
        reload();
        onSaved?.();
      }}
    />
  );
}
