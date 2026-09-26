"use client";

import React, { useState } from "react";
import { Download, Table2, LineChart } from "lucide-react";
import { api, Department, LocationType, ReportMetrics, ReportQuery } from "@/lib/api";
import { useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { RequirePermission } from "@/components/RequirePermission";
import { PerformanceTable, formatHours } from "@/components/reports/PerformanceTable";
import { StatTile } from "@/components/reports/StatTile";
import { TREND_COLORS, TrendLineChart } from "@/components/reports/TrendLineChart";
import { Card, ErrorBanner, inputClass, PageHeader, secondaryButtonClass } from "@/components/ui";

const PRESETS = [7, 30, 90];
const TREND_SERIES = [
  { key: "received", label: "Received", color: TREND_COLORS[0] },
  { key: "resolved", label: "Resolved", color: TREND_COLORS[1] },
  { key: "breached", label: "Missed SLA", color: TREND_COLORS[2] },
];
type Tab = "agents" | "departments" | "locations";

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

const count = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString());
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);
const signed = (n: number, unit = "") => `${n > 0 ? "+" : ""}${Number.isInteger(n) ? n : n.toFixed(1)}${unit}`;

function Tiles({ m, prev, periodLabel }: { m: ReportMetrics; prev: ReportMetrics; periodLabel: string }) {
  const tile = { periodLabel };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatTile {...tile} label="Complaints received" value={count(m.total)} current={m.total} previous={prev.total} />
        <StatTile {...tile} label="Pending" value={count(m.pending)} detail={`${m.unassigned} unassigned`} current={m.pending} previous={prev.pending} better="down" />
        <StatTile {...tile} label="Resolved or closed" value={count(m.resolved)} current={m.resolved} previous={prev.resolved} better="up" />
        <StatTile {...tile} label="Rejected" value={count(m.rejected)} detail={`${pct(m.rejection_pct)} of received`} current={m.rejected} previous={prev.rejected} />
        <StatTile {...tile} label="Escalated now" value={count(m.escalated_now)} current={m.escalated_now} previous={prev.escalated_now} better="down" />
        <StatTile {...tile} label="Missed an SLA" value={count(m.sla_breaches)} current={m.sla_breaches} previous={prev.sla_breaches} better="down" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatTile
          {...tile}
          label="Avg first response"
          value={formatHours(m.response_hours.avg)}
          detail={m.response_hours.count ? `median ${formatHours(m.response_hours.median)} · p90 ${formatHours(m.response_hours.p90)}` : undefined}
          current={m.response_hours.avg}
          previous={prev.response_hours.avg}
          better="down"
          formatDelta={(d) => signed(d, " h")}
        />
        <StatTile
          {...tile}
          label="Avg resolution"
          value={formatHours(m.resolution_hours.avg)}
          detail={m.resolution_hours.count ? `median ${formatHours(m.resolution_hours.median)} · p90 ${formatHours(m.resolution_hours.p90)}` : undefined}
          current={m.resolution_hours.avg}
          previous={prev.resolution_hours.avg}
          better="down"
          formatDelta={(d) => signed(d, " h")}
        />
        <StatTile
          {...tile}
          label="Response SLA met"
          value={pct(m.response_sla.met_pct)}
          detail={`${m.response_sla.met} met · ${m.response_sla.missed} missed`}
          current={m.response_sla.met_pct}
          previous={prev.response_sla.met_pct}
          better="up"
          formatDelta={(d) => signed(d, " pts")}
        />
        <StatTile
          {...tile}
          label="Resolution SLA met"
          value={pct(m.resolution_sla.met_pct)}
          detail={`${m.resolution_sla.met} met · ${m.resolution_sla.missed} missed`}
          current={m.resolution_sla.met_pct}
          previous={prev.resolution_sla.met_pct}
          better="up"
          formatDelta={(d) => signed(d, " pts")}
        />
        <StatTile
          {...tile}
          label="End user rating"
          value={m.avg_rating === null ? "—" : `${m.avg_rating.toFixed(2)} / 5`}
          detail={`${m.rated} rated`}
          current={m.avg_rating}
          previous={prev.avg_rating}
          better="up"
          formatDelta={(d) => signed(Number(d.toFixed(2)))}
        />
        <StatTile
          {...tile}
          label="Reopened"
          value={pct(m.reopen_pct)}
          detail={`${m.reopened} of ${m.resolved} resolved`}
          current={m.reopen_pct}
          previous={prev.reopen_pct}
          better="down"
          formatDelta={(d) => signed(d, " pts")}
        />
      </div>
    </div>
  );
}

function Reports() {
  const { can } = useSession();
  const [range, setRange] = useState({ date_from: isoDaysAgo(29), date_to: isoDaysAgo(0) });
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [priority, setPriority] = useState("");
  const [tab, setTab] = useState<Tab>("agents");
  const [level, setLevel] = useState("district");
  const [showTable, setShowTable] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const query: ReportQuery = { ...range, department_id: departmentId ?? undefined, priority: priority || undefined };
  const deps = [range.date_from, range.date_to, departmentId, priority];
  const summary = useApiData(() => api.reports.summary(query), deps);
  const trend = useApiData(() => api.reports.trend(query), deps);
  const table = useApiData(
    () => api.reports.table(tab, tab === "locations" ? { ...query, level } : query),
    [...deps, tab, level],
  );
  const canListDepartments = can("department.view");
  const canListLevels = can("location.view");
  const { data: departments = [] } = useApiData<Department[]>(
    () => (canListDepartments ? api.departments.list() : Promise.resolve([])),
    [canListDepartments],
  );
  const { data: levels = [] } = useApiData<LocationType[]>(
    () => (canListLevels ? api.locations.types() : Promise.resolve([])),
    [canListLevels],
  );

  const days = Math.round((Date.parse(range.date_to) - Date.parse(range.date_from)) / 86_400_000) + 1;
  const activePreset = range.date_to === isoDaysAgo(0) ? PRESETS.find((p) => p === days) : undefined;
  const error = summary.error ?? trend.error ?? table.error ?? exportError;

  return (
    <>
      <PageHeader title="Reports" description="Complaints submitted in the selected period, within your department and location scope." />

      {/* One filter row; everything below re-renders against the same slice. */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((d) => (
          <button
            key={d}
            onClick={() => setRange({ date_from: isoDaysAgo(d - 1), date_to: isoDaysAgo(0) })}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
              activePreset === d ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Last {d} days
          </button>
        ))}
        <input type="date" aria-label="From" className={`${inputClass} max-w-[9.5rem]`} value={range.date_from} max={range.date_to}
          onChange={(e) => e.target.value && setRange({ ...range, date_from: e.target.value })} />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" aria-label="To" className={`${inputClass} max-w-[9.5rem]`} value={range.date_to} min={range.date_from}
          onChange={(e) => e.target.value && setRange({ ...range, date_to: e.target.value })} />
        {departments.length > 0 && (
          <select className={`${inputClass} max-w-[11rem]`} value={departmentId ?? ""} onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <select className={`${inputClass} max-w-[9rem]`} value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          {["Critical", "High", "Medium", "Low"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <ErrorBanner message={error} />

      {/* Refetch keeps the frame: previous numbers stay, dimmed, until the new ones arrive. */}
      <div className={`transition-opacity ${summary.refreshing ? "opacity-60" : ""}`}>
        {summary.data ? (
          <Tiles m={summary.data.metrics} prev={summary.data.previous} periodLabel={`previous ${days} days`} />
        ) : (
          <p className="text-xs text-slate-400">Loading...</p>
        )}
      </div>

      <Card className={`p-5 transition-opacity ${trend.refreshing ? "opacity-60" : ""}`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Complaints over time</h3>
            <p className="text-[11px] text-slate-500">
              Per {trend.data?.interval ?? "day"}: received, resolved, and received complaints that missed a response or
              resolution target.
            </p>
          </div>
          <button className={secondaryButtonClass} onClick={() => setShowTable(!showTable)}>
            {showTable ? <LineChart className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
            {showTable ? "Chart" : "Table"}
          </button>
        </div>
        {trend.data &&
          (showTable ? (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-xs" style={{ fontVariantNumeric: "tabular-nums" }}>
                <thead className="text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-3 py-2 text-left">{trend.data.interval === "week" ? "Week of" : "Date"}</th>
                    {TREND_SERIES.map((s) => (
                      <th key={s.key} className="px-3 py-2 text-right">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {trend.data.points.map((p) => (
                    <tr key={p.date}>
                      <td className="px-3 py-1.5 text-slate-700">{p.label}</td>
                      <td className="px-3 py-1.5 text-right">{p.received}</td>
                      <td className="px-3 py-1.5 text-right">{p.resolved}</td>
                      <td className="px-3 py-1.5 text-right">{p.breached}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <TrendLineChart
              points={trend.data.points}
              series={TREND_SERIES}
              ariaLabel={`Complaints received, resolved and missing SLA per ${trend.data.interval}; use the arrow keys to read values, or switch to the table.`}
            />
          ))}
      </Card>

      <Card className={`transition-opacity ${table.refreshing ? "opacity-60" : ""}`}>
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4 pb-3">
          {(["agents", "departments", "locations"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                tab === t ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t === "agents" ? "Officers" : t === "departments" ? "Departments" : "Locations"}
            </button>
          ))}
          {tab === "locations" && (
            <select className={`${inputClass} max-w-[9rem]`} value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Group by level">
              {(levels.length ? levels : [{ key: "state", name: "State" }, { key: "district", name: "District" }, { key: "city", name: "City" }, { key: "area", name: "Area" }])
                .filter((l) => l.key !== "country")
                .map((l) => (
                  <option key={l.key} value={l.key}>
                    By {l.name.toLowerCase()}
                  </option>
                ))}
            </select>
          )}
          <button
            className={`${secondaryButtonClass} ml-auto`}
            onClick={() => {
              setExportError(null);
              api.reports
                .exportTable(tab, tab === "locations" ? { ...query, level } : query)
                .catch((err: Error) => setExportError(err.message));
            }}
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
        {table.data && (
          <PerformanceTable
            rows={table.data}
            nameLabel={tab === "agents" ? "Officer (current handler)" : tab === "departments" ? "Department" : "Location"}
            showRole={tab === "agents"}
          />
        )}
      </Card>
    </>
  );
}

export default function ReportsPage() {
  return (
    <RequirePermission anyOf={["reports.view"]}>
      <Reports />
    </RequirePermission>
  );
}
