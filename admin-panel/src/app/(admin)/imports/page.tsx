"use client";

import React, { useState } from "react";
import { ChevronRight, Download } from "lucide-react";
import { api, ImportBatch, ImportKind } from "@/lib/api";
import { useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { RequirePermission } from "@/components/RequirePermission";
import { Card, ErrorBanner, formatDateTime, inputClass, PageHeader } from "@/components/ui";

const KIND_LABEL: Record<ImportKind, string> = { locations: "Locations", end_users: "Citizens" };
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
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const download = (severity: "error" | "warning") =>
    api.imports.downloadReport(batch.id, severity).catch((err: Error) => setDownloadError(err.message));

  return (
    <div className="px-5 pb-4 space-y-2">
      <ErrorBanner message={error ?? downloadError} />
      {batch.error && <p className="text-xs text-rose-700">{batch.error}</p>}
      <div className="flex gap-4 text-xs">
        {batch.failed > 0 && (
          <button className="inline-flex items-center gap-1 font-semibold text-rose-600 cursor-pointer" onClick={() => download("error")}>
            <Download className="w-3.5 h-3.5" /> Failed rows ({batch.failed})
          </button>
        )}
        {batch.warnings > 0 && (
          <button className="inline-flex items-center gap-1 font-semibold text-amber-700 cursor-pointer" onClick={() => download("warning")}>
            <Download className="w-3.5 h-3.5" /> Warnings ({batch.warnings})
          </button>
        )}
      </div>
      {data?.issues && data.issues.length > 0 && (
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
      {data?.issues?.length === 0 && !batch.error && <p className="text-xs text-slate-400">No problems in this file.</p>}
    </div>
  );
}

function ImportHistory() {
  const { can } = useSession();
  const [kind, setKind] = useState<ImportKind | "">("");
  const [open, setOpen] = useState<number | null>(null);
  const { data: batches = [], error, loading } = useApiData(() => api.imports.list(kind || undefined), [kind]);

  return (
    <>
      <PageHeader
        title="Import History"
        description={
          can("audit.view")
            ? "Every CSV upload and validation run, by anyone."
            : "Your CSV uploads and validation runs."
        }
      />
      <select className={`${inputClass} max-w-[180px]`} value={kind} onChange={(e) => setKind(e.target.value as ImportKind | "")}>
        <option value="">All imports</option>
        {can("location.import") && <option value="locations">Locations</option>}
        {can("end_user.import") && <option value="end_users">Citizens</option>}
      </select>
      <ErrorBanner message={error} />
      <Card className="divide-y divide-slate-50">
        {!loading && batches.length === 0 && <p className="p-6 text-center text-xs text-slate-400">No imports yet.</p>}
        {batches.map((b) => (
          <div key={b.id}>
            <button
              className="w-full flex flex-wrap items-center gap-3 px-5 py-3 text-left text-xs hover:bg-slate-50/70 cursor-pointer"
              onClick={() => setOpen(open === b.id ? null : b.id)}
            >
              <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open === b.id ? "rotate-90" : ""}`} />
              <span className="font-semibold text-slate-800 w-20">{KIND_LABEL[b.kind]}</span>
              <span className="text-slate-600 truncate max-w-[220px]">{b.filename ?? "—"}</span>
              <span className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold ${STATUS_STYLE[b.status]}`}>
                {STATUS_LABEL[b.status]}
              </span>
              <span className="text-slate-500">
                {b.total_rows} rows · {b.created} new · {b.updated} updated · {b.unchanged} unchanged
              </span>
              {b.failed > 0 && <span className="text-rose-600 font-semibold">{b.failed} failed</span>}
              {b.warnings > 0 && <span className="text-amber-700 font-semibold">{b.warnings} warnings</span>}
              <span className="ml-auto text-slate-400">
                {b.uploaded_by} · {formatDateTime(b.started_at)}
              </span>
            </button>
            {open === b.id && <BatchIssues batch={b} />}
          </div>
        ))}
      </Card>
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
