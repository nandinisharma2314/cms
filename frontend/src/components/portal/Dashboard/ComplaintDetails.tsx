"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Calendar,
  ChevronLeft,
  Download,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Image as ImageIcon,
  MapPin,
  Paperclip,
  Table,
  Video,
  X,
} from "lucide-react";
import { api, Attachment, attachmentUrl, ComplaintDetail } from "@/lib/portalApi";
import { useConfig, useDocumentTitle } from "@/lib/portalConfig";
import { formatBytes, formatDateTime, shortPlace } from "@/lib/portalFormat";
import { GROUP_PILLS, TONE_PILLS } from "@/lib/portalStatus";
import ComplaintActivity from "./ComplaintActivity";

type FileKind = "image" | "pdf" | "csv" | "video" | "other";

const CARD = "rounded-2xl bg-white shadow-[0_2px_14px_-6px_rgba(15,23,42,0.12)]";

function fileKind(file: Attachment): FileKind {
  const type = file.content_type.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  if (type === "text/csv") return "csv";
  if (type.startsWith("video/")) return "video";
  return "other";
}

const KIND_TILES: Record<Exclude<FileKind, "image">, { icon: typeof FileText; label: string; tone: string }> = {
  pdf: { icon: FileText, label: "PDF", tone: "bg-red-50 text-red-600" },
  csv: { icon: Table, label: "Spreadsheet", tone: "bg-emerald-50 text-emerald-600" },
  video: { icon: Video, label: "Video", tone: "bg-purple-50 text-purple-600" },
  other: { icon: FileCheck, label: "Document", tone: "bg-slate-100 text-slate-600" },
};

/**
 * The first `limit` rows of a CSV file. Quoted cells may hold commas, doubled
 * quotes and line breaks; a leading byte order mark is dropped.
 */
function csvRows(text: string, limit: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
    cell = "";
  };
  const source = text.startsWith("\ufeff") ? text.slice(1) : text;
  for (let i = 0; i < source.length && rows.length < limit; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      endRow();
    } else {
      cell += ch;
    }
  }
  if (rows.length < limit && (cell !== "" || row.length > 0)) endRow();
  return rows;
}

function Preview({ file, onClose }: { file: Attachment; onClose: () => void }) {
  const { ui } = useConfig();
  const kind = fileKind(file);
  const url = attachmentUrl(file);
  const [csv, setCsv] = useState<{ rows: string[][]; error: string | null } | null>(null);

  useEffect(() => {
    if (kind !== "csv") return;
    let active = true;
    fetch(url)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error("The file could not be loaded."))))
      .then(
        (text) =>
          active &&
          setCsv({
            rows: csvRows(text, ui.csv_preview_rows + 1), // + the header row
            error: null,
          }),
        (err: Error) => active && setCsv({ rows: [], error: err.message }),
      );
    return () => {
      active = false;
    };
  }, [kind, url, ui.csv_preview_rows]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // In <body>, like Dialog, so no filtered or transformed ancestor can clip it.
  return createPortal(
    <div
      className="fixed inset-0 z-150 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={file.file_name}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 bg-slate-900 p-4 text-white">
          <div className="flex min-w-0 items-center gap-2">
            {kind === "image" ? (
              <ImageIcon className="h-4 w-4 shrink-0 text-blue-400" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
            )}
            <h2 className="truncate text-sm font-semibold">{file.file_name}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open / download
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex max-h-[78vh] min-h-75 flex-1 items-center justify-center overflow-auto bg-slate-100 p-4">
          {kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element -- a signed link to the API, not a static asset
            <img src={url} alt={file.file_name} className="max-h-[74vh] max-w-full object-contain" />
          )}
          {kind === "pdf" && (
            <iframe src={url} title={file.file_name} className="h-[72vh] w-full border border-slate-300 bg-white" />
          )}
          {kind === "video" && <video src={url} controls className="max-h-[72vh] max-w-full" />}
          {kind === "csv" && (
            <div className="h-[72vh] w-full overflow-auto border border-slate-200 bg-white p-4">
              {!csv ? (
                <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
              ) : csv.error ? (
                <p className="py-10 text-center text-slate-400">{csv.error} Use &quot;Open / download&quot; above.</p>
              ) : csv.rows.length === 0 ? (
                <p className="py-10 text-center text-slate-400">The file is empty.</p>
              ) : (
                <>
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="sticky top-0 border-b border-slate-200 bg-slate-100">
                        {csv.rows[0].map((h, i) => (
                          <th key={i} className="p-2 font-bold text-slate-700">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csv.rows.slice(1).map((row, r) => (
                        <tr key={r} className="border-b border-slate-100">
                          {row.map((cell, c) => (
                            <td key={c} className="p-2 text-slate-600">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {csv.rows.length > ui.csv_preview_rows && (
                    <p className="pt-3 text-center text-[12px] text-slate-400">
                      Showing the first {ui.csv_preview_rows} rows. Use &quot;Open / download&quot; for the whole file.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {kind === "other" && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <FileText className="h-10 w-10 text-blue-600" />
              <p className="text-sm text-slate-500">This file can&apos;t be previewed in the browser.</p>
              <a
                href={url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
              >
                <Download className="h-4 w-4" /> Download
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Everything about one of the end user's complaints, on its own page. */
export default function ComplaintDetails({ complaintId }: { complaintId: string }) {
  useDocumentTitle(complaintId);
  const router = useRouter();
  const { ui } = useConfig();
  const [detail, setDetail] = useState<ComplaintDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Attachment | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      api.complaints.get(complaintId).then(
        (loaded) => {
          if (!active) return;
          setDetail(loaded);
          setError(null);
        },
        (err: Error) => active && setError(err.message),
      );
    load();
    // Stay current while the page is open (staff may reply or change the status).
    const timer = setInterval(() => document.visibilityState === "visible" && load(), ui.complaint_refresh_seconds * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [complaintId, ui.complaint_refresh_seconds]);

  const goBack = () => (window.history.length > 1 ? router.back() : router.push("/dashboard/complaints"));
  // Files sent with replies are shown in the conversation instead.
  const attachments = (detail?.attachments ?? []).filter((a) => a.comment_id === null);

  return (
    <div className="flex-1 bg-white md:min-h-0 md:overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 pb-8 pt-4 md:gap-5 md:px-8 md:py-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#0b1a3f] shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-transform active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-[17px] font-bold text-[#0b1a3f]">Complaint details</h1>
        </div>

        {error && !detail ? (
          <div className={`${CARD} p-6 text-center`}>
            <p className="text-[15px] font-semibold text-[#0b1a3f]">We couldn&apos;t open this complaint</p>
            <p className="mt-1 text-[13px] text-slate-500">{error}</p>
            <Link href="/dashboard/complaints" className="mt-4 inline-block text-[14px] font-semibold text-blue-600">
              Back to my complaints
            </Link>
          </div>
        ) : !detail ? (
          <div className={`${CARD} animate-pulse space-y-3 p-5`} aria-hidden="true">
            <div className="h-5 w-1/3 rounded bg-slate-200" />
            <div className="h-6 w-2/3 rounded bg-slate-200" />
            <div className="h-4 w-1/2 rounded bg-slate-100" />
          </div>
        ) : (
          <>
            {error && (
              <p role="alert" className={`${CARD} p-3 text-[13px] text-red-600`}>
                {error}
              </p>
            )}
            <section className={`${CARD} p-5 md:p-6`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#0b1a3f] px-3 py-1 font-mono text-[12px] font-bold text-white">
                  {detail.id}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-[12px] font-semibold ${GROUP_PILLS[detail.status_group].className}`}
                >
                  {detail.status_label}
                </span>
                <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${TONE_PILLS[detail.priority.tone]}`}>
                  {detail.priority.name} priority
                </span>
              </div>
              <h2 className="mt-3 text-[22px] font-extrabold leading-tight text-[#0b1a3f] wrap-break-word md:text-[26px]">
                {detail.title}
              </h2>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  {detail.department}
                  {detail.category && <span className="text-slate-400">· {detail.category}</span>}
                </span>
                <span className="flex items-center gap-1.5" title={detail.location_detail.label}>
                  <MapPin className="h-4 w-4 text-slate-400" aria-hidden="true" /> {shortPlace(detail.location_detail)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-slate-400" aria-hidden="true" /> {formatDateTime(detail.created_at)}
                </span>
              </div>
            </section>

            <section className={`${CARD} p-5 md:p-6`}>
              <h3 className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Description</h3>
              <p className="mt-2 whitespace-pre-wrap text-[14.5px] leading-relaxed text-slate-700 wrap-break-word">
                {detail.description}
              </p>
              {detail.additional_details && (
                <p className="mt-3 text-[13px] text-slate-500">
                  <span className="font-semibold text-slate-600">More about the place: </span>
                  {detail.additional_details}
                </p>
              )}
            </section>

            <section className={`${CARD} p-5 md:p-6`}>
              <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-slate-400">
                <Paperclip className="h-4 w-4 text-blue-600" aria-hidden="true" /> Photos &amp; documents ({attachments.length})
              </h3>
              {attachments.length ? (
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                  {attachments.map((file) => {
                    const kind = fileKind(file);
                    const tile = kind === "image" ? null : KIND_TILES[kind];
                    return (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => setPreview(file)}
                        className="group overflow-hidden rounded-xl border border-slate-200 text-left transition hover:border-blue-400 hover:shadow-md"
                      >
                        {tile ? (
                          <span className={`flex h-28 flex-col items-center justify-center gap-2 ${tile.tone}`}>
                            <tile.icon className="h-7 w-7" aria-hidden="true" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{tile.label}</span>
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element -- a signed link to the API, not a static asset
                          <img src={attachmentUrl(file)} alt={file.file_name} className="h-28 w-full object-cover" />
                        )}
                        <span className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="min-w-0">
                            <span className="block truncate text-[12px] font-semibold text-slate-700 group-hover:text-blue-600">
                              {file.file_name}
                            </span>
                            {file.file_size !== null && (
                              <span className="block text-[11px] text-slate-400">{formatBytes(file.file_size)}</span>
                            )}
                          </span>
                          <Eye className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-blue-600" aria-hidden="true" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 text-[13px] italic text-slate-400">No photos or documents were attached.</p>
              )}
            </section>

            <section className={`${CARD} overflow-hidden`}>
              <ComplaintActivity detail={detail} onUpdate={setDetail} />
            </section>
          </>
        )}
      </div>

      {preview && <Preview file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
