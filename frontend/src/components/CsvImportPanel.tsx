"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, SearchCheck, Upload } from "lucide-react";
import { api, ImportResult } from "@/lib/api";
import { plural } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { ErrorBanner, primaryButtonClass, secondaryButtonClass } from "./ui";

function IssueTable({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: { row: number; message: string }[];
  tone: "error" | "warning";
}) {
  if (rows.length === 0) return null;
  const head = tone === "error" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800";
  const border = tone === "error" ? "border-rose-100" : "border-amber-100";
  return (
    <div className={`max-h-48 overflow-y-auto rounded-xl border ${border}`}>
      <table className="w-full text-left">
        <thead className={`text-[11px] sticky top-0 ${head}`}>
          <tr>
            <th className="px-3 py-1.5 w-16">Row</th>
            <th className="px-3 py-1.5">{title}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((e, i) => (
            <tr key={`${e.row}-${i}`}>
              <td className="px-3 py-1.5 font-mono text-slate-500">{e.row}</td>
              <td className="px-3 py-1.5 text-slate-700">{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * File picker + validate-only / import + per-row report for a CSV import
 * endpoint. Every upload (including validation runs) is kept in Import history.
 */
export function CsvImportPanel({
  columns,
  templateName,
  onImport,
  onDone,
}: {
  columns: string[];
  templateName: string;
  onImport: (file: File, dryRun: boolean) => Promise<ImportResult>;
  onDone?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const { busy, error, setError, run } = useAction();

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([`${columns.join(",")}\n`], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = templateName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const upload = (dryRun: boolean) => {
    if (!file) return;
    setResult(null);
    run(async () => {
      setResult(await onImport(file, dryRun));
      if (!dryRun) onDone?.();
    });
  };

  const would = result?.dry_run ? "would be " : "";

  return (
    <div className="space-y-4 text-xs">
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
        <p className="font-semibold text-slate-700 mb-1">Columns</p>
        <code className="block text-[11px] text-slate-600 break-all">{columns.join(",")}</code>
        <button
          type="button"
          onClick={downloadTemplate}
          className="mt-2 inline-flex items-center gap-1 text-blue-600 font-semibold cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" /> Download an empty template
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError(null);
            e.target.value = ""; // so choosing the same (corrected) file again is noticed
          }}
        />
        <button type="button" className={secondaryButtonClass} onClick={() => inputRef.current?.click()}>
          Choose CSV file
        </button>
        <span className="text-slate-500 truncate">{file?.name ?? "No file selected"}</span>
      </div>

      <ErrorBanner message={error} />

      {result && (
        <div className="space-y-2">
          <div
            role="status"
            className={`p-3 rounded-xl border flex items-start gap-2 ${
              result.dry_run ? "bg-blue-50 border-blue-200 text-blue-900" : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}
          >
            {result.dry_run ? (
              <SearchCheck className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>
              {result.dry_run && <b>Validation only; nothing was saved. </b>}
              {plural(result.total_rows, "row", "rows")}: {result.created} {would}created
              {result.updated ? `, ${result.updated} ${would}updated` : ""}, {result.unchanged} unchanged, {result.failed}{" "}
              {result.dry_run ? "would fail" : "failed"}
              {result.warnings ? `, ${plural(result.warnings, "warning", "warnings")}` : ""}.
            </span>
          </div>
          <IssueTable title="Not imported" rows={result.errors} tone="error" />
          <IssueTable title="Imported, but check" rows={result.warning_list} tone="warning" />
          {result.truncated && (
            <p className="text-[11px] text-slate-500">Only the first problems are listed here; Import history has all of them.</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {result.failed > 0 && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-rose-600 font-semibold cursor-pointer"
                onClick={() => api.imports.downloadReport(result.batch_id, "error").catch((err: Error) => setError(err.message))}
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Download the failed rows to fix and upload again
              </button>
            )}
            <Link href="/imports" className="text-slate-500 hover:text-blue-600">
              Import history
            </Link>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButtonClass} disabled={!file || busy} onClick={() => upload(true)}>
          <SearchCheck className="w-3.5 h-3.5" /> Validate only
        </button>
        <button type="button" className={primaryButtonClass} disabled={!file || busy} onClick={() => upload(false)}>
          <Upload className="w-3.5 h-3.5" /> {busy ? "Working…" : "Import"}
        </button>
      </div>
    </div>
  );
}
