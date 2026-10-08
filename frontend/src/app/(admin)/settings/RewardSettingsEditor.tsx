"use client";

import React, { useState } from "react";
import { Award, Sparkles } from "lucide-react";
import { api, RewardSettings, RoleDetail } from "@/lib/api";
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
