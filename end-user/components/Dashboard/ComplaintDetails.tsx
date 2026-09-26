"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2, Calendar, ChevronLeft, Download, ExternalLink, Eye, FileCheck, FileText,
  Image as ImageIcon, MapPin, Paperclip, Table, Video, X,
} from "lucide-react";
import { apis, Attachment, BACKEND_URL, ComplaintDetail } from "@/lib/apis";
import { formatDateTime, getPriorityStyles, getStatusStyles, shortPlace } from "@/lib/utils";
import ComplaintActivity from "./ComplaintActivity";

type FileKind = "image" | "pdf" | "csv" | "video" | "other";

const CARD = "rounded-2xl bg-white shadow-[0_2px_14px_-6px_rgba(15,23,42,0.12)]";

function fileUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `${BACKEND_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

function fileKind(file: Attachment): FileKind {
  const type = (file.file_type || "").toLowerCase();
  const name = (file.file_name || file.file_path || "").toLowerCase();
  if (type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|bmp)$/.test(name)) return "image";
  if (type.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (type.includes("csv") || name.endsWith(".csv")) return "csv";
  if (type.startsWith("video/") || /\.(mp4|webm|ogg|mov)$/.test(name)) return "video";
  return "other";
}

const KIND_TILES: Record<Exclude<FileKind, "image">, { icon: typeof FileText; label: string; tone: string }> = {
  pdf: { icon: FileText, label: "PDF Document", tone: "bg-red-50 text-red-600" },
  csv: { icon: Table, label: "CSV Spreadsheet", tone: "bg-emerald-50 text-emerald-600" },
  video: { icon: Video, label: "Video Recording", tone: "bg-purple-50 text-purple-600" },
  other: { icon: FileCheck, label: "Document", tone: "bg-slate-100 text-slate-600" },
};

/** Everything about one of the end user's complaints, on its own page. */
export default function ComplaintDetails({ complaintId }: { complaintId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ComplaintDetail | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ url: string; name: string; kind: FileKind } | null>(null);
  const [csv, setCsv] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [loadingCsv, setLoadingCsv] = useState(false);

  useEffect(() => {
    apis.complaints
      .getComplaint(complaintId)
      .then(setDetail)
      .catch((err: Error) => setError(err.message || "Complaint not found"));
  }, [complaintId]);

  // Escape closes the file preview
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPreview(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const goBack = () => (window.history.length > 1 ? router.back() : router.push("/dashboard/complaints"));

  const openPreview = async (file: Attachment) => {
    const kind = fileKind(file);
    const url = fileUrl(file.file_path);
    setPreview({ url, name: file.file_name || "Attachment", kind });
    if (kind !== "csv") return;
    setLoadingCsv(true);
    setCsv(null);
    try {
      const lines = (await (await fetch(url)).text()).split("\n").map((l) => l.trim()).filter(Boolean);
      const cells = (line: string) => line.split(",").map((c) => c.replace(/^"|"$/g, ""));
      if (lines.length) setCsv({ headers: cells(lines[0]), rows: lines.slice(1, 25).map(cells) });
    } catch (err) {
      console.error("Failed to parse CSV", err);
    } finally {
      setLoadingCsv(false);
    }
  };

  // Files sent with replies are shown in the conversation instead.
  const attachments = (detail?.attachments ?? []).filter((a) => a.comment_id === null);

  return (
    <div className="flex-1 bg-gradient-to-b from-[#e5effd] via-[#f0f5fd] to-slate-50 md:min-h-0 md:overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pb-8 pt-4 md:gap-5 md:px-8 md:py-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#0b1a3f] shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-transform active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-[17px] font-bold text-[#0b1a3f]">Complaint Details</h1>
        </div>

        {error ? (
          <div className={`${CARD} p-6 text-center`}>
            <p className="text-[15px] font-semibold text-[#0b1a3f]">We couldn&apos;t open this complaint</p>
            <p className="mt-1 text-[13px] text-slate-500">{error}</p>
            <Link href="/dashboard/complaints" className="mt-4 inline-block text-[14px] font-semibold text-blue-600">
              Back to My Complaints
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
            <section className={`${CARD} p-5 md:p-6`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#0b1a3f] px-3 py-1 font-mono text-[12px] font-bold text-white">
                  {detail.generated_id}
                </span>
                <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${getStatusStyles(detail.status)}`}>
                  {detail.status_label}
                </span>
                <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${getPriorityStyles(detail.priority)}`}>
                  {detail.priority} Priority
                </span>
              </div>
              <h2 className="mt-3 text-[22px] font-extrabold leading-tight text-[#0b1a3f] md:text-[26px]">
                {detail.title}
              </h2>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  {detail.department}
                  {detail.category && <span className="text-slate-400">· {detail.category}</span>}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-slate-400" /> {shortPlace(detail)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-slate-400" /> {formatDateTime(detail.created_at)}
                </span>
              </div>
            </section>

            <section className={`${CARD} p-5 md:p-6`}>
              <h3 className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Description</h3>
              <p className="mt-2 whitespace-pre-wrap text-[14.5px] leading-relaxed text-slate-700">{detail.description}</p>
              {detail.additional_details && (
                <p className="mt-3 text-[13px] text-slate-500">
                  <span className="font-semibold text-slate-600">Landmark / details: </span>
                  {detail.additional_details}
                </p>
              )}
            </section>

            <section className={`${CARD} p-5 md:p-6`}>
              <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-slate-400">
                <Paperclip className="h-4 w-4 text-blue-600" /> Photos &amp; documents ({attachments.length})
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
                        onClick={() => openPreview(file)}
                        className="group overflow-hidden rounded-xl border border-slate-200 text-left transition hover:border-blue-400 hover:shadow-md"
                      >
                        {tile ? (
                          <span className={`flex h-28 flex-col items-center justify-center gap-2 ${tile.tone}`}>
                            <tile.icon className="h-7 w-7" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{tile.label}</span>
                          </span>
                        ) : (
                          <img src={fileUrl(file.file_path)} alt={file.file_name} className="h-28 w-full object-cover" />
                        )}
                        <span className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="truncate text-[12px] font-semibold text-slate-700 group-hover:text-blue-600">
                            {file.file_name}
                          </span>
                          <Eye className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-blue-600" />
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
              <ComplaintActivity complaintId={detail.id} initialDetail={detail} onUpdate={setDetail} />
            </section>
          </>
        )}
      </div>

      {preview && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md sm:p-6">
          <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 bg-slate-900 p-4 text-white">
              <div className="flex min-w-0 items-center gap-2">
                {preview.kind === "image" && <ImageIcon className="h-4 w-4 shrink-0 text-blue-400" />}
                {preview.kind === "pdf" && <FileText className="h-4 w-4 shrink-0 text-red-400" />}
                {preview.kind === "csv" && <Table className="h-4 w-4 shrink-0 text-emerald-400" />}
                {preview.kind === "video" && <Video className="h-4 w-4 shrink-0 text-purple-400" />}
                <h4 className="truncate text-sm font-semibold">{preview.name}</h4>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open / Download
                </a>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  aria-label="Close preview"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex max-h-[78vh] min-h-[300px] flex-1 items-center justify-center overflow-auto bg-slate-100 p-4">
              {preview.kind === "image" && (
                <img src={preview.url} alt={preview.name} className="max-h-[74vh] max-w-full object-contain" />
              )}
              {preview.kind === "pdf" && (
                <iframe src={preview.url} title={preview.name} className="h-[72vh] w-full border border-slate-300 bg-white" />
              )}
              {preview.kind === "video" && (
                <video src={preview.url} controls autoPlay className="max-h-[72vh] max-w-full" />
              )}
              {preview.kind === "csv" && (
                <div className="h-[72vh] w-full overflow-auto border border-slate-200 bg-white p-4">
                  {loadingCsv ? (
                    <p className="py-10 text-center text-sm text-slate-400">Loading spreadsheet data...</p>
                  ) : csv?.headers.length ? (
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="sticky top-0 border-b border-slate-200 bg-slate-100">
                          {csv.headers.map((h, i) => (
                            <th key={i} className="p-2 font-bold text-slate-700">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csv.rows.map((row, r) => (
                          <tr key={r} className="border-b border-slate-100">
                            {row.map((cell, c) => (
                              <td key={c} className="p-2 text-slate-600">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="py-10 text-center text-slate-400">
                      Could not display a preview. Use &quot;Open / Download&quot; above.
                    </p>
                  )}
                </div>
              )}
              {preview.kind === "other" && (
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                  <FileText className="h-10 w-10 text-blue-600" />
                  <p className="text-sm text-slate-500">This file type can&apos;t be previewed in the browser.</p>
                  <a
                    href={preview.url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                  >
                    <Download className="h-4 w-4" /> Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
