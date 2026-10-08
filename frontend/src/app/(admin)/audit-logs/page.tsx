"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { api, AuditQuery } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { useAction, useApiData, useDebounced } from "@/lib/hooks";
import { RequirePermission } from "@/components/RequirePermission";
import { Card, ErrorBanner, inputClass, PageHeader, Pagination, secondaryButtonClass, TableMessage } from "@/components/ui";

function formatChange(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const humanize = (value: string) => value.replace(/_/g, " ");

function AuditLogTable() {
  useDocumentTitle("Audit log");
  const { ui } = useConfig();
  const [filters, setFilters] = useState<AuditQuery>({});
  const [page, setPage] = useState(1);
  const exporter = useAction();
  const debounced = useDebounced(filters);
  const set = (patch: Partial<AuditQuery>) => {
    setFilters({ ...filters, ...patch });
    setPage(1);
  };

  const { data: entityTypes = [] } = useApiData(() => api.audit.entityTypes(), []);
  const { data, error, loading } = useApiData(
    () => api.audit.list({ ...debounced, page, page_size: ui.default_page_size }),
    [JSON.stringify(debounced), page, ui.default_page_size],
  );

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who changed what, when and from where. Entries can't be edited or deleted. Dates are in the organisation's time zone."
        actions={
          <button
            className={secondaryButtonClass}
            disabled={exporter.busy}
            onClick={() => exporter.run(() => api.audit.exportCsv(debounced))}
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
        <input
          className={inputClass}
          aria-label="Action"
          placeholder="Action, e.g. complaint.reject"
          value={filters.action ?? ""}
          onChange={(e) => set({ action: e.target.value })}
        />
        <select
          className={inputClass}
          aria-label="Entity type"
          value={filters.entity_type ?? ""}
          onChange={(e) => set({ entity_type: e.target.value })}
        >
          <option value="">All kinds of records</option>
          {entityTypes.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </select>
        <input
          className={inputClass}
          aria-label="Record ID"
          placeholder="Record ID"
          value={filters.entity_id ?? ""}
          onChange={(e) => set({ entity_id: e.target.value })}
        />
        <input
          className={inputClass}
          aria-label="Who"
          placeholder="Who"
          value={filters.actor ?? ""}
          onChange={(e) => set({ actor: e.target.value })}
        />
        <input
          className={inputClass}
          aria-label="Text in the summary"
          placeholder="Text in the summary"
          value={filters.q ?? ""}
          onChange={(e) => set({ q: e.target.value })}
        />
        <input
          type="date"
          className={inputClass}
          aria-label="From"
          value={filters.date_from ?? ""}
          max={filters.date_to}
          onChange={(e) => set({ date_from: e.target.value })}
        />
        <input
          type="date"
          className={inputClass}
          aria-label="To"
          value={filters.date_to ?? ""}
          min={filters.date_from}
          onChange={(e) => set({ date_to: e.target.value })}
        />
      </div>
      <ErrorBanner message={error ?? exporter.error} />
      <Card className="relative overflow-x-auto">
        <table className="w-full min-w-225 text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400 uppercase text-[11px] tracking-wider">
              <th className="px-5 py-3 font-semibold">When</th>
              <th className="px-3 py-3 font-semibold">Who</th>
              <th className="px-3 py-3 font-semibold">Action</th>
              <th className="px-3 py-3 font-semibold">What</th>
              <th className="px-3 py-3 font-semibold">Before → after</th>
              <th className="px-5 py-3 font-semibold">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <TableMessage colSpan={6}>Loading…</TableMessage>
            ) : !data ? (
              <TableMessage colSpan={6}>The list could not be loaded (see the message above).</TableMessage>
            ) : data.items.length === 0 ? (
              <TableMessage colSpan={6}>No entries match.</TableMessage>
            ) : (
              data.items.map((entry) => (
                <tr key={entry.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-5 py-3 whitespace-nowrap text-slate-500">{formatDateTime(entry.created_at)}</td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-800">{entry.actor_name ?? "System"}</div>
                    <div className="text-[10px] text-slate-400">{humanize(entry.actor_type)}</div>
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] text-blue-700">{entry.action}</td>
                  <td className="px-3 py-3 text-slate-700">
                    {entry.summary}
                    {entry.entity_type === "complaint" && entry.entity_id && (
                      <Link
                        href={`/complaints/${encodeURIComponent(entry.entity_id)}`}
                        className="ml-1 text-blue-600 hover:underline"
                      >
                        open
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[11px] text-slate-500">
                    {entry.changes
                      ? Object.entries(entry.changes).map(([field, [before, after]]) => (
                          <div key={field}>
                            <span className="font-semibold text-slate-600">{humanize(field)}</span>: {formatChange(before)} →{" "}
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
      {data && <Pagination page={page} pageSize={data.page_size} total={data.total} noun="entries" onPage={setPage} />}
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
