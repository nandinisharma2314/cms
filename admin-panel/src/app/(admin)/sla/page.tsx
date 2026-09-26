"use client";

import React, { useState } from "react";
import { Play, Plus, Trash2 } from "lucide-react";
import { api, Department, EscalationRule, SlaRule } from "@/lib/api";
import { useApiData } from "@/lib/hooks";
import { RequirePermission } from "@/components/RequirePermission";
import {
  Card, ErrorBanner, inputClass, PageHeader, primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";

const numberInput = `${inputClass} w-24`;

function SlaRuleRow({
  rule,
  onSaved,
  onDelete,
}: {
  rule: SlaRule;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const [response, setResponse] = useState(rule.response_hours);
  const [resolution, setResolution] = useState(rule.resolution_hours);
  const [warning, setWarning] = useState(rule.warning_minutes);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    response !== rule.response_hours || resolution !== rule.resolution_hours || warning !== rule.warning_minutes;

  const save = async () => {
    setError(null);
    try {
      await api.sla.saveRule({
        priority: rule.priority,
        department_id: rule.department?.id ?? null,
        response_hours: response,
        resolution_hours: resolution,
        warning_minutes: warning,
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <tr className="align-top">
      {rule.department && <td className="px-3 py-2 font-semibold text-slate-700">{rule.department.name}</td>}
      <td className="px-3 py-2 font-semibold text-slate-800">{rule.priority}</td>
      <td className="px-3 py-2">
        <input type="number" min={1} className={numberInput} value={response} onChange={(e) => setResponse(Number(e.target.value))} />
      </td>
      <td className="px-3 py-2">
        <input type="number" min={1} className={numberInput} value={resolution} onChange={(e) => setResolution(Number(e.target.value))} />
      </td>
      <td className="px-3 py-2">
        <input type="number" min={0} className={numberInput} value={warning} onChange={(e) => setWarning(Number(e.target.value))} />
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <button className={primaryButtonClass} disabled={!dirty} onClick={save}>
            Save
          </button>
          {onDelete && (
            <button className="p-2 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer" title="Remove override" onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
        {error && <p className="text-[11px] text-rose-600 mt-1 max-w-xs">{error}</p>}
      </td>
    </tr>
  );
}

function EscalationRuleRow({ rule, onSaved }: { rule: EscalationRule; onSaved: () => void }) {
  const [levelHours, setLevelHours] = useState(rule.level_hours);
  const [maxLevel, setMaxLevel] = useState(rule.max_level);
  const [active, setActive] = useState(rule.is_active);
  const [error, setError] = useState<string | null>(null);
  const dirty = levelHours !== rule.level_hours || maxLevel !== rule.max_level || active !== rule.is_active;

  const save = async () => {
    setError(null);
    try {
      await api.sla.saveEscalationRule({
        breach_type: rule.breach_type,
        department_id: rule.department?.id ?? null,
        level_hours: levelHours,
        max_level: maxLevel,
        is_active: active,
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <tr className="align-top">
      <td className="px-3 py-2 font-semibold text-slate-800">
        {rule.breach_type === "response" ? "Response missed" : "Resolution missed"}
        {rule.department && <span className="text-slate-400 font-normal"> · {rule.department.name}</span>}
      </td>
      <td className="px-3 py-2">
        <input type="number" min={1} className={numberInput} value={levelHours} onChange={(e) => setLevelHours(Number(e.target.value))} />
      </td>
      <td className="px-3 py-2">
        <input type="number" min={1} max={10} className={numberInput} value={maxLevel} onChange={(e) => setMaxLevel(Number(e.target.value))} />
      </td>
      <td className="px-3 py-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-700 h-9">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Enabled
        </label>
      </td>
      <td className="px-3 py-2">
        <button className={primaryButtonClass} disabled={!dirty} onClick={save}>
          Save
        </button>
        {error && <p className="text-[11px] text-rose-600 mt-1">{error}</p>}
      </td>
    </tr>
  );
}

function AddOverride({ departments, priorities, onSaved }: { departments: Department[]; priorities: string[]; onSaved: () => void }) {
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [priority, setPriority] = useState(priorities[0] ?? "Medium");
  const [response, setResponse] = useState(24);
  const [resolution, setResolution] = useState(72);
  const [warning, setWarning] = useState(120);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-end gap-2 pt-3 border-t border-slate-100"
      onSubmit={async (e) => {
        e.preventDefault();
        if (departmentId === null) return;
        setError(null);
        try {
          await api.sla.saveRule({
            priority, department_id: departmentId, response_hours: response, resolution_hours: resolution,
            warning_minutes: warning,
          });
          onSaved();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <select required className={`${inputClass} w-44`} value={departmentId ?? ""} onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Department...</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select className={`${inputClass} w-32`} value={priority} onChange={(e) => setPriority(e.target.value)}>
        {priorities.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      <input type="number" min={1} title="Response hours" className={numberInput} value={response} onChange={(e) => setResponse(Number(e.target.value))} />
      <input type="number" min={1} title="Resolution hours" className={numberInput} value={resolution} onChange={(e) => setResolution(Number(e.target.value))} />
      <input type="number" min={0} title="Warning minutes" className={numberInput} value={warning} onChange={(e) => setWarning(Number(e.target.value))} />
      <button type="submit" className={secondaryButtonClass}>
        <Plus className="w-3.5 h-3.5" /> Add override
      </button>
      {error && <p className="w-full text-[11px] text-rose-600">{error}</p>}
    </form>
  );
}

function SlaSettings() {
  const { data, error, reload } = useApiData(async () => {
    const [config, departments] = await Promise.all([api.sla.config(), api.departments.list()]);
    return { ...config, departments };
  }, []);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!data) return <ErrorBanner message={error} />;
  const defaults = data.sla_rules.filter((r) => !r.department);
  const overrides = data.sla_rules.filter((r) => r.department);
  // remount rows after a save so their inputs show the stored values
  const rowKey = (r: SlaRule | EscalationRule) => JSON.stringify(r);

  return (
    <>
      <PageHeader
        title="SLA & Escalation"
        description="Targets apply to complaints submitted, assigned or reopened after a change; running clocks keep their due times."
        actions={
          <button
            className={secondaryButtonClass}
            onClick={async () => {
              setActionError(null);
              try {
                const summary = await api.sla.runNow();
                const parts = Object.entries(summary).filter(([k]) => k !== "checked").map(([k, v]) => `${v} ${k.replace("_", " ")}`);
                setRunResult(`Checked ${summary.checked} complaints${parts.length ? `: ${parts.join(", ")}` : "; nothing due"}.`);
              } catch (err) {
                setActionError((err as Error).message);
              }
            }}
          >
            <Play className="w-3.5 h-3.5" /> Run SLA check now
          </button>
        }
      />
      <ErrorBanner message={error ?? actionError} />
      {runResult && <p className="text-xs text-emerald-700">{runResult}</p>}

      <Card className="p-5">
        <h3 className="text-sm font-bold text-slate-800">Targets by priority</h3>
        <p className="text-xs text-slate-500 mt-1 mb-3">
          Response: hours for the assigned officer to acknowledge. Resolution: hours from submission (paused while
          waiting for the end user). Warning: how long before a target the &ldquo;due soon&rdquo; alert fires.
        </p>
        <table className="text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Response (h)</th>
              <th className="px-3 py-2">Resolution (h)</th>
              <th className="px-3 py-2">Warning (min)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {defaults.map((r) => (
              <SlaRuleRow key={rowKey(r)} rule={r} onSaved={reload} />
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-bold text-slate-800">Department overrides</h3>
        <p className="text-xs text-slate-500 mt-1 mb-3">A department row replaces the default for that priority.</p>
        {overrides.length > 0 && (
          <table className="text-left text-xs mb-2">
            <thead className="text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Response (h)</th>
                <th className="px-3 py-2">Resolution (h)</th>
                <th className="px-3 py-2">Warning (min)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {overrides.map((r) => (
                <SlaRuleRow
                  key={rowKey(r)}
                  rule={r}
                  onSaved={reload}
                  onDelete={async () => {
                    await api.sla.deleteRule(r.id).catch((err: Error) => setActionError(err.message));
                    reload();
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
        <AddOverride departments={data.departments} priorities={data.priorities} onSaved={reload} />
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-bold text-slate-800">Escalation</h3>
        <p className="text-xs text-slate-500 mt-1 mb-3">
          A missed target escalates to the officer&apos;s reporting manager (Agent → Supervisor → Manager → Admin →
          Super Admin). Each level gets the hours below to act before it climbs again, up to the maximum level.
        </p>
        <table className="text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Hours per level</th>
              <th className="px-3 py-2">Max level</th>
              <th className="px-3 py-2" />
              <th />
            </tr>
          </thead>
          <tbody>
            {data.escalation_rules.map((r) => (
              <EscalationRuleRow key={rowKey(r)} rule={r} onSaved={reload} />
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

export default function SlaPage() {
  return (
    <RequirePermission anyOf={["sla.manage"]}>
      <SlaSettings />
    </RequirePermission>
  );
}
