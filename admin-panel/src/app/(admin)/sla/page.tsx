"use client";

import React, { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { api, Department, EscalationRule, Priority, PriorityTone, SlaRule } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { useAction, useApiData } from "@/lib/hooks";
import { TONE_LABELS } from "@/lib/status";
import { RequirePermission } from "@/components/RequirePermission";
import {
  Card,
  ErrorBanner,
  Field,
  fieldClass,
  iconButtonClass,
  inputClass,
  Modal,
  Notice,
  PageHeader,
  primaryButtonClass,
  PriorityBadge,
  secondaryButtonClass,
  Spinner,
  StatusPill,
} from "@/components/ui";

const numberInput = `${fieldClass} w-24`;
const TONES = Object.keys(TONE_LABELS) as PriorityTone[];
const BREACH_LABEL = { response: "Missed first response", resolution: "Missed resolution" } as const;

function NumberCell({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
}) {
  return (
    <input
      type="number"
      min={min}
      aria-label={label}
      className={numberInput}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

// ---------------------------------------------------------------------------
// Priorities
// ---------------------------------------------------------------------------

function PriorityDialog({ priority, onClose, onSaved }: { priority: Priority | null; onClose: () => void; onSaved: () => void }) {
  const { limits } = useConfig();
  const [name, setName] = useState(priority?.name ?? "");
  const [key, setKey] = useState(priority?.key ?? "");
  const [tone, setTone] = useState<PriorityTone | "">(priority?.tone ?? "");
  const [targets, setTargets] = useState({ response: 0, resolution: 0, warning: 0 });
  const { busy, error, run } = useAction();

  return (
    <Modal
      title={priority ? `Edit ${priority.name}` : "Add a priority"}
      description={priority ? undefined : "New priorities go to the end of the list (least urgent); move them afterwards."}
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!tone) return;
          run(async () => {
            if (priority) {
              await api.priorities.update(priority.id, { name, tone });
            } else {
              await api.priorities.create({
                key,
                name,
                tone,
                response_hours: targets.response,
                resolution_hours: targets.resolution,
                warning_minutes: targets.warning,
              });
            }
            onSaved();
          });
        }}
      >
        <ErrorBanner message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name">
            <input
              required
              maxLength={limits.priority_name}
              className={inputClass}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                // A suggestion for the key (lowercase letters, digits and _, starting with a letter).
                if (!priority)
                  setKey(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "_")
                      .replace(/^[^a-z]+/, "")
                      .slice(0, limits.priority_key)
                      .replace(/_+$/, ""),
                  );
              }}
            />
          </Field>
          <Field label="Key" hint="A stable identifier; it can't change later">
            <input
              required
              disabled={Boolean(priority)}
              maxLength={limits.priority_key}
              className={inputClass}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>
          <Field label="Colour">
            <select required className={inputClass} value={tone} onChange={(e) => setTone(e.target.value as PriorityTone)}>
              <option value="" disabled>
                Choose…
              </option>
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {TONE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          {tone && (
            <div className="flex items-end pb-2">
              <PriorityBadge priority={{ name: name || "Preview", tone }} />
            </div>
          )}
        </div>
        {!priority && (
          <fieldset>
            <legend className="text-xs font-medium text-slate-600 mb-1">Default targets (all departments)</legend>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Respond within (h)">
                <input
                  required
                  type="number"
                  min={1}
                  className={inputClass}
                  value={targets.response || ""}
                  onChange={(e) => setTargets({ ...targets, response: Number(e.target.value) })}
                />
              </Field>
              <Field label="Resolve within (h)">
                <input
                  required
                  type="number"
                  min={1}
                  className={inputClass}
                  value={targets.resolution || ""}
                  onChange={(e) => setTargets({ ...targets, resolution: Number(e.target.value) })}
                />
              </Field>
              <Field label="Warn before (min)">
                <input
                  required
                  type="number"
                  min={0}
                  className={inputClass}
                  value={targets.warning}
                  onChange={(e) => setTargets({ ...targets, warning: Number(e.target.value) })}
                />
              </Field>
            </div>
          </fieldset>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PrioritiesCard({ priorities, onChanged }: { priorities: Priority[]; onChanged: () => void }) {
  const [dialog, setDialog] = useState<{ priority: Priority | null } | null>(null);
  const { busy, error, run } = useAction();

  const move = (index: number, delta: number) => {
    const ids = priorities.map((p) => p.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    run(async () => {
      await api.priorities.order(ids);
      onChanged();
    });
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Priorities</h2>
          <p className="text-xs text-slate-500 mt-1">
            Most urgent first. Each category has a default priority (Departments); staff can change a complaint&apos;s priority
            with a reason.
          </p>
        </div>
        <button className={secondaryButtonClass} onClick={() => setDialog({ priority: null })}>
          <Plus className="w-3.5 h-3.5" /> Add priority
        </button>
      </div>
      <ErrorBanner message={error} />
      <ul className="divide-y divide-slate-50 border border-slate-100 rounded-xl">
        {priorities.map((p, i) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
            <span className="w-6 text-slate-400 font-mono">{i + 1}</span>
            <PriorityBadge priority={p} />
            <span className="font-mono text-[10px] text-slate-400">{p.key}</span>
            <StatusPill active={p.is_active} />
            <span className="ml-auto flex items-center gap-0.5">
              <button
                className={iconButtonClass}
                disabled={busy || i === 0}
                aria-label={`Move ${p.name} up`}
                onClick={() => move(i, -1)}
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                className={iconButtonClass}
                disabled={busy || i === priorities.length - 1}
                aria-label={`Move ${p.name} down`}
                onClick={() => move(i, 1)}
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button className={iconButtonClass} aria-label={`Edit ${p.name}`} onClick={() => setDialog({ priority: p })}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                className="ml-1 w-16 text-right text-[11px] font-semibold text-slate-500 hover:text-blue-600 cursor-pointer"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api.priorities.update(p.id, { is_active: !p.is_active });
                    onChanged();
                  })
                }
              >
                {p.is_active ? "Retire" : "Restore"}
              </button>
            </span>
          </li>
        ))}
        {priorities.length === 0 && (
          <li className="px-3 py-4 text-xs text-slate-400">No priorities yet. Add at least one before creating departments.</li>
        )}
      </ul>
      {dialog && (
        <PriorityDialog
          priority={dialog.priority}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SLA targets
// ---------------------------------------------------------------------------

function SlaRuleRow({ rule, onSaved, onDelete }: { rule: SlaRule; onSaved: () => void; onDelete?: () => void }) {
  const [response, setResponse] = useState(rule.response_hours);
  const [resolution, setResolution] = useState(rule.resolution_hours);
  const [warning, setWarning] = useState(rule.warning_minutes);
  const { busy, error, run } = useAction();
  const dirty = response !== rule.response_hours || resolution !== rule.resolution_hours || warning !== rule.warning_minutes;

  return (
    <tr className="align-top">
      {rule.department && <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{rule.department.name}</td>}
      <td className="px-3 py-2">
        <PriorityBadge priority={rule.priority} />
      </td>
      <td className="px-3 py-2">
        <NumberCell label="Respond within (hours)" value={response} onChange={setResponse} min={1} />
      </td>
      <td className="px-3 py-2">
        <NumberCell label="Resolve within (hours)" value={resolution} onChange={setResolution} min={1} />
      </td>
      <td className="px-3 py-2">
        <NumberCell label="Warn before (minutes)" value={warning} onChange={setWarning} min={0} />
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <button
            className={primaryButtonClass}
            disabled={!dirty || busy}
            onClick={() =>
              run(async () => {
                await api.sla.saveRule({
                  priority_id: rule.priority.id,
                  department_id: rule.department?.id ?? null,
                  response_hours: response,
                  resolution_hours: resolution,
                  warning_minutes: warning,
                });
                onSaved();
              })
            }
          >
            Save
          </button>
          {onDelete && (
            <button
              className={`${iconButtonClass} hover:text-rose-600 hover:bg-rose-50`}
              aria-label="Remove this override"
              title="Remove override"
              onClick={onDelete}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
        {error && <p className="text-[11px] text-rose-600 mt-1 max-w-xs">{error}</p>}
      </td>
    </tr>
  );
}

/** A number typed into a form; empty until someone enters it (there is no built-in target). */
const toNumber = (value: string) => (value.trim() === "" ? null : Number(value));

/** Default targets for a priority that has none yet (e.g. one carried over from older data). */
function NewSlaDefaultRow({ priority, onSaved }: { priority: Priority; onSaved: () => void }) {
  const [response, setResponse] = useState("");
  const [resolution, setResolution] = useState("");
  const [warning, setWarning] = useState("");
  const { busy, error, run } = useAction();
  const values = { response: toNumber(response), resolution: toNumber(resolution), warning: toNumber(warning) };
  const complete = values.response !== null && values.resolution !== null && values.warning !== null;

  return (
    <tr className="align-top bg-amber-50/40">
      <td className="px-3 py-2">
        <PriorityBadge priority={priority} />
        <div className="text-[10px] text-amber-700 mt-1">No targets yet</div>
      </td>
      {(
        [
          ["Respond within (hours)", response, setResponse, 1],
          ["Resolve within (hours)", resolution, setResolution, 1],
          ["Warn before (minutes)", warning, setWarning, 0],
        ] as const
      ).map(([label, value, set, min]) => (
        <td key={label} className="px-3 py-2">
          <input
            type="number"
            min={min}
            aria-label={label}
            className={numberInput}
            value={value}
            onChange={(e) => set(e.target.value)}
          />
        </td>
      ))}
      <td className="px-3 py-2">
        <button
          className={primaryButtonClass}
          disabled={!complete || busy}
          onClick={() =>
            run(async () => {
              await api.sla.saveRule({
                priority_id: priority.id,
                department_id: null,
                response_hours: values.response!,
                resolution_hours: values.resolution!,
                warning_minutes: values.warning!,
              });
              onSaved();
            })
          }
        >
          Save
        </button>
        {error && <p className="text-[11px] text-rose-600 mt-1 max-w-xs">{error}</p>}
      </td>
    </tr>
  );
}

function AddSlaOverride({
  departments,
  priorities,
  defaults,
  onSaved,
}: {
  departments: Department[];
  priorities: Priority[];
  defaults: SlaRule[];
  onSaved: () => void;
}) {
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [priorityId, setPriorityId] = useState<number | null>(null);
  const [targets, setTargets] = useState<{ response: number; resolution: number; warning: number } | null>(null);
  const { busy, error, run } = useAction();

  const choosePriority = (id: number | null) => {
    setPriorityId(id);
    // start from the default targets of that priority
    const base = defaults.find((r) => r.priority.id === id);
    setTargets(base ? { response: base.response_hours, resolution: base.resolution_hours, warning: base.warning_minutes } : null);
  };

  return (
    <form
      className="flex flex-wrap items-end gap-2 pt-3 border-t border-slate-100"
      onSubmit={(e) => {
        e.preventDefault();
        if (departmentId === null || priorityId === null || !targets) return;
        run(async () => {
          await api.sla.saveRule({
            priority_id: priorityId,
            department_id: departmentId,
            response_hours: targets.response,
            resolution_hours: targets.resolution,
            warning_minutes: targets.warning,
          });
          setDepartmentId(null);
          choosePriority(null);
          onSaved();
        });
      }}
    >
      <select
        required
        aria-label="Department"
        className={`${fieldClass} w-44`}
        value={departmentId ?? ""}
        onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">Department…</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select
        required
        aria-label="Priority"
        className={`${fieldClass} w-36`}
        value={priorityId ?? ""}
        onChange={(e) => choosePriority(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">Priority…</option>
        {priorities
          .filter((p) => p.is_active)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </select>
      {targets && (
        <>
          <NumberCell
            label="Respond within (hours)"
            value={targets.response}
            onChange={(n) => setTargets({ ...targets, response: n })}
            min={1}
          />
          <NumberCell
            label="Resolve within (hours)"
            value={targets.resolution}
            onChange={(n) => setTargets({ ...targets, resolution: n })}
            min={1}
          />
          <NumberCell
            label="Warn before (minutes)"
            value={targets.warning}
            onChange={(n) => setTargets({ ...targets, warning: n })}
            min={0}
          />
        </>
      )}
      <button type="submit" className={secondaryButtonClass} disabled={busy || !targets || departmentId === null}>
        <Plus className="w-3.5 h-3.5" /> Add override
      </button>
      {error && <p className="w-full text-[11px] text-rose-600">{error}</p>}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

function EscalationRuleRow({ rule, onSaved, onDelete }: { rule: EscalationRule; onSaved: () => void; onDelete?: () => void }) {
  const [levelHours, setLevelHours] = useState(rule.level_hours);
  const [maxLevel, setMaxLevel] = useState(rule.max_level);
  const [active, setActive] = useState(rule.is_active);
  const { busy, error, run } = useAction();
  const dirty = levelHours !== rule.level_hours || maxLevel !== rule.max_level || active !== rule.is_active;

  return (
    <tr className="align-top">
      <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">
        {BREACH_LABEL[rule.breach_type]}
        {rule.department && <span className="text-slate-400 font-normal"> · {rule.department.name}</span>}
      </td>
      <td className="px-3 py-2">
        <NumberCell label="Hours per level" value={levelHours} onChange={setLevelHours} min={1} />
      </td>
      <td className="px-3 py-2">
        <NumberCell label="Highest level" value={maxLevel} onChange={setMaxLevel} min={1} />
      </td>
      <td className="px-3 py-2">
        <label
          className={`flex items-center gap-1.5 text-xs h-9 ${rule.department ? "text-slate-700" : "text-slate-400"}`}
          title={rule.department ? undefined : "The default rule can't be switched off"}
        >
          <input type="checkbox" checked={active} disabled={!rule.department} onChange={(e) => setActive(e.target.checked)} />{" "}
          Escalate
        </label>
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <button
            className={primaryButtonClass}
            disabled={!dirty || busy}
            onClick={() =>
              run(async () => {
                await api.sla.saveEscalationRule({
                  breach_type: rule.breach_type,
                  department_id: rule.department?.id ?? null,
                  level_hours: levelHours,
                  max_level: maxLevel,
                  is_active: active,
                });
                onSaved();
              })
            }
          >
            Save
          </button>
          {onDelete && (
            <button
              className={`${iconButtonClass} hover:text-rose-600 hover:bg-rose-50`}
              aria-label="Remove this override"
              title="Remove override"
              onClick={onDelete}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
        {error && <p className="text-[11px] text-rose-600 mt-1 max-w-xs">{error}</p>}
      </td>
    </tr>
  );
}

/** The default escalation for a kind of missed target, when none is set up yet (e.g. a new installation). */
function NewEscalationDefaultRow({ breachType, onSaved }: { breachType: "response" | "resolution"; onSaved: () => void }) {
  const [levelHours, setLevelHours] = useState("");
  const [maxLevel, setMaxLevel] = useState("");
  const { busy, error, run } = useAction();
  const hours = toNumber(levelHours);
  const levels = toNumber(maxLevel);

  return (
    <tr className="align-top bg-amber-50/40">
      <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">
        {BREACH_LABEL[breachType]}
        <div className="text-[10px] font-normal text-amber-700 mt-1">Not set up yet: missed targets don&apos;t escalate</div>
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min={1}
          aria-label="Hours per level"
          className={numberInput}
          value={levelHours}
          onChange={(e) => setLevelHours(e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min={1}
          aria-label="Highest level"
          className={numberInput}
          value={maxLevel}
          onChange={(e) => setMaxLevel(e.target.value)}
        />
      </td>
      <td className="px-3 py-2" />
      <td className="px-3 py-2">
        <button
          className={primaryButtonClass}
          disabled={hours === null || levels === null || busy}
          onClick={() =>
            run(async () => {
              await api.sla.saveEscalationRule({
                breach_type: breachType,
                department_id: null,
                level_hours: hours!,
                max_level: levels!,
                is_active: true,
              });
              onSaved();
            })
          }
        >
          Save
        </button>
        {error && <p className="text-[11px] text-rose-600 mt-1 max-w-xs">{error}</p>}
      </td>
    </tr>
  );
}

function AddEscalationOverride({
  departments,
  defaults,
  onSaved,
}: {
  departments: Department[];
  defaults: EscalationRule[];
  onSaved: () => void;
}) {
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [breachType, setBreachType] = useState<"response" | "resolution" | "">("");
  const { busy, error, run } = useAction();
  const base = defaults.find((r) => r.breach_type === breachType);

  return (
    <form
      className="flex flex-wrap items-end gap-2 pt-3 border-t border-slate-100"
      onSubmit={(e) => {
        e.preventDefault();
        if (departmentId === null || !base || !breachType) return;
        run(async () => {
          // starts as a copy of the default; adjust it in the table
          await api.sla.saveEscalationRule({
            breach_type: breachType,
            department_id: departmentId,
            level_hours: base.level_hours,
            max_level: base.max_level,
            is_active: base.is_active,
          });
          setDepartmentId(null);
          setBreachType("");
          onSaved();
        });
      }}
    >
      <select
        required
        aria-label="Department"
        className={`${fieldClass} w-44`}
        value={departmentId ?? ""}
        onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">Department…</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select
        required
        aria-label="When"
        className={`${fieldClass} w-48`}
        value={breachType}
        onChange={(e) => setBreachType(e.target.value as "response" | "resolution" | "")}
      >
        <option value="">When…</option>
        <option value="response">{BREACH_LABEL.response}</option>
        <option value="resolution">{BREACH_LABEL.resolution}</option>
      </select>
      <button type="submit" className={secondaryButtonClass} disabled={busy || !base || departmentId === null}>
        <Plus className="w-3.5 h-3.5" /> Add override
      </button>
      {error && <p className="w-full text-[11px] text-rose-600">{error}</p>}
    </form>
  );
}

function SlaSettings() {
  useDocumentTitle("Priorities & SLA");
  const { data, error, reload } = useApiData(async () => {
    const [config, departments] = await Promise.all([api.sla.config(), api.departments.list()]);
    return { ...config, departments: departments.filter((d) => d.is_active) };
  }, []);
  const [runResult, setRunResult] = useState<string | null>(null);
  const action = useAction();

  if (!data) return error ? <ErrorBanner message={error} /> : <Spinner />;
  const byRank = (a: SlaRule, b: SlaRule) => a.priority.rank - b.priority.rank;
  const defaults = data.sla_rules.filter((r) => !r.department).sort(byRank);
  // Active priorities without default targets (every priority made here gets them; older data may not).
  const missingDefaults = data.priorities.filter((p) => p.is_active && !defaults.some((r) => r.priority.id === p.id));
  const missingEscalation = (["response", "resolution"] as const).filter(
    (type) => !data.escalation_rules.some((r) => !r.department && r.breach_type === type),
  );
  const overrides = data.sla_rules
    .filter((r) => r.department)
    .sort((a, b) => a.department!.name.localeCompare(b.department!.name) || byRank(a, b));
  const escalationDefaults = data.escalation_rules.filter((r) => !r.department);
  const escalationOverrides = data.escalation_rules.filter((r) => r.department);
  // remount rows after a save so their inputs show the stored values
  const rowKey = (r: SlaRule | EscalationRule) => JSON.stringify(r);
  const remove = (call: () => Promise<unknown>) =>
    action.run(async () => {
      await call();
      reload();
    });

  return (
    <>
      <PageHeader
        title="Priorities & SLA"
        description="Targets apply to complaints submitted, assigned or reopened after a change; clocks already running keep their due times."
        actions={
          <button
            className={secondaryButtonClass}
            disabled={action.busy}
            onClick={() =>
              action.run(async () => {
                const summary = await api.sla.runNow();
                const parts = Object.entries(summary)
                  .filter(([k, v]) => k !== "checked" && v)
                  .map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`);
                setRunResult(
                  `Checked ${summary.checked} complaints${parts.length ? `: ${parts.join(", ")}` : "; nothing was due"}.`,
                );
              })
            }
          >
            <Play className="w-3.5 h-3.5" /> Run the SLA check now
          </button>
        }
      />
      <ErrorBanner message={error ?? action.error} />
      <Notice message={runResult} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <PrioritiesCard priorities={data.priorities} onChanged={reload} />

        <Card className="p-5 relative overflow-x-auto">
          <h2 className="text-sm font-bold text-slate-800">Default targets</h2>
          <p className="text-xs text-slate-500 mt-1 mb-3">
            Respond: hours for the assigned person to act. Resolve: hours from submission (paused while waiting for the end user).
            Warn: how long before a target the &ldquo;due soon&rdquo; alert goes out.
          </p>
          <table className="text-left text-xs w-full">
            <thead className="text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Respond (h)</th>
                <th className="px-3 py-2">Resolve (h)</th>
                <th className="px-3 py-2">Warn (min)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {defaults.map((r) => (
                <SlaRuleRow key={rowKey(r)} rule={r} onSaved={reload} />
              ))}
              {missingDefaults.map((p) => (
                <NewSlaDefaultRow key={`new-${p.id}`} priority={p} onSaved={reload} />
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="p-5 relative overflow-x-auto">
        <h2 className="text-sm font-bold text-slate-800">Department overrides</h2>
        <p className="text-xs text-slate-500 mt-1 mb-3">
          An override replaces the default targets of one priority in one department.
        </p>
        {overrides.length > 0 && (
          <table className="text-left text-xs mb-2">
            <thead className="text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Respond (h)</th>
                <th className="px-3 py-2">Resolve (h)</th>
                <th className="px-3 py-2">Warn (min)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {overrides.map((r) => (
                <SlaRuleRow key={rowKey(r)} rule={r} onSaved={reload} onDelete={() => remove(() => api.sla.deleteRule(r.id))} />
              ))}
            </tbody>
          </table>
        )}
        <AddSlaOverride departments={data.departments} priorities={data.priorities} defaults={defaults} onSaved={reload} />
      </Card>

      <Card className="p-5 relative overflow-x-auto">
        <h2 className="text-sm font-bold text-slate-800">Escalation</h2>
        <p className="text-xs text-slate-500 mt-1 mb-3">
          A missed target escalates to the handler&apos;s reporting manager, then further up the reporting line. Each level gets
          the hours below to act before it climbs again, up to the highest level.
        </p>
        <table className="text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Hours per level</th>
              <th className="px-3 py-2">Highest level</th>
              <th className="px-3 py-2" />
              <th />
            </tr>
          </thead>
          <tbody>
            {escalationDefaults.map((r) => (
              <EscalationRuleRow key={rowKey(r)} rule={r} onSaved={reload} />
            ))}
            {missingEscalation.map((type) => (
              <NewEscalationDefaultRow key={`new-${type}`} breachType={type} onSaved={reload} />
            ))}
            {escalationOverrides.map((r) => (
              <EscalationRuleRow
                key={rowKey(r)}
                rule={r}
                onSaved={reload}
                onDelete={() => remove(() => api.sla.deleteEscalationRule(r.id))}
              />
            ))}
          </tbody>
        </table>
        <AddEscalationOverride departments={data.departments} defaults={escalationDefaults} onSaved={reload} />
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
