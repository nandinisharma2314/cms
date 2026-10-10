"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpCircle,
  ChevronRight,
  History,
  Lock,
  MapPin,
  MessageSquare,
  Paperclip,
  PencilLine,
  Send,
  Star,
  Timer,
  UserCircle2,
  Wand2,
} from "lucide-react";
import { api, Attachment, attachmentUrl, ComplaintDetail, PotentialDuplicate, SlaState, WorkflowAction } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { formatBytes, formatDateTime } from "@/lib/format";
import { attachmentProblem } from "@/lib/attachments";
import { useAction, useApiData } from "@/lib/hooks";
import { coversDepartment, treeInScope } from "@/lib/scope";
import { useSession } from "@/lib/session";
import { SLA_BADGE } from "@/lib/status";
import { findPath, LocationPicker } from "@/components/LocationPicker";
import { RejectionPanel } from "@/components/RejectionPanel";
import { RequirePermission } from "@/components/RequirePermission";
import {
  Card,
  ErrorBanner,
  Field,
  inputClass,
  primaryButtonClass,
  PriorityBadge,
  secondaryButtonClass,
  Spinner,
  StatusBadge,
  textareaClass,
  tabClass,
} from "@/components/ui";

type Update = (detail: ComplaintDetail) => void;

function AttachmentLinks({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {attachments.map((a) => (
        <a
          key={a.id}
          href={attachmentUrl(a)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-[11px] text-slate-600 hover:text-blue-600"
        >
          <Paperclip className="w-3 h-3" aria-hidden="true" />
          {a.file_name}
          {a.file_size !== null && <span className="text-slate-400">{formatBytes(a.file_size)}</span>}
        </a>
      ))}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-slate-400 font-medium">{label}</div>
      <div className="text-xs font-semibold text-slate-800 mt-0.5 wrap-break-word">{children}</div>
    </div>
  );
}

function PotentialDuplicatesPanel({ complaintId }: { complaintId: string | number }) {
  const { data: duplicates } = useApiData<PotentialDuplicate[]>(
    () => api.complaints.potentialDuplicates(complaintId),
    [complaintId],
  );

  if (!duplicates || duplicates.length === 0) return null;

  return (
    <Card className="p-4 rounded-2xl border-amber-200 bg-amber-50/50 space-y-2.5 shadow-2xs">
      <div className="flex items-center gap-2 text-amber-900">
        <span className="text-base">⚠️</span>
        <h3 className="text-xs font-bold uppercase tracking-wider">Potential Duplicate Tickets Detected ({duplicates.length})</h3>
      </div>
      <p className="text-[11px] text-slate-600 leading-relaxed">
        Similar open complaints exist in this department. Review before dispatching duplicate staff:
      </p>
      <div className="space-y-2">
        {duplicates.map((d) => (
          <div
            key={d.id}
            className="p-2.5 rounded-xl bg-white border border-amber-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-2"
          >
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/complaints/${encodeURIComponent(d.generated_id)}`}
                  className="font-mono text-xs font-bold text-blue-600 hover:underline"
                >
                  {d.generated_id}
                </Link>
                <span className="text-xs font-semibold text-slate-800 truncate max-w-xs">{d.title}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {d.location_name ? `${d.location_name} • ` : ""}Status: {d.status}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                {d.similarity_score}% Match
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Workflow buttons. Actions that take a note (and rejecting, which takes a reason) open a form first. */
function ActionsPanel({ detail, onUpdate }: { detail: ComplaintDetail; onUpdate: Update }) {
  const { limits } = useConfig();
  const [pending, setPending] = useState<WorkflowAction | null>(null);
  const [note, setNote] = useState("");
  const [reasonId, setReasonId] = useState<number | null>(null);
  const { busy, error, setError, run } = useAction();
  const reasons = detail.rejection.reasons;

  if (detail.actions.length === 0) {
    return <p className="text-xs text-slate-400">No workflow actions are available to you for this complaint right now.</p>;
  }
  return (
    <div className="space-y-3 max-w-full">
      <select
        className={`${inputClass} w-full max-w-full truncate`}
        disabled={busy}
        value={pending?.key ?? ""}
        onChange={(e) => {
          setError(null);
          setPending(e.target.value ? detail.actions.find((a) => a.key === e.target.value)! : null);
        }}
      >
        <option value="">Select a workflow action...</option>
        {detail.actions.map((action) => (
          <option key={action.key} value={action.key}>
            {action.label}
          </option>
        ))}
      </select>
      {pending && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              onUpdate(
                await api.complaints.act(detail.id, pending.key, note.trim() || null, pending.key === "reject" ? reasonId : null),
              );
              setPending(null);
              setNote("");
              setReasonId(null);
            });
          }}
        >
          {pending.key === "reject" &&
            (reasons.length === 0 ? (
              <ErrorBanner message="No rejection reasons are set up yet. Ask the Super Admin to add them under Settings." />
            ) : (
              <Field label="Reason">
                <select
                  required
                  className={inputClass}
                  value={reasonId ?? ""}
                  onChange={(e) => setReasonId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Choose…</option>
                  {reasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          <Field label={pending.note_label}>
            <textarea
              rows={3}
              required={pending.note === "required"}
              maxLength={limits.note}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={textareaClass}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryButtonClass} onClick={() => setPending(null)}>
              Cancel
            </button>
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={busy || (pending.key === "reject" && reasons.length === 0)}
            >
              {busy ? "Saving…" : pending.label}
            </button>
          </div>
        </form>
      )}
      <ErrorBanner message={error} />
    </div>
  );
}

function ReclassifyPanel({ detail, onUpdate }: { detail: ComplaintDetail; onUpdate: Update }) {
  const { me } = useSession();
  const { limits } = useConfig();
  const [open, setOpen] = useState(false);
  const { data: options, error: loadError } = useApiData(
    () => (open ? api.complaints.classificationOptions() : Promise.resolve(undefined)),
    [open],
  );
  const [departmentId, setDepartmentId] = useState(detail.department_id);
  const [categoryId, setCategoryId] = useState<number | null>(detail.category_id);
  const [locationId, setLocationId] = useState<number | null>(detail.location_detail.id);
  const [priorityId, setPriorityId] = useState(detail.priority.id);
  const [reason, setReason] = useState("");
  const { busy, error, run } = useAction();

  const departments = useMemo(() => (options?.departments ?? []).filter((d) => coversDepartment(me, d.id)), [options, me]);
  const department = departments.find((d) => d.id === departmentId);
  const tree = useMemo(() => treeInScope(options?.locations ?? [], me, departmentId), [options, me, departmentId]);

  if (!open) {
    return (
      <button
        className={`${secondaryButtonClass} w-full flex items-center justify-center whitespace-normal text-center h-auto`}
        onClick={() => setOpen(true)}
      >
        <PencilLine className="w-3.5 h-3.5 shrink-0" />{" "}
        <span className="flex-1">Change department, category, location or priority</span>
      </button>
    );
  }
  return (
    <form
      className="space-y-3 p-3 rounded-xl border border-slate-200 bg-slate-50/60"
      onSubmit={(e) => {
        e.preventDefault();
        if (categoryId === null || locationId === null) return;
        run(async () => {
          onUpdate(
            await api.complaints.reclassify(detail.id, {
              department_id: departmentId,
              category_id: categoryId,
              location_id: locationId,
              priority_id: priorityId,
              reason,
            }),
          );
          setOpen(false);
          setReason("");
        });
      }}
    >
      <p className="text-[11px] text-slate-500">
        The SLA clocks move by the difference in targets, and the complaint goes to someone else if its handler no longer covers
        it. The end user sees the new department, location or priority, not your reason.
      </p>
      <ErrorBanner message={loadError} />
      {!options ? (
        !loadError && <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Department">
              <select
                className={inputClass}
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(Number(e.target.value));
                  setCategoryId(null);
                }}
              >
                {!department && departmentId === detail.department_id && (
                  <option value={detail.department_id}>{detail.department} (inactive)</option>
                )}
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select
                required
                className={inputClass}
                value={categoryId ?? ""}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  setCategoryId(id);
                  const chosen = department?.categories.find((c) => c.id === id);
                  if (chosen) setPriorityId(chosen.default_priority.id);
                }}
              >
                <option value="">Choose…</option>
                {categoryId !== null &&
                  categoryId === detail.category_id &&
                  !department?.categories.some((c) => c.id === categoryId) && (
                    <option value={categoryId}>{detail.category} (inactive)</option>
                  )}
                {department?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select className={inputClass} value={priorityId} onChange={(e) => setPriorityId(Number(e.target.value))}>
                {priorityId === detail.priority.id && !options.priorities.some((p) => p.id === priorityId) && (
                  <option value={priorityId}>{detail.priority.name} (inactive)</option>
                )}
                {options.priorities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            label="Location"
            hint={
              locationId === detail.location_detail.id && findPath(tree, locationId).length === 0
                ? `Currently ${detail.location}, which is no longer offered; choose a location only to change it.`
                : undefined
            }
          >
            <LocationPicker value={locationId} onChange={setLocationId} />
          </Field>
          <Field label="Reason for the change (kept on the internal timeline)">
            <textarea
              required
              rows={2}
              maxLength={limits.note}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={textareaClass}
            />
          </Field>
        </>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className={primaryButtonClass} disabled={busy || !options}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
      <ErrorBanner message={error} />
    </form>
  );
}

function SlaClock({ label, state, due }: { label: string; state: SlaState; due: string | null }) {
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
      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>
    </div>
  );
}

function SlaPanel({ detail }: { detail: ComplaintDetail }) {
  return (
    <div className="space-y-3">
      <SlaClock label="First response" state={detail.sla.response} due={detail.sla_due.response_due_at} />
      <SlaClock label="Resolution" state={detail.sla.resolution} due={detail.sla_due.resolution_due_at} />
      {!detail.sla.response && !detail.sla.resolution && <p className="text-xs text-slate-400">No clock is running.</p>}
      {detail.sla_paused && (
        <p className="text-[11px] text-violet-700">The resolution clock is paused while waiting for the end user.</p>
      )}
      {detail.escalation && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-rose-800">
            <ArrowUpCircle className="w-4 h-4" aria-hidden="true" /> Escalated (level {detail.escalation.level})
          </div>
          <div className="text-rose-900 mt-1">
            {detail.escalation.to.name} ({detail.escalation.to.role}) is accountable for the missed {detail.escalation.type}{" "}
            target.
          </div>
          <div className="text-[11px] text-rose-700 mt-1">
            {detail.escalation.next_at
              ? `Escalates further ${formatDateTime(detail.escalation.next_at)} unless handled.`
              : "The top of the escalation chain has been reached."}
          </div>
        </div>
      )}
      {detail.escalations.length > 0 && (
        <details className="text-[11px] text-slate-500">
          <summary className="cursor-pointer font-semibold text-slate-600">Escalation history</summary>
          <ul className="mt-2 space-y-1.5">
            {detail.escalations.map((e, i) => (
              <li key={i}>
                L{e.level} {e.type}: {e.from ?? "department queue"} →{" "}
                <span className="font-semibold text-slate-700">{e.to ?? "nobody"}</span> · {formatDateTime(e.created_at)}
                {e.resolved_at && <span className="text-emerald-700"> · handled {formatDateTime(e.resolved_at)}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function AssignmentPanel({ detail, onUpdate }: { detail: ComplaintDetail; onUpdate: Update }) {
  const { limits } = useConfig();
  const { can } = useSession();
  const { data: options, error: optionsError } = useApiData(
    () => (detail.can_assign ? api.complaints.assigneeOptions(detail.id) : Promise.resolve([])),
    [detail.id, detail.can_assign, detail.assignee?.id ?? null],
  );
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const { busy, error, run } = useAction();
  const candidates = (options ?? []).filter((o) => !o.is_current);

  const act = (call: () => Promise<ComplaintDetail>) =>
    run(async () => {
      onUpdate(await call());
      setAssigneeId(null);
      setReason("");
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <UserCircle2 className="w-8 h-8 text-slate-300 shrink-0" aria-hidden="true" />
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
            aria-label="Assign to"
            value={assigneeId ?? ""}
            onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{detail.assignee ? "Reassign to…" : "Assign to…"}</option>
            {candidates.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.role}) · {o.workload} open{o.is_available ? "" : " · unavailable"}
              </option>
            ))}
          </select>
          {assigneeId !== null && (
            <input
              className={inputClass}
              maxLength={limits.assignment_reason}
              placeholder="Reason (optional, internal)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className={primaryButtonClass}
              disabled={assigneeId === null || busy}
              onClick={() =>
                assigneeId !== null && act(() => api.complaints.assign(detail.id, assigneeId, reason.trim() || null))
              }
            >
              {detail.assignee ? "Reassign" : "Assign"}
            </button>
            {!detail.assignee && can("complaint.assign") && (
              <button
                className={secondaryButtonClass}
                disabled={busy}
                onClick={() => act(() => api.complaints.autoAssign(detail.id))}
              >
                <Wand2 className="w-3.5 h-3.5" /> Route automatically
              </button>
            )}
          </div>
          {options && candidates.length === 0 && (
            <p className="text-[11px] text-slate-400">Nobody under you covers this department and location.</p>
          )}
        </div>
      )}
      <ErrorBanner message={optionsError ?? error} />

      {detail.assignments.length > 0 && (
        <details className="text-[11px] text-slate-500">
          <summary className="cursor-pointer font-semibold text-slate-600">Assignment history</summary>
          <ul className="mt-2 space-y-1.5">
            {detail.assignments.map((a, i) => (
              <li key={i}>
                <span className="font-semibold text-slate-700">{a.assignee.name}</span> ·{" "}
                {a.method === "auto" ? "automatic routing" : `by ${a.assigned_by ?? "the system"}`} ·{" "}
                {formatDateTime(a.assigned_at)}
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
  const { limits, attachments } = useConfig();
  const fileInput = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const { busy, error, setError, run } = useAction();
  const room = attachments.max_per_complaint === null ? null : attachments.max_per_complaint - detail.attachments.length;

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
                ? "bg-slate-50 border-slate-100 sm:mr-10"
                : "bg-blue-50/60 border-blue-100 sm:ml-10"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <span className="font-semibold text-slate-800">
              {c.author_name}
              {c.author_type === "end_user" && <span className="text-slate-400 font-normal"> · end user</span>}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              {c.is_internal && (
                <span className="inline-flex items-center gap-0.5 text-amber-700 font-semibold">
                  <Lock className="w-3 h-3" aria-hidden="true" /> internal
                </span>
              )}
              {formatDateTime(c.created_at)}
            </span>
          </div>
          <p className="text-slate-700 whitespace-pre-wrap wrap-break-word">{c.body}</p>
          <AttachmentLinks attachments={c.attachments} />
        </div>
      ))}

      {detail.can_comment && (
        <form
          className="space-y-2 pt-2 border-t border-slate-100"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              onUpdate(await api.complaints.comment(detail.id, body, internal, files));
              setBody("");
              setFiles([]);
              if (fileInput.current) fileInput.current.value = "";
            });
          }}
        >
          <textarea
            rows={3}
            required
            maxLength={limits.comment}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label={internal ? "Internal note" : "Reply to the end user"}
            placeholder={internal ? "Internal note, for staff only…" : "Reply to the end user…"}
            className={`${textareaClass} ${internal ? "border-amber-200 bg-amber-50/40" : ""}`}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                Internal note
              </label>
              {attachments.allowed_types.length > 0 && room !== null && room > 0 && (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    className="hidden"
                    accept={attachments.allowed_types.map((t) => `.${t}`).join(",")}
                    onChange={(e) => {
                      const picked = Array.from(e.target.files ?? []);
                      const problem = attachmentProblem(picked, room, attachments);
                      setError(problem);
                      setFiles(problem ? [] : picked);
                      if (problem) e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 cursor-pointer"
                    onClick={() => fileInput.current?.click()}
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    {files.length ? `${files.length} file${files.length > 1 ? "s" : ""}` : "Attach"}
                  </button>
                  <span className="text-[10px] text-slate-400">
                    {room} more allowed{attachments.max_mb ? `, up to ${attachments.max_mb} MB each` : ""}
                  </span>
                </>
              )}
            </div>
            <button type="submit" className={primaryButtonClass} disabled={busy}>
              <Send className="w-3.5 h-3.5" /> {busy ? "Sending…" : internal ? "Add note" : "Send reply"}
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
            className={`absolute -left-5.5 top-0.5 w-3 h-3 rounded-full border-2 border-white ${e.public ? "bg-blue-500" : "bg-slate-300"}`}
            aria-hidden="true"
          />
          <div className="text-xs text-slate-800">{e.message}</div>
          {e.note && (
            <div className="mt-1 text-[11px] text-red-600 bg-slate-50 rounded-md px-2 py-1 whitespace-pre-wrap">
              &ldquo;{e.note}&rdquo;
            </div>
          )}
          <div className="text-[10px] text-slate-400 mt-0.5">
            {e.actor_name ?? "System"} · {formatDateTime(e.created_at)}
            {!e.public && " · staff only"}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ComplaintView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const complaintId = decodeURIComponent(id);
  useDocumentTitle(complaintId);
  const { ui } = useConfig();
  const { me } = useSession();
  const { data: detail, error, setData, reload } = useApiData(() => api.complaints.get(complaintId), [complaintId]);
  const [activeTab, setActiveTab] = useState<"details" | "actions" | "conversation">("details");

  // Keep the page current while it is open (others may act on the complaint too).
  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === "visible" && reload(), ui.complaint_refresh_seconds * 1000);
    return () => clearInterval(timer);
  }, [reload, ui.complaint_refresh_seconds]);

  if (error && !detail) return <ErrorBanner message={error} />;
  if (!detail) return <Spinner label="Loading complaint…" />;

  return (
    <>
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">{detail.id}</span>
          <StatusBadge status={detail.status} label={detail.status_label} />
          <PriorityBadge priority={detail.priority} className="text-[11px]" />
          {detail.reopen_count > 0 && (
            <span className="text-[11px] text-orange-700 font-semibold">Reopened {detail.reopen_count}×</span>
          )}
        </div>
        <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 mt-2 wrap-break-word">{detail.title}</h1>
      </div>
      {error && <ErrorBanner message={error} />}

      <div className="flex gap-2 mt-5 mb-5 overflow-x-auto pb-1">
        <button className={tabClass(activeTab === "details")} onClick={() => setActiveTab("details")}>
          Details
        </button>
        <button className={tabClass(activeTab === "actions")} onClick={() => setActiveTab("actions")}>
          Actions & Timeline
        </button>
        <button className={tabClass(activeTab === "conversation")} onClick={() => setActiveTab("conversation")}>
          Conversation
        </button>
      </div>

      {activeTab === "details" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-8 space-y-5">
            <Card className="p-5 space-y-2">
              <p className="text-lg font-bold text-slate-700 leading-relaxed whitespace-pre-wrap wrap-break-word">
                {me.is_super_admin || me.role.key === "admin"
                  ? detail.description
                  : detail.description.replace(/^Reported by .*?:\s*/i, "")}
              </p>
              {detail.additional_details && <p className="text-xs text-slate-500">{detail.additional_details}</p>}
              <AttachmentLinks attachments={detail.attachments.filter((a) => a.comment_id === null)} />
              {detail.resolution_note && (
                <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs">
                  <div className="font-semibold text-emerald-800">Resolution</div>
                  <p className="text-emerald-900 mt-0.5 whitespace-pre-wrap">{detail.resolution_note}</p>
                </div>
              )}
            </Card>

            {detail.status !== "CLOSED" && detail.status !== "RESOLVED" && <PotentialDuplicatesPanel complaintId={detail.id} />}
          </div>

          <div className="lg:col-span-4 space-y-5">
            <Card className="p-5 grid grid-cols-2 gap-4">
              <DetailRow label="Department">{detail.department}</DetailRow>
              <DetailRow label="Category">{detail.category ?? "Not set"}</DetailRow>
              <div className="col-span-2">
                <DetailRow label="Location">
                  <div className="flex items-start gap-1.5 mt-1 rounded-lg">
                    <div className="text-[12px] leading-relaxed text-slate-600">
                      {detail.location_detail.label.split(" > ").map((part, index, array) => (
                        <React.Fragment key={index}>
                          <span className={index === array.length - 1 ? "font-bold text-slate-800" : ""}>{part}</span>
                          {index < array.length - 1 && <span className="mx-1.5 text-slate-300">›</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </DetailRow>
              </div>
              {(me.is_super_admin || me.role.key === "admin") && (
                <>
                  <DetailRow label="Reported by">{detail.end_user?.name ?? detail.end_user_name ?? "—"}</DetailRow>
                  <DetailRow label="Contact">
                    {detail.end_user ? `${detail.end_user.mobile} · ${detail.end_user.email}` : (detail.end_user_phone ?? "—")}
                  </DetailRow>
                </>
              )}
              <DetailRow label="Registered">{formatDateTime(detail.created_at)}</DetailRow>
              <DetailRow label="First response">{formatDateTime(detail.acknowledged_at)}</DetailRow>
              <DetailRow label="Resolved">{formatDateTime(detail.resolved_at)}</DetailRow>
              <DetailRow label="Closed">{formatDateTime(detail.closed_at)}</DetailRow>
              {detail.feedback_rating !== null && (
                <div className="col-span-2">
                  <DetailRow label="End user rating">
                    <span className="flex items-center gap-0.5" aria-label={`${detail.feedback_rating} out of 5`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={`w-3.5 h-3.5 ${n <= (detail.feedback_rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-slate-200"}`}
                          aria-hidden="true"
                        />
                      ))}
                    </span>
                    {detail.feedback_comment && (
                      <span className="block font-normal text-slate-600 mt-1">{detail.feedback_comment}</span>
                    )}
                  </DetailRow>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                <Timer className="w-4 h-4 text-slate-400" aria-hidden="true" /> SLA
              </h2>
              <SlaPanel detail={detail} />
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-bold text-slate-800 mb-3">Assignment</h2>
              <AssignmentPanel detail={detail} onUpdate={setData} />
            </Card>
          </div>
        </div>
      )}

      {activeTab === "actions" && (
        <div className="space-y-5 max-w-full">
          <Card className="p-5 space-y-4 max-w-full">
            <h2 className="text-sm font-bold text-slate-800">Actions</h2>

            <ActionsPanel detail={detail} onUpdate={setData} />

            {detail.can_reclassify && (
              <ReclassifyPanel
                key={`${detail.department_id}-${detail.category_id}-${detail.location_detail.id}-${detail.priority.id}`}
                detail={detail}
                onUpdate={setData}
              />
            )}

            <RejectionPanel detail={detail} onUpdate={setData} />
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
              <History className="w-4 h-4 text-slate-400" aria-hidden="true" /> Timeline
            </h2>
            <Timeline detail={detail} />
          </Card>
        </div>
      )}

      {activeTab === "conversation" && (
        <div className="max-w-4xl">
          <Card className="p-5">
            <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-slate-400" aria-hidden="true" /> Conversation
            </h2>
            <Conversation detail={detail} onUpdate={setData} />
          </Card>
        </div>
      )}
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
