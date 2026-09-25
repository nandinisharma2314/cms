"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { api, AuditQuery } from "@/lib/api";
import { useApiData, useDebounced } from "@/lib/hooks";
import { RequirePermission } from "@/components/RequirePermission";
import {
  Card, ErrorBanner, formatDateTime, inputClass, PageHeader, secondaryButtonClass,
} from "@/components/ui";

const PAGE_SIZE = 50;
const ENTITY_TYPES = ["", "user", "end_user", "role", "department", "location", "complaint", "sla_rule", "escalation_rule"];

function formatChange(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  return String(value);
}

function AuditLogTable() {
  const [filters, setFilters] = useState<AuditQuery>({});
  const [page, setPage] = useState(1);
  const [exportError, setExportError] = useState<string | null>(null);
  const debounced = useDebounced(filters);
  const set = (patch: Partial<AuditQuery>) => {
    setFilters({ ...filters, ...patch });
    setPage(1);
  };

  const { data, error } = useApiData(
    () => api.audit.list({ ...debounced, page, page_size: PAGE_SIZE }),
    [JSON.stringify(debounced), page],
  );
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="Who changed what, when and from where. Entries cannot be edited or deleted."
        actions={
          <button
            className={secondaryButtonClass}
            onClick={() => {
              setExportError(null);
              api.audit.exportCsv(debounced).catch((err: Error) => setExportError(err.message));
            }}
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        }
      />
      <div className="flex flex-wrap gap-3">
        <input className={`${inputClass} max-w-[200px]`} placeholder="Action, e.g. complaint.rejection" value={filters.action ?? ""} onChange={(e) => set({ action: e.target.value })} />
        <select className={`${inputClass} max-w-[170px]`} value={filters.entity_type ?? ""} onChange={(e) => set({ entity_type: e.target.value })}>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t ? t.replace("_", " ") : "All entities"}
            </option>
          ))}
        </select>
        <input className={`${inputClass} max-w-[150px]`} placeholder="Entity ID, e.g. CMP-10012" value={filters.entity_id ?? ""} onChange={(e) => set({ entity_id: e.target.value })} />
        <input className={`${inputClass} max-w-[150px]`} placeholder="Who" value={filters.actor ?? ""} onChange={(e) => set({ actor: e.target.value })} />
        <input className={`${inputClass} max-w-[180px]`} placeholder="Text in summary" value={filters.q ?? ""} onChange={(e) => set({ q: e.target.value })} />
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          From
          <input type="date" className={`${inputClass} w-36`} value={filters.date_from ?? ""} onChange={(e) => set({ date_from: e.target.value })} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          To
          <input type="date" className={`${inputClass} w-36`} value={filters.date_to ?? ""} onChange={(e) => set({ date_to: e.target.value })} />
        </label>
      </div>
      <ErrorBanner message={error ?? exportError} />
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400 uppercase text-[11px] tracking-wider">
              <th className="px-5 py-3 font-semibold">When</th>
              <th className="px-3 py-3 font-semibold">Who</th>
              <th className="px-3 py-3 font-semibold">Action</th>
              <th className="px-3 py-3 font-semibold">What</th>
              <th className="px-3 py-3 font-semibold">From → To</th>
              <th className="px-5 py-3 font-semibold">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {!data ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  No entries match.
                </td>
              </tr>
            ) : (
              data.items.map((entry) => (
                <tr key={entry.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-5 py-3 whitespace-nowrap text-slate-500">{formatDateTime(entry.created_at)}</td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-800">{entry.actor_name ?? "System"}</div>
                    <div className="text-[10px] text-slate-400">{entry.actor_type.replace("_", " ")}</div>
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] text-blue-700">{entry.action}</td>
                  <td className="px-3 py-3 text-slate-700">
                    {entry.summary}
                    {entry.entity_type === "complaint" && entry.entity_id && (
                      <Link href={`/complaints/${entry.entity_id}`} className="ml-1 text-blue-600 hover:underline">
                        open
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[11px] text-slate-500">
                    {entry.changes
                      ? Object.entries(entry.changes).map(([field, [before, after]]) => (
                          <div key={field}>
                            <span className="font-semibold text-slate-600">{field}</span>: {formatChange(before)} →{" "}
                            {formatChange(after)}
                          </div>
                        ))
                      : "—"}
                  </td>
                  <td className="px-5 py-3 font-mono text-[11px] text-slate-400">{entry.ip_address ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
          <span>
            Page {page} of {totalPages} ({data.total} entries)
          </span>
          <button className={secondaryButtonClass} disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <button className={secondaryButtonClass} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      )}
    </>
  );
}

export default function AuditLogsPage() {
  return (
    <RequirePermission anyOf={["audit.view"]}>
      <AuditLogTable />
    </RequirePermission>
  );
}
