"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, XCircle } from "lucide-react";
import { PerformanceRow } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { formatHours } from "@/lib/format";

/** SLA compliance with a status icon + word, so it never relies on colour. */
export function SlaCell({ pct }: { pct: number | null }) {
  const { ui } = useConfig();
  if (pct === null) return <span className="text-slate-400">—</span>;
  const [Icon, color, word] =
    pct >= ui.sla_good_pct
      ? [CheckCircle2, "#0ca30c", "good"]
      : pct >= ui.sla_watch_pct
        ? [AlertTriangle, "#b7791f", "watch"]
        : [XCircle, "#d03b3b", "poor"];
  return (
    <span className="inline-flex items-center gap-1 justify-end" title={`${word}`}>
      <Icon className="w-3.5 h-3.5" style={{ color }} aria-hidden="true" />
      <span className="text-slate-800">{pct.toFixed(0)}%</span>
      <span className="sr-only">({word})</span>
    </span>
  );
}

type SortKey = keyof PerformanceRow;

const COLUMNS: { key: SortKey; label: string; render?: (row: PerformanceRow) => React.ReactNode; title?: string }[] = [
  { key: "total", label: "Complaints" },
  { key: "pending", label: "Pending" },
  { key: "resolved", label: "Resolved" },
  { key: "rejected", label: "Rejected" },
  {
    key: "avg_response_hours",
    label: "Avg response",
    render: (r) => formatHours(r.avg_response_hours),
    title: "Submission to first response",
  },
  {
    key: "avg_resolution_hours",
    label: "Avg resolution",
    render: (r) => formatHours(r.avg_resolution_hours),
    title: "Submission to resolved",
  },
  { key: "response_sla_pct", label: "Response SLA", render: (r) => <SlaCell pct={r.response_sla_pct} /> },
  { key: "resolution_sla_pct", label: "Resolution SLA", render: (r) => <SlaCell pct={r.resolution_sla_pct} /> },
  { key: "sla_breaches", label: "Missed a target", title: "Complaints that missed a response or resolution target" },
  { key: "escalated_now", label: "Escalated now" },
  { key: "avg_rating", label: "Rating", render: (r) => (r.avg_rating === null ? "—" : `${r.avg_rating.toFixed(1)} / 5`) },
  { key: "reopened", label: "Reopened" },
];

/** Sortable per-agent / department / location table (also the chart's table view in spirit). */
export function PerformanceTable({
  rows,
  nameLabel,
  showRole = false,
  onPrintStaffId,
  selectedRowIds,
  onSelectionChange,
}: {
  rows: PerformanceRow[];
  nameLabel: string;
  showRole?: boolean;
  onPrintStaffId?: (id: number) => void;
  selectedRowIds?: number[];
  onSelectionChange?: (ids: number[]) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "total", desc: true });
  const sorted = [...rows].sort((a, b) => {
    const av = a[sort.key] ?? -Infinity;
    const bv = b[sort.key] ?? -Infinity;
    const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
    return sort.desc ? -cmp : cmp;
  });

  const header = (key: SortKey, label: string, title?: string, align = "text-center px-1.5 sm:px-3") => (
    <th
      key={key}
      className={`py-2.5 font-semibold whitespace-nowrap ${align}`}
      title={title}
      aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}
    >
      <button
        className="inline-flex items-center gap-0.5 hover:text-slate-700 cursor-pointer"
        onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : true })}
      >
        {label}
        {sort.key === key && (sort.desc ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
      </button>
    </th>
  );

  if (rows.length === 0) return <p className="p-6 text-center text-xs text-slate-400">No complaints in this period.</p>;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 text-slate-400 uppercase text-[10px] tracking-wider">
            {selectedRowIds && onSelectionChange && (
              <th className="pl-3 sm:pl-4 py-2.5 w-8">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  checked={rows.filter(r => r.id !== null).length > 0 && selectedRowIds.length === rows.filter(r => r.id !== null).length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onSelectionChange(rows.map(r => r.id).filter(id => id !== null) as number[]);
                    } else {
                      onSelectionChange([]);
                    }
                  }}
                  title="Select all"
                />
              </th>
            )}
            {header("name", nameLabel, undefined, `text-left ${selectedRowIds ? "pl-2 sm:pl-3" : "pl-2 sm:pl-5"} pr-1.5 sm:pr-3`)}
            {COLUMNS.map((c) => header(c.key, c.label, c.title))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50" style={{ fontVariantNumeric: "tabular-nums" }}>
          {sorted.map((row) => (
            <tr key={`${row.id}-${row.name}`} className="hover:bg-slate-50/70 group">
              {selectedRowIds && onSelectionChange && (
                <td className="pl-3 sm:pl-4 py-2.5">
                  {row.id !== null && (
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={selectedRowIds.includes(row.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          onSelectionChange([...selectedRowIds, row.id!]);
                        } else {
                          onSelectionChange(selectedRowIds.filter(id => id !== row.id));
                        }
                      }}
                    />
                  )}
                </td>
              )}
              <td className={`${selectedRowIds ? "pl-2 sm:pl-3" : "pl-2 sm:pl-5"} pr-1.5 sm:pr-3 py-2.5`}>
                <div className="flex items-center gap-2">
                  <div>
                    <div className={`font-semibold whitespace-nowrap ${row.id === null ? "text-slate-500 italic" : "text-slate-800"}`}>{row.name}</div>
                    {showRole && row.role && <div className="text-[10px] whitespace-nowrap text-slate-400">{row.role}</div>}
                    {row.path && row.path !== row.name && <div className="text-[10px] whitespace-nowrap text-slate-400">{row.path}</div>}
                  </div>
                  {row.id !== null && onPrintStaffId && (
                    <button 
                      onClick={() => onPrintStaffId(row.id!)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all ml-2"
                      title="Generate PDF Report"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </button>
                  )}
                </div>
              </td>
              {COLUMNS.map((c) => (
                <td key={c.key} className="px-1.5 sm:px-3 py-2.5 text-center text-slate-700 whitespace-nowrap">
                  {c.render ? c.render(row) : (row[c.key] as number).toLocaleString()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
