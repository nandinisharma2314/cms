"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Download, LineChart, Table2 } from "lucide-react";
import { api, ReportMetrics, ReportQuery } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { formatDay, formatHours, isoDay } from "@/lib/format";
import { useAction, useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { RequirePermission } from "@/components/RequirePermission";
import { PerformanceTable } from "@/components/reports/PerformanceTable";
import { StaffReportCard } from "@/components/reports/StaffReportCard";
import { StatTile } from "@/components/reports/StatTile";
import { TREND_COLORS, TrendLineChart } from "@/components/reports/TrendLineChart";
import { Card, ErrorBanner, inputClass, PageHeader, secondaryButtonClass, Spinner, tabClass } from "@/components/ui";

const TREND_SERIES = [
  { key: "received", label: "Received", color: TREND_COLORS[0] },
  { key: "resolved", label: "Resolved", color: TREND_COLORS[1] },
  { key: "breached", label: "Missed a target", color: TREND_COLORS[2] },
];
type Tab = "agents" | "departments" | "locations";
const TAB_LABELS: Record<Tab, string> = { agents: "Staff", departments: "Departments", locations: "Locations" };

const count = (n: number) => n.toLocaleString();
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);
const signed = (n: number, unit = "") => `${n > 0 ? "+" : ""}${Number.isInteger(n) ? n : n.toFixed(1)}${unit}`;

function Tiles({ m, prev, periodLabel }: { m: ReportMetrics; prev: ReportMetrics; periodLabel: string }) {
  const tile = { periodLabel };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatTile {...tile} label="Received" value={count(m.total)} current={m.total} previous={prev.total} />
        <StatTile
          {...tile}
          label="Still open"
          value={count(m.pending)}
          detail={`${m.unassigned} unassigned`}
          current={m.pending}
          previous={prev.pending}
          better="down"
        />
        <StatTile
          {...tile}
          label="Resolved or closed"
          value={count(m.resolved)}
          current={m.resolved}
          previous={prev.resolved}
          better="up"
        />
        <StatTile
          {...tile}
          label="Rejected"
          value={count(m.rejected)}
          detail={`${pct(m.rejection_pct)} of received`}
          current={m.rejected}
          previous={prev.rejected}
        />
        <StatTile
          {...tile}
          label="Escalated now"
          value={count(m.escalated_now)}
          current={m.escalated_now}
          previous={prev.escalated_now}
          better="down"
        />
        <StatTile
          {...tile}
          label="Missed a target"
          value={count(m.sla_breaches)}
          current={m.sla_breaches}
          previous={prev.sla_breaches}
          better="down"
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatTile
          {...tile}
          label="Average first response"
          value={formatHours(m.response_hours.avg)}
          detail={
            m.response_hours.count
              ? `median ${formatHours(m.response_hours.median)} · p90 ${formatHours(m.response_hours.p90)}`
              : undefined
          }
          current={m.response_hours.avg}
          previous={prev.response_hours.avg}
          better="down"
          formatDelta={(d) => signed(d, " h")}
        />
        <StatTile
          {...tile}
          label="Average resolution"
          value={formatHours(m.resolution_hours.avg)}
          detail={
            m.resolution_hours.count
              ? `median ${formatHours(m.resolution_hours.median)} · p90 ${formatHours(m.resolution_hours.p90)}`
              : undefined
          }
          current={m.resolution_hours.avg}
          previous={prev.resolution_hours.avg}
          better="down"
          formatDelta={(d) => signed(d, " h")}
        />
        <StatTile
          {...tile}
          label="Response target met"
          value={pct(m.response_sla.met_pct)}
          detail={`${m.response_sla.met} met · ${m.response_sla.missed} missed`}
          current={m.response_sla.met_pct}
          previous={prev.response_sla.met_pct}
          better="up"
          formatDelta={(d) => signed(d, " pts")}
        />
        <StatTile
          {...tile}
          label="Resolution target met"
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
          detail={`${m.reopened} of ${m.resolved_at_least_once} ever resolved`}
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
  useDocumentTitle("Reports");
  const { can } = useSession();
  const { ui, ...config } = useConfig();
  const [range, setRange] = useState(() => ({ date_from: isoDay(ui.report_default_days - 1), date_to: isoDay(0) }));
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [priorityId, setPriorityId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("agents");
  const [level, setLevel] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [printStaffId, setPrintStaffId] = useState<number | null>(null);
  const [printAllStaff, setPrintAllStaff] = useState(false);
  const exporter = useAction();

  const handlePrintStaff = (id: number) => {
    setPrintStaffId(id);
    setTimeout(() => window.print(), 100);
  };

  const handlePrintAll = () => {
    setPrintAllStaff(true);
    setTimeout(() => window.print(), 100);
  };

  const query: ReportQuery = { ...range, department_id: departmentId ?? undefined, priority_id: priorityId ?? undefined };
  const deps = [range.date_from, range.date_to, departmentId, priorityId];
  const overview = useApiData(() => api.reports.overview(query), deps);
  const { data: levelList } = useApiData(() => api.reports.levels(), []);
  const levels = levelList ?? [];
  // Grouping by the top level is rarely useful, so the second level is the default.
  const activeLevel = level ?? levels[Math.min(1, levels.length - 1)]?.key ?? null;
  const tableQuery = tab === "locations" && activeLevel ? { ...query, level: activeLevel } : query;
  const table = useApiData(
    () => (tab === "locations" && !activeLevel ? Promise.resolve([]) : api.reports.table(tab, tableQuery)),
    [...deps, tab, activeLevel],
  );
  const canListDepartments = can("department.view");
  const { data: departments = [] } = useApiData(
    () => (canListDepartments ? api.departments.list() : Promise.resolve([])),
    [canListDepartments],
  );
  const { data: priorities = [] } = useApiData(() => api.priorities.list(true), []);

  const days = Math.round((Date.parse(range.date_to) - Date.parse(range.date_from)) / 86_400_000) + 1;
  const activePreset = range.date_to === isoDay(0) ? ui.report_preset_days.find((p) => p === days) : undefined;
  const trend = overview.data?.trend;

  return (
    <div className="space-y-4 -mt-5 sm:-mt-2">
      <PageHeader
        title="Reports"
        description="Complaints submitted in the chosen period, inside your department and location scope."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] max-w-full">
          {ui.report_preset_days.map((d) => (
            <button
              key={d}
              onClick={() => setRange({ date_from: isoDay(d - 1), date_to: isoDay(0) })}
              className={tabClass(activePreset === d) + " shrink-0"}
            >
              Last {d} days
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
          <input
            type="date"
            aria-label="From"
            className={`${inputClass} !px-1.5 sm:!px-3 !text-[10px] sm:!text-sm max-w-38 w-full sm:w-auto`}
            value={range.date_from}
            max={range.date_to}
            onChange={(e) => e.target.value && setRange({ ...range, date_from: e.target.value })}
          />
          <span className="text-[10px] sm:text-xs text-slate-400">to</span>
          <input
            type="date"
            aria-label="To"
            className={`${inputClass} !px-1.5 sm:!px-3 !text-[10px] sm:!text-sm max-w-38 w-full sm:w-auto`}
            value={range.date_to}
            min={range.date_from}
            onChange={(e) => e.target.value && setRange({ ...range, date_to: e.target.value })}
          />
        </div>
        {departments.length > 0 && (
          <select
            aria-label="Department"
            className={`${inputClass} max-w-44`}
            value={departmentId ?? ""}
            onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Priority"
          className={`${inputClass} max-w-36`}
          value={priorityId ?? ""}
          onChange={(e) => setPriorityId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">All priorities</option>
          {priorities.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <ErrorBanner message={overview.error ?? table.error ?? exporter.error} />

      {/* On refetch the previous numbers stay, dimmed, until the new ones arrive. */}
      <div className={`hidden sm:block transition-opacity ${overview.refreshing ? "opacity-60" : ""}`}>
        {overview.data ? (
          <Tiles m={overview.data.metrics} prev={overview.data.previous} periodLabel={`previous ${days} days`} />
        ) : (
          !overview.error && <Spinner />
        )}
      </div>

      <Card className={`hidden sm:block p-5 transition-opacity ${overview.refreshing ? "opacity-60" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Complaints over time</h2>
            <p className="text-[11px] text-slate-500">
              Per {trend?.interval ?? "day"}: received, resolved, and received complaints that missed a response or resolution
              target.
            </p>
          </div>
          <button className={secondaryButtonClass} onClick={() => setShowTable(!showTable)}>
            {showTable ? <LineChart className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
            {showTable ? "Chart" : "Table"}
          </button>
        </div>
        {trend &&
          (showTable ? (
            <div className="relative max-h-80 overflow-auto">
              <table className="w-full text-xs" style={{ fontVariantNumeric: "tabular-nums" }}>
                <thead className="text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-3 py-2 text-left">{trend.interval === "week" ? "Week starting" : "Date"}</th>
                    {TREND_SERIES.map((s) => (
                      <th key={s.key} className="px-3 py-2 text-right">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {trend.points.map((p) => (
                    <tr key={p.date}>
                      <td className="px-3 py-1.5 text-slate-700">{formatDay(p.date, true)}</td>
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
              points={trend.points.map((p) => ({ ...p, label: formatDay(p.date) }))}
              series={TREND_SERIES}
              ariaLabel={`Complaints received, resolved and missing a target per ${trend.interval}; use the arrow keys to read values, or switch to the table.`}
            />
          ))}
      </Card>

      <Card className={`transition-opacity ${table.refreshing ? "opacity-60" : ""}`}>
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-5 pt-3 sm:pt-4 pb-2 sm:pb-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={tabClass(tab === t) + " shrink-0"}>
              {TAB_LABELS[t]}
            </button>
          ))}
          {tab === "locations" && levels.length > 0 && (
            <select
              className={`${inputClass} max-w-32 sm:max-w-40 shrink-0`}
              value={activeLevel ?? ""}
              onChange={(e) => setLevel(e.target.value)}
              aria-label="Group by level"
            >
              {levels.map((l) => (
                <option key={l.key} value={l.key}>
                  By {l.name.toLowerCase()}
                </option>
              ))}
            </select>
          )}
          {/* Bulk PDF Button for all tabs */}
          <button
            onClick={handlePrintAll}
              className={`${secondaryButtonClass} ml-auto shrink-0 !px-2.5 sm:!px-3`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span className="hidden sm:inline">Bulk PDF</span>
            </button>
          <button
            className={`${secondaryButtonClass} ${tab !== "agents" ? "ml-auto" : ""} shrink-0 !px-2.5 sm:!px-3`}
            disabled={exporter.busy}
            onClick={() => exporter.run(() => api.reports.exportTable(tab, tableQuery))}
          >
            <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
        {tab === "locations" && levelList?.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-400">No location levels are defined.</p>
        ) : table.data ? (
          <PerformanceTable
            rows={table.data}
            nameLabel={tab === "agents" ? "Current handler" : tab === "departments" ? "Department" : "Location"}
            showRole={tab === "agents"}
            onPrintStaffId={handlePrintStaff}
          />
        ) : (
          !table.error && <Spinner />
        )}
      </Card>

      {/* Print-only layout */}
      {(printStaffId !== null || printAllStaff) && table.data && (
        <div className="hidden print:block absolute top-0 left-0 w-full bg-white z-50">
          {printAllStaff ? (
            table.data.filter((r) => r.id !== null).map((staff) => (
              <StaffReportCard key={staff.id} staff={staff} config={config} type={tab} />
            ))
          ) : (
            table.data.find(r => r.id === printStaffId) && <StaffReportCard staff={table.data.find(r => r.id === printStaffId)!} config={config} type={tab} />
          )}
          <style dangerouslySetInnerHTML={{ __html: `
            @page { margin: 0; }
            @media print {
              body * { visibility: hidden; }
              .print\\:block, .print\\:block * { visibility: visible; }
              .print\\:block { position: absolute; left: 0; top: 0; width: 100%; padding: 1cm; }
              .page-break { page-break-after: always; break-after: page; }
              .page-break:last-child { page-break-after: auto; break-after: auto; }
              /* Hide Next.js dev overlay just in case */
              #nextjs-portal { display: none !important; }
            }
          `}} />
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <RequirePermission anyOf={["reports.view"]}>
      <Reports />
    </RequirePermission>
  );
}
