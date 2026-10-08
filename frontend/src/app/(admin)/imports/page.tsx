"use client";

import React, { useState } from "react";
import { ChevronRight, Download } from "lucide-react";
import { api, ImportBatch, ImportKind } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { formatDateTime, plural } from "@/lib/format";
import { useAction, useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { RequirePermission } from "@/components/RequirePermission";
import { Card, ErrorBanner, inputClass, PageHeader, Pagination, Spinner } from "@/components/ui";

const KIND_LABEL: Record<ImportKind, string> = { locations: "Locations", end_users: "End users" };
const STATUS_STYLE: Record<ImportBatch["status"], string> = {
  completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
  validated: "bg-blue-50 text-blue-700 border-blue-100",
  rejected: "bg-rose-50 text-rose-700 border-rose-100",
};
const STATUS_LABEL: Record<ImportBatch["status"], string> = {
  completed: "Imported",
  validated: "Validation only",
  rejected: "File rejected",
};

function BatchIssues({ batch }: { batch: ImportBatch }) {
  const { data, error } = useApiData(() => api.imports.get(batch.id), [batch.id]);
  const download = useAction();

  return (
    <div className="px-5 pb-4 space-y-2">
      <ErrorBanner message={error ?? download.error} />
      {batch.error && <p className="text-xs text-rose-700">{batch.error}</p>}
      <div className="flex flex-wrap gap-4 text-xs">
        {batch.failed > 0 && (
          <button
            className="inline-flex items-center gap-1 font-semibold text-rose-600 cursor-pointer"
            onClick={() => download.run(() => api.imports.downloadReport(batch.id, "error"))}
          >
            <Download className="w-3.5 h-3.5" /> Failed rows ({batch.failed})
          </button>
        )}
        {batch.warnings > 0 && (
          <button
            className="inline-flex items-center gap-1 font-semibold text-amber-700 cursor-pointer"
            onClick={() => download.run(() => api.imports.downloadReport(batch.id, "warning"))}
          >
            <Download className="w-3.5 h-3.5" /> Warnings ({batch.warnings})
          </button>
        )}
      </div>
      {!data && !error && <Spinner />}
      {data && data.issues.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100">
          <table className="w-full text-left text-xs">
            <tbody className="divide-y divide-slate-50">
              {data.issues.map((issue, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 w-16 font-mono text-slate-500">{issue.row}</td>
                  <td className="px-3 py-1.5 w-20">
                    <span className={issue.severity === "error" ? "text-rose-600 font-semibold" : "text-amber-700 font-semibold"}>
                      {issue.severity}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-slate-700">{issue.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data?.issues_truncated && (
        <p className="text-[11px] text-slate-500">Only the first problems are listed; download the report for all of them.</p>
      )}
      {data && data.issues.length === 0 && !batch.error && <p className="text-xs text-slate-400">No problems in this file.</p>}
    </div>
  );
}

function ImportHistory() {
  useDocumentTitle("Import history");
  const { can } = useSession();
  const { ui } = useConfig();
  const [kind, setKind] = useState<ImportKind | "">("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const { data, error, loading } = useApiData(
    () => api.imports.list({ kind: kind || undefined, page, page_size: ui.default_page_size }),
    [kind, page, ui.default_page_size],
  );

  return (
    <>
      <PageHeader
        title="Import history"
        description={
          can("audit.view") ? "Every CSV upload and validation run, by anyone." : "Your CSV uploads and validation runs."
        }
      />
      <select
        className={`${inputClass} sm:max-w-44`}
        aria-label="Kind of import"
        value={kind}
        onChange={(e) => {
          setKind(e.target.value as ImportKind | "");
          setPage(1);
        }}
      >
        <option value="">All imports</option>
        {can("location.import") && <option value="locations">Locations</option>}
        {can("end_user.import") && <option value="end_users">End users</option>}
      </select>
      <ErrorBanner message={error} />
      <Card className="divide-y divide-slate-50">
        {loading && <Spinner />}
        {data && data.items.length === 0 && <p className="p-6 text-center text-xs text-slate-400">No imports yet.</p>}
        {data?.items.map((b) => (
          <div key={b.id}>
            <button
              className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-left text-xs hover:bg-slate-50/70 cursor-pointer"
              onClick={() => setOpen(open === b.id ? null : b.id)}
              aria-expanded={open === b.id}
            >
              <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open === b.id ? "rotate-90" : ""}`} />
              <span className="font-semibold text-slate-800 w-20">{KIND_LABEL[b.kind]}</span>
              <span className="text-slate-600 truncate max-w-55">{b.filename ?? "—"}</span>
              <span className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold ${STATUS_STYLE[b.status]}`}>
                {STATUS_LABEL[b.status]}
              </span>
              <span className="text-slate-500">
                {plural(b.total_rows, "row", "rows")} · {b.created} new · {b.updated} updated · {b.unchanged} unchanged
              </span>
              {b.failed > 0 && <span className="text-rose-600 font-semibold">{b.failed} failed</span>}
              {b.warnings > 0 && (
                <span className="text-amber-700 font-semibold">{plural(b.warnings, "warning", "warnings")}</span>
              )}
              <span className="sm:ml-auto text-slate-400">
                {b.uploaded_by} · {formatDateTime(b.started_at)}
              </span>
            </button>
            {open === b.id && <BatchIssues batch={b} />}
          </div>
        ))}
      </Card>
      {data && <Pagination page={page} pageSize={data.page_size} total={data.total} noun="imports" onPage={setPage} />}
    </>
  );
}

export default function ImportsPage() {
  return (
    <RequirePermission anyOf={["location.import", "end_user.import"]}>
      <ImportHistory />
    </RequirePermission>
  );
}
