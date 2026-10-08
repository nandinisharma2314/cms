"use client";

import React, { useState } from "react";
import { Ban, Check, Undo2, X } from "lucide-react";
import { api, ComplaintDetail, RejectionRequestItem } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { ErrorBanner, Field, inputClass, primaryButtonClass, secondaryButtonClass, textareaClass } from "./ui";

const STATUS_STYLE: Record<RejectionRequestItem["status"], string> = {
  PENDING: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
  APPROVED: "bg-slate-800 text-white border-slate-800",
  DENIED: "bg-emerald-50 text-emerald-700 border-emerald-100",
  WITHDRAWN: "bg-slate-100 text-slate-500 border-slate-200",
};

/** Approve / deny controls for a pending request. */
export function RejectionDecision({
  request,
  onDecided,
}: {
  request: RejectionRequestItem;
  onDecided: (detail: ComplaintDetail) => void;
}) {
  const { limits } = useConfig();
  const [mode, setMode] = useState<"approve" | "deny" | null>(null);
  const [note, setNote] = useState("");
  const { busy, error, run } = useAction();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          className={mode === "approve" ? primaryButtonClass : secondaryButtonClass}
          onClick={() => setMode(mode === "approve" ? null : "approve")}
        >
          <Check className="w-3.5 h-3.5" /> Approve rejection
        </button>
        <button
          className={mode === "deny" ? primaryButtonClass : secondaryButtonClass}
          onClick={() => setMode(mode === "deny" ? null : "deny")}
        >
          <X className="w-3.5 h-3.5" /> Deny
        </button>
      </div>
      {mode && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              onDecided(
                mode === "approve"
                  ? await api.rejections.approve(request.id, note.trim() || null)
                  : await api.rejections.deny(request.id, note),
              );
              setMode(null);
              setNote("");
            });
          }}
        >
          <Field
            label={mode === "approve" ? "Message to the end user (optional)" : "Why is it denied? (sent to the requester)"}
            hint={mode === "approve" ? `If left empty they see only the reason: ${request.category}` : undefined}
          >
            <textarea
              rows={2}
              required={mode === "deny"}
              maxLength={limits.note}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={textareaClass}
            />
          </Field>
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? "Saving…" : mode === "approve" ? "Reject the complaint" : "Deny and send back"}
          </button>
        </form>
      )}
      <ErrorBanner message={error} />
    </div>
  );
}

function RequestForm({ detail, onUpdate }: { detail: ComplaintDetail; onUpdate: (d: ComplaintDetail) => void }) {
  const { limits } = useConfig();
  const reasons = detail.rejection.reasons;
  const [open, setOpen] = useState(false);
  const [reasonId, setReasonId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const { busy, error, run } = useAction();

  if (!open) {
    return (
      <button className={`${secondaryButtonClass} border-rose-200 text-rose-600 hover:bg-rose-50`} onClick={() => setOpen(true)}>
        <Ban className="w-3.5 h-3.5" /> Request rejection
      </button>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (reasonId === null) return;
        run(async () => {
          onUpdate(await api.complaints.requestRejection(detail.id, reasonId, reason));
          setOpen(false);
        });
      }}
    >
      <p className="text-[11px] text-slate-500">
        You can&apos;t reject a complaint yourself. Someone above you reviews the request; until then the end user sees
        &ldquo;Under Review&rdquo;.
      </p>
      {reasons.length === 0 ? (
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
      )}
      <Field label={`Explain why (internal, at least ${limits.rejection_reason_min} characters)`}>
        <textarea
          rows={3}
          required
          minLength={limits.rejection_reason_min}
          maxLength={limits.note}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={textareaClass}
        />
      </Field>
      <div className="flex gap-2">
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className={primaryButtonClass} disabled={busy || reasons.length === 0}>
          {busy ? "Sending…" : "Send for approval"}
        </button>
      </div>
      <ErrorBanner message={error} />
    </form>
  );
}

export function RejectionPanel({ detail, onUpdate }: { detail: ComplaintDetail; onUpdate: (d: ComplaintDetail) => void }) {
  const withdraw = useAction();
  const pending = detail.rejection.requests.find((r) => r.status === "PENDING");
  const history = detail.rejection.requests.filter((r) => r.status !== "PENDING");
  if (!pending && !detail.rejection.can_request && history.length === 0) return null;

  return (
    <div className="space-y-3 pt-3 border-t border-slate-100">
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
            {pending.approver ? ` · waiting for ${pending.approver}` : " · nobody above the requester can decide it"}
          </div>
          {pending.can_decide && <RejectionDecision request={pending} onDecided={onUpdate} />}
          {pending.can_withdraw && (
            <button
              className={secondaryButtonClass}
              disabled={withdraw.busy}
              onClick={() => withdraw.run(async () => onUpdate(await api.rejections.withdraw(pending.id)))}
            >
              <Undo2 className="w-3.5 h-3.5" /> Withdraw request
            </button>
          )}
          <ErrorBanner message={withdraw.error} />
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
              {r.direct ? `by ${r.decided_by} (${r.category})` : `${r.requested_by.name} asked (${r.category})`}
              {!r.direct && r.decided_by && ` · decided by ${r.decided_by}`}
              {r.decided_at && ` · ${formatDateTime(r.decided_at)}`}
              {r.decision_note && <div className="text-slate-500 mt-0.5">&ldquo;{r.decision_note}&rdquo;</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
