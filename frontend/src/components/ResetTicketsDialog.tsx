"use client";

import React, { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api, PasswordResetTicket } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { useAction, useApiData } from "@/lib/hooks";
import {
  ErrorBanner,
  Field,
  inputClass,
  Modal,
  Pagination,
  primaryButtonClass,
  secondaryButtonClass,
  Spinner,
  tabClass,
} from "./ui";

const STATUS_STYLE: Record<PasswordResetTicket["status"], string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-slate-200 text-slate-600",
};

function TicketCard({ ticket, onChanged }: { ticket: PasswordResetTicket; onChanged: () => void }) {
  const { limits } = useConfig();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [temporary, setTemporary] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  return (
    <li className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-bold text-blue-700">{ticket.ticket_id}</span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_STYLE[ticket.status]}`}>
          {ticket.status}
        </span>
      </div>
      <p className="text-slate-700">
        Asked for <strong className="text-slate-900">{ticket.identifier}</strong> · {formatDateTime(ticket.created_at)}
      </p>
      <p className="text-[11px] text-slate-500">
        {ticket.matched_user
          ? `Matches ${ticket.matched_user.name} (${ticket.matched_user.role}, ${ticket.matched_user.email})`
          : "No staff account matches this email or mobile."}
      </p>
      <p className="text-slate-600 italic">&ldquo;{ticket.reason}&rdquo;</p>
      {ticket.decided_by && (
        <p className="text-[11px] text-slate-500">
          {ticket.status === "APPROVED" ? "Approved" : "Rejected"} by {ticket.decided_by} · {formatDateTime(ticket.decided_at)}
          {ticket.decision_note && <> · &ldquo;{ticket.decision_note}&rdquo;</>}
        </p>
      )}
      {temporary && (
        <div
          role="status"
          className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>
            Temporary password: <strong className="font-mono select-all">{temporary}</strong>. Give it to the person directly; it
            is shown only once and must be changed at their next sign-in.
          </span>
        </div>
      )}
      {ticket.status === "PENDING" && !temporary && (
        <div className="space-y-2 pt-1">
          {rejecting ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api.auth.rejectResetQuery(ticket.ticket_id, note);
                  onChanged();
                });
              }}
            >
              <Field label="Why is it rejected? (kept on the ticket)">
                <input
                  required
                  maxLength={limits.reset_note}
                  className={inputClass}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <div className="flex justify-end gap-2">
                <button type="button" className={secondaryButtonClass} onClick={() => setRejecting(false)}>
                  Cancel
                </button>
                <button type="submit" className={primaryButtonClass} disabled={busy}>
                  Reject request
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <button className={secondaryButtonClass} disabled={busy} onClick={() => setRejecting(true)}>
                Reject
              </button>
              {ticket.matched_user && (
                <button
                  className={primaryButtonClass}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      setTemporary((await api.auth.approveResetQuery(ticket.ticket_id)).temporary_password);
                    })
                  }
                >
                  {busy ? "Working…" : "Approve and issue a temporary password"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <ErrorBanner message={error} />
    </li>
  );
}

export function ResetTicketsDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { ui } = useConfig();
  const [pendingOnly, setPendingOnly] = useState(true);
  const [page, setPage] = useState(1);
  const { data, error, reload } = useApiData(
    () => api.auth.resetQueries({ pending_only: pendingOnly, page, page_size: ui.default_page_size }),
    [pendingOnly, page, ui.default_page_size],
  );

  return (
    <Modal
      title="Password reset requests"
      description="Check that the person is who they say they are before approving."
      onClose={() => {
        onChanged();
        onClose();
      }}
      wide
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          {[true, false].map((value) => (
            <button
              key={String(value)}
              className={tabClass(pendingOnly === value)}
              onClick={() => {
                setPendingOnly(value);
                setPage(1);
              }}
            >
              {value ? "Waiting" : "All"}
            </button>
          ))}
        </div>
        <ErrorBanner message={error} />
        {!data ? (
          !error && <Spinner />
        ) : data.items.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            {pendingOnly ? "No requests are waiting." : "No requests yet."}
          </p>
        ) : (
          <ul className="space-y-3">
            {data.items.map((t) => (
              <TicketCard key={t.ticket_id} ticket={t} onChanged={reload} />
            ))}
          </ul>
        )}
        {data && <Pagination page={page} pageSize={data.page_size} total={data.total} noun="requests" onPage={setPage} />}
      </div>
    </Modal>
  );
}
