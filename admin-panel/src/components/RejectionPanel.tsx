"use client";

import React, { useState } from "react";
import { Ban, Check, Undo2, X } from "lucide-react";
import { api, ComplaintDetail, RejectionRequestItem } from "@/lib/api";
import { ErrorBanner, Field, formatDateTime, inputClass, primaryButtonClass, secondaryButtonClass } from "./ui";

const STATUS_STYLE: Record<RejectionRequestItem["status"], string> = {
  PENDING: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
  APPROVED: "bg-slate-800 text-white border-slate-800",
  DENIED: "bg-emerald-50 text-emerald-700 border-emerald-100",
  WITHDRAWN: "bg-slate-100 text-slate-500 border-slate-200",
};

const textareaClass =
  "w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30";

/** Approve / deny controls for a pending request. */
export function RejectionDecision({
  request,
  onDecided,
}: {
  request: RejectionRequestItem;
  onDecided: (detail: ComplaintDetail) => void;
}) {
  const [mode, setMode] = useState<"approve" | "deny" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDecided(mode === "approve" ? await api.rejections.approve(request.id, note) : await api.rejections.deny(request.id, note));
      setMode(null);
      setNote("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button className={mode === "approve" ? primaryButtonClass : secondaryButtonClass} onClick={() => setMode(mode === "approve" ? null : "approve")}>
          <Check className="w-3.5 h-3.5" /> Approve rejection
        </button>
        <button className={mode === "deny" ? primaryButtonClass : secondaryButtonClass} onClick={() => setMode(mode === "deny" ? null : "deny")}>
          <X className="w-3.5 h-3.5" /> Deny
        </button>
      </div>
      {mode && (
        <form onSubmit={submit} className="space-y-2">
          <Field
            label={mode === "approve" ? "Message to the citizen (optional)" : "Why is it denied? (sent to the officer)"}
            hint={mode === "approve" ? `Defaults to: ${request.category}. ${request.reason}` : undefined}
          >
            <textarea rows={2} required={mode === "deny"} value={note} onChange={(e) => setNote(e.target.value)} className={textareaClass} />
          </Field>
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? "Saving..." : mode === "approve" ? "Reject the complaint" : "Deny and send back"}
          </button>
        </form>
      )}
      <ErrorBanner message={error} />
    </div>
  );
}

function RequestForm({ detail, onUpdate }: { detail: ComplaintDetail; onUpdate: (d: ComplaintDetail) => void }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(detail.rejection.categories[0] ?? "Other");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50 cursor-pointer" onClick={() => setOpen(true)}>
        <Ban className="w-3.5 h-3.5" /> Request Rejection
      </button>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          onUpdate(await api.complaints.requestRejection(detail.id, category, reason));
          setOpen(false);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-[11px] text-slate-500">
        You can&apos;t reject a complaint yourself. Your supervisor reviews the request; until then the citizen sees
        &ldquo;Under Review&rdquo;.
      </p>
      <Field label="Reason category">
        <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          {detail.rejection.categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Explain why (internal, at least 10 characters)">
        <textarea rows={3} required minLength={10} value={reason} onChange={(e) => setReason(e.target.value)} className={textareaClass} />
      </Field>
      <div className="flex gap-2">
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className={primaryButtonClass} disabled={busy}>
          {busy ? "Sending..." : "Send for approval"}
        </button>
      </div>
      <ErrorBanner message={error} />
    </form>
  );
}

export function RejectionPanel({ detail, onUpdate }: { detail: ComplaintDetail; onUpdate: (d: ComplaintDetail) => void }) {
  const [error, setError] = useState<string | null>(null);
  const pending = detail.rejection.requests.find((r) => r.status === "PENDING");
  const history = detail.rejection.requests.filter((r) => r.status !== "PENDING");
  if (!pending && !detail.rejection.can_request && history.length === 0) return null;

  return (
    <div className="space-y-3">
      {pending && (
        <div className="p-3 rounded-xl border border-fuchsia-100 bg-fuchsia-50/60 text-xs space-y-2">
          <div className="font-bold text-fuchsia-800">
            Rejection requested by {pending.requested_by.name} ({pending.requested_by.role})
          </div>
          <div className="text-slate-700">
            <span className="font-semibold">{pending.category}.</span> {pending.reason}
          </div>
          <div className="text-[11px] text-slate-500">
            {formatDateTime(pending.created_at)}
            {pending.approver && ` · routed to ${pending.approver}`}
          </div>
          {pending.can_decide && <RejectionDecision request={pending} onDecided={onUpdate} />}
          {pending.can_withdraw && (
            <button
              className={secondaryButtonClass}
              onClick={async () => {
                setError(null);
                try {
                  onUpdate(await api.rejections.withdraw(pending.id));
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              <Undo2 className="w-3.5 h-3.5" /> Withdraw request
            </button>
          )}
          <ErrorBanner message={error} />
        </div>
      )}
      {!pending && detail.rejection.can_request && <RequestForm detail={detail} onUpdate={onUpdate} />}
      {history.length > 0 && (
        <ul className="space-y-2">
          {history.map((r) => (
            <li key={r.id} className="text-[11px] text-slate-600">
              <span className={`inline-block mr-1.5 px-1.5 py-0.5 rounded border font-semibold ${STATUS_STYLE[r.status]}`}>
                {r.direct ? "REJECTED DIRECTLY" : r.status}
              </span>
              {r.direct ? "by" : `${r.requested_by.name} asked (${r.category});`} {r.decided_by ?? r.requested_by.name}{" "}
              {r.decided_at && `· ${formatDateTime(r.decided_at)}`}
              {r.decision_note && <div className="text-slate-500 mt-0.5">&ldquo;{r.decision_note}&rdquo;</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
