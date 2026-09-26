"use client";

import React, { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Paperclip, Send, Lock, MapPin, UserCircle2, Star, Wand2, History, MessageSquare, Timer, ArrowUpCircle,
} from "lucide-react";
import { api, Attachment, BACKEND_URL, ComplaintDetail, WorkflowAction } from "@/lib/api";
import { useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { PRIORITY_BADGE, SLA_BADGE, STATUS_BADGE } from "@/lib/status";
import { RequirePermission } from "@/components/RequirePermission";
import { RejectionPanel } from "@/components/RejectionPanel";
import {
  Card, ErrorBanner, Field, formatDateTime, inputClass, primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";

type Update = (detail: ComplaintDetail) => void;

function AttachmentLinks({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {attachments.map((a) => (
        <a
          key={a.id}
          href={`${BACKEND_URL}${a.file_path}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-[11px] text-slate-600 hover:text-blue-600"
        >
          <Paperclip className="w-3 h-3" />
          {a.file_name}
        </a>
      ))}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-slate-400 font-medium">{label}</div>
      <div className="text-xs font-semibold text-slate-800 mt-0.5">{children}</div>
    </div>
  );
}

/** Workflow buttons. Actions that need a note open a small form first. */
function ActionsPanel({ detail, onUpdate }: { detail: ComplaintDetail; onUpdate: Update }) {
  const [pending, setPending] = useState<WorkflowAction | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: WorkflowAction, text?: string) => {
    setBusy(true);
    setError(null);
    try {
      onUpdate(await api.complaints.act(detail.id, action.key, text));
      setPending(null);
      setNote("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (detail.actions.length === 0) {
    return <p className="text-xs text-slate-400">No workflow actions available to you for this complaint.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {detail.actions.map((action) => (
          <button
            key={action.key}
            disabled={busy}
            onClick={() => {
              setError(null);
              setPending(pending?.key === action.key ? null : action);
            }}
            className={
              action.key === "reject"
                ? "inline-flex items-center px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50 cursor-pointer"
                : pending?.key === action.key
                  ? primaryButtonClass
                  : secondaryButtonClass
            }
          >
            {action.label}
          </button>
        ))}
      </div>
      {pending && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(pending, note);
          }}
        >
          <Field label={pending.note_label}>
            <textarea
              rows={3}
              required={pending.note === "required"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryButtonClass} onClick={() => setPending(null)}>
              Cancel
            </button>
            <button type="submit" className={primaryButtonClass} disabled={busy}>
              {busy ? "Saving..." : pending.label}
            </button>
          </div>
        </form>
      )}
      <ErrorBanner message={error} />
    </div>
  );
}

function SlaClock({ label, state, due }: { label: string; state: string | null; due: string | null }) {
  if (!state) return null;
  const badge = SLA_BADGE[state];
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <div className="text-[11px] text-slate-400 font-medium">{label}</div>
        <div className="text-xs font-semibold text-slate-800">
          {state === "met" || state === "met_late" ? "Done" : `Due ${formatDateTime(due)}`}
        </div>
      </div>
      {badge && <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>}
    </div>
  );
}

function SlaPanel({ detail }: { detail: ComplaintDetail }) {
  return (
    <div className="space-y-3">
      <SlaClock label="First response" state={detail.sla.response} due={detail.sla_due.response_due_at} />
      <SlaClock label="Resolution" state={detail.sla.resolution} due={detail.sla_due.resolution_due_at} />
      {detail.sla_paused && (
        <p className="text-[11px] text-violet-700">The resolution clock is paused while waiting for the end user.</p>
      )}
      {detail.escalation && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-rose-800">
            <ArrowUpCircle className="w-4 h-4" /> Escalated (level {detail.escalation.level})
          </div>
          <div className="text-rose-900 mt-1">
            {detail.escalation.to.name} ({detail.escalation.to.role}) is accountable for the missed{" "}
            {detail.escalation.type} target.
          </div>
          <div className="text-[11px] text-rose-700 mt-1">
            {detail.escalation.next_at
              ? `Escalates further ${formatDateTime(detail.escalation.next_at)} unless handled.`
              : "Top of the escalation chain reached."}
          </div>
        </div>
      )}
      {detail.escalations.length > 0 && (
        <details className="text-[11px] text-slate-500">
          <summary className="cursor-pointer font-semibold text-slate-600">Escalation history</summary>
          <ul className="mt-2 space-y-1.5">
            {detail.escalations.map((e, i) => (
              <li key={i}>
                L{e.level} {e.type}: {e.from} → <span className="font-semibold text-slate-700">{e.to ?? "nobody"}</span> ·{" "}
                {formatDateTime(e.created_at)}
                {e.resolved_at && <span className="text-emerald-600"> · handled {formatDateTime(e.resolved_at)}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function AssignmentPanel({ detail, onUpdate }: { detail: ComplaintDetail; onUpdate: Update }) {
  const { can } = useSession();
  const { data: options = [] } = useApiData(
    () => (detail.can_assign ? api.complaints.assigneeOptions(detail.id) : Promise.resolve([])),
    [detail.id, detail.can_assign, detail.assignee?.id ?? null],
  );
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (call: () => Promise<ComplaintDetail>) => {
    setBusy(true);
    setError(null);
    try {
      onUpdate(await call());
      setAssigneeId(null);
      setReason("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <UserCircle2 className="w-8 h-8 text-slate-300" />
        {detail.assignee ? (
          <div>
            <div className="text-xs font-bold text-slate-800">{detail.assignee.name}</div>
            <div className="text-[11px] text-slate-400">
              {detail.assignee.role} · since {formatDateTime(detail.assigned_at)}
            </div>
          </div>
        ) : (
          <div className="text-xs font-semibold text-rose-600">Unassigned: waiting in the department queue</div>
        )}
      </div>

      {detail.can_assign && (
        <div className="space-y-2">
          <select
            className={inputClass}
            value={assigneeId ?? ""}
            onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{detail.assignee ? "Reassign to..." : "Assign to..."}</option>
            {options
              .filter((o) => !o.is_current)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.role}) · {o.workload} open{o.is_available ? "" : " · on leave"}
                </option>
              ))}
          </select>
          {assigneeId !== null && (
            <input
              className={inputClass}
              placeholder="Reason (optional, kept internal)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
          <div className="flex gap-2">
            <button
              className={primaryButtonClass}
              disabled={assigneeId === null || busy}
              onClick={() => assigneeId !== null && run(() => api.complaints.assign(detail.id, assigneeId, reason))}
            >
              {detail.assignee ? "Reassign" : "Assign"}
            </button>
            {!detail.assignee && can("complaint.assign") && (
              <button
                className={secondaryButtonClass}
                disabled={busy}
                onClick={() => run(() => api.complaints.autoAssign(detail.id))}
                title="Run the routing engine again"
              >
                <Wand2 className="w-3.5 h-3.5" /> Auto-assign
              </button>
            )}
          </div>
          {options.length === 0 && (
            <p className="text-[11px] text-slate-400">Nobody under you covers this department and location.</p>
          )}
        </div>
      )}
      <ErrorBanner message={error} />

      {detail.assignments.length > 0 && (
        <details className="text-[11px] text-slate-500">
          <summary className="cursor-pointer font-semibold text-slate-600">Assignment history</summary>
          <ul className="mt-2 space-y-1.5">
            {detail.assignments.map((a, i) => (
              <li key={i}>
                <span className="font-semibold text-slate-700">{a.assignee.name}</span> ·{" "}
                {a.method === "auto" ? "routing engine" : `by ${a.assigned_by}`} · {formatDateTime(a.assigned_at)}
                {a.ended_at ? ` → ${formatDateTime(a.ended_at)}` : " (current)"}
                {a.reason && <div className="text-slate-400">{a.reason}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Conversation({ detail, onUpdate }: { detail: ComplaintDetail; onUpdate: Update }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onUpdate(await api.complaints.comment(detail.id, body, internal, files));
      setBody("");
      setFiles([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {detail.comments.length === 0 && <p className="text-xs text-slate-400">No messages yet.</p>}
      {detail.comments.map((c) => (
        <div
          key={c.id}
          className={`p-3 rounded-xl text-xs border ${
            c.is_internal
              ? "bg-amber-50/60 border-amber-100"
              : c.author_type === "end_user"
                ? "bg-slate-50 border-slate-100 mr-10"
                : "bg-blue-50/60 border-blue-100 ml-10"
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-semibold text-slate-800">
              {c.author_name}
              {c.author_type === "end_user" && <span className="text-slate-400 font-normal"> · end user</span>}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              {c.is_internal && (
                <span className="inline-flex items-center gap-0.5 text-amber-700 font-semibold">
                  <Lock className="w-3 h-3" /> internal
                </span>
              )}
              {formatDateTime(c.created_at)}
            </span>
          </div>
          <p className="text-slate-700 whitespace-pre-wrap">{c.body}</p>
          <AttachmentLinks attachments={c.attachments} />
        </div>
      ))}

      {detail.can_comment && (
        <form onSubmit={send} className="space-y-2 pt-2 border-t border-slate-100">
          <textarea
            rows={3}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={internal ? "Internal note for staff only..." : "Reply to the end user..."}
            className={`w-full p-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
              internal ? "border-amber-200 bg-amber-50/40" : "border-slate-200"
            }`}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                Internal note
              </label>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.csv,.doc,.docx,video/mp4"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
              <button type="button" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 cursor-pointer" onClick={() => fileInput.current?.click()}>
                <Paperclip className="w-3.5 h-3.5" />
                {files.length ? `${files.length} file${files.length > 1 ? "s" : ""}` : "Attach"}
              </button>
            </div>
            <button type="submit" className={primaryButtonClass} disabled={busy}>
              <Send className="w-3.5 h-3.5" /> {busy ? "Sending..." : internal ? "Add Note" : "Send Reply"}
            </button>
          </div>
          <ErrorBanner message={error} />
        </form>
      )}
    </div>
  );
}

function Timeline({ detail }: { detail: ComplaintDetail }) {
  return (
    <ol className="relative border-l border-slate-200 ml-2 space-y-4">
      {[...detail.timeline].reverse().map((e) => (
        <li key={e.id} className="relative ml-4">
          <span
            className={`absolute -left-[22px] top-0.5 w-3 h-3 rounded-full border-2 border-white ${e.public ? "bg-blue-500" : "bg-slate-300"}`}
          />
          <div className="text-xs text-slate-800">{e.message}</div>
          {e.note && <div className="mt-1 text-[11px] text-slate-600 bg-slate-50 rounded-md px-2 py-1">“{e.note}”</div>}
          <div className="text-[10px] text-slate-400 mt-0.5">
            {e.actor_name} · {formatDateTime(e.created_at)}
            {!e.public && " · staff only"}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ComplaintView() {
  const { id } = useParams<{ id: string }>();
  const { data: detail, error, setData } = useApiData(() => api.complaints.get(id), [id]);

  if (error && !detail) return <ErrorBanner message={error} />;
  if (!detail) return <p className="text-xs text-slate-400">Loading complaint...</p>;

  return (
    <>
      <Link href="/complaints" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600">
        <ArrowLeft className="w-3.5 h-3.5" /> All complaints
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">{detail.id}</span>
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${STATUS_BADGE[detail.status]}`}>{detail.status_label}</span>
            <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-md ${PRIORITY_BADGE[detail.priority] ?? ""}`}>
              {detail.priority}
            </span>
            {detail.reopen_count > 0 && (
              <span className="text-[11px] text-orange-600 font-semibold">Reopened {detail.reopen_count}×</span>
            )}
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 mt-2">{detail.title}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 space-y-5">
          <Card className="p-5 space-y-2">
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{detail.description}</p>
            {detail.additional_details && <p className="text-xs text-slate-500">{detail.additional_details}</p>}
            <AttachmentLinks attachments={detail.attachments.filter((a) => a.comment_id === null)} />
            {detail.resolution_note && (
              <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs">
                <div className="font-semibold text-emerald-800">Resolution</div>
                <p className="text-emerald-900 mt-0.5">{detail.resolution_note}</p>
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-800">Actions</h3>
            <ActionsPanel detail={detail} onUpdate={setData} />
            <RejectionPanel detail={detail} onUpdate={setData} />
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-slate-400" /> Conversation
            </h3>
            <Conversation detail={detail} onUpdate={setData} />
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-5">
          <Card className="p-5 grid grid-cols-2 gap-4">
            <DetailRow label="Department">{detail.department}</DetailRow>
            <DetailRow label="Category">{detail.category ?? "—"}</DetailRow>
            <div className="col-span-2">
              <DetailRow label="Location">
                <span className="flex items-start gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  {detail.location_detail?.label ?? detail.location}
                </span>
              </DetailRow>
            </div>
            <DetailRow label="End User">{detail.end_user_name ?? "—"}</DetailRow>
            <DetailRow label="Contact">{detail.end_user?.mobile ?? detail.end_user_phone ?? "—"}</DetailRow>
            <DetailRow label="Registered">{formatDateTime(detail.created_at)}</DetailRow>
            <DetailRow label="First response">{formatDateTime(detail.acknowledged_at)}</DetailRow>
            <DetailRow label="Resolved">{formatDateTime(detail.resolved_at)}</DetailRow>
            <DetailRow label="Closed">{formatDateTime(detail.closed_at)}</DetailRow>
            {detail.feedback_rating !== null && (
              <div className="col-span-2">
                <DetailRow label="End user feedback">
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`w-3.5 h-3.5 ${n <= (detail.feedback_rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-slate-200"}`}
                      />
                    ))}
                  </span>
                  {detail.feedback_comment && <span className="block font-normal text-slate-600 mt-1">{detail.feedback_comment}</span>}
                </DetailRow>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-slate-400" /> SLA
            </h3>
            <SlaPanel detail={detail} />
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Assignment</h3>
            <AssignmentPanel detail={detail} onUpdate={setData} />
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
              <History className="w-4 h-4 text-slate-400" /> Timeline
            </h3>
            <Timeline detail={detail} />
          </Card>
        </div>
      </div>
    </>
  );
}

export default function ComplaintPage() {
  return (
    <RequirePermission anyOf={["complaint.view"]}>
      <Suspense>
        <ComplaintView />
      </Suspense>
    </RequirePermission>
  );
}
