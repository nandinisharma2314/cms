"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, MessageSquare, Paperclip, RotateCcw, Send, Star, History } from "lucide-react";
import { apis, BACKEND_URL, ComplaintDetail } from "@/lib/apis";
import { useEndUser } from "@/lib/endUserSession";
import { formatWhen } from "@/lib/utils";

function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          className={onChange ? "cursor-pointer" : "cursor-default"}
        >
          <Star className={`w-5 h-5 ${n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
        </button>
      ))}
    </div>
  );
}

/**
 * Live part of a complaint's details: resolution, end user actions (confirm,
 * reopen, rate), the conversation with the department and the timeline.
 */
export default function ComplaintActivity({
  complaintId,
  initialDetail,
  onUpdate,
}: {
  complaintId: string;
  /** Already-loaded details; skips the first fetch. */
  initialDetail?: ComplaintDetail;
  onUpdate?: (detail: ComplaintDetail) => void;
}) {
  const [detail, setDetail] = useState<ComplaintDetail | null>(initialDetail ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [reopening, setReopening] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const canAttach = useEndUser().can("portal.complaint.attach");

  useEffect(() => {
    if (initialDetail) return;
    apis.complaints
      .getComplaint(complaintId)
      .then((d) => {
        setDetail(d);
        onUpdate?.(d);
      })
      .catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complaintId]);

  const run = async (call: () => Promise<ComplaintDetail>) => {
    setBusy(true);
    setError("");
    try {
      const updated = await call();
      setDetail(updated);
      onUpdate?.(updated);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!detail) {
    return (
      <div className="p-6 md:p-8 text-sm text-slate-400">{error || "Loading updates..."}</div>
    );
  }

  const can = (action: string) => detail.actions.includes(action as never);

  return (
    <div className="p-6 md:p-8 border-t border-slate-100 space-y-6">
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      {(detail.response_due_at || detail.resolution_due_at) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
          {detail.response_due_at && <span>Expected response by <b>{formatWhen(detail.response_due_at)}</b></span>}
          {detail.resolution_due_at && <span>Target resolution by <b>{formatWhen(detail.resolution_due_at)}</b></span>}
          {detail.is_escalated && <span className="text-orange-700 font-semibold">Escalated to a senior officer</span>}
        </div>
      )}

      {detail.resolution_note && (
        <div className="p-4 bg-green-50 border border-green-200">
          <div className="flex items-center gap-2 text-sm font-bold text-green-800">
            <CheckCircle2 className="w-4 h-4" /> Resolution from the {detail.department} department
          </div>
          <p className="text-sm text-green-900 mt-1">{detail.resolution_note}</p>
        </div>
      )}

      {/* Confirm or reopen a resolved complaint, and rate the service */}
      {(can("confirm") || can("reopen") || can("feedback")) && (
        <div className="p-4 border border-blue-100 bg-blue-50/40 space-y-3">
          {(can("confirm") || can("feedback")) && (
            <>
              <p className="text-sm font-semibold text-slate-800">
                {can("confirm") ? "Is your issue resolved?" : "How was the resolution?"}
              </p>
              {can("feedback") && (
                <>
                  <Stars value={rating} onChange={setRating} />
                  <textarea
                    rows={2}
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Anything you'd like to tell us? (optional)"
                    className="w-full p-2 text-sm border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </>
              )}
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {can("confirm") && (
              <button
                disabled={busy}
                onClick={() => run(() => apis.complaints.confirm(complaintId, rating || null, feedbackText))}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" /> Yes, it&apos;s resolved
              </button>
            )}
            {!can("confirm") && can("feedback") && (
              <button
                disabled={busy || rating === 0}
                onClick={() => run(() => apis.complaints.feedback(complaintId, rating, feedbackText))}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60"
              >
                <Star className="w-4 h-4" /> Submit rating
              </button>
            )}
            {can("reopen") && !reopening && (
              <button
                disabled={busy}
                onClick={() => setReopening(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold"
              >
                <RotateCcw className="w-4 h-4" /> Not resolved, reopen
              </button>
            )}
          </div>
          {reopening && (
            <form
              className="space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await run(() => apis.complaints.reopen(complaintId, reopenReason))) {
                  setReopening(false);
                  setReopenReason("");
                }
              }}
            >
              <textarea
                rows={2}
                required
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="What is still wrong?"
                className="w-full p-2 text-sm border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold">
                  Reopen complaint
                </button>
                <button type="button" onClick={() => setReopening(false)} className="px-4 py-2 border border-slate-300 bg-white text-sm">
                  Cancel
                </button>
              </div>
            </form>
          )}
          {detail.reopen_until && (
            <p className="text-xs text-slate-500">You can reopen this complaint until {formatWhen(detail.reopen_until)}.</p>
          )}
        </div>
      )}

      {detail.feedback_rating !== null && (
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>Your rating:</span>
          <Stars value={detail.feedback_rating} />
        </div>
      )}

      {/* Conversation with the department */}
      <div>
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4 text-blue-600" /> Messages
        </h3>
        <div className="space-y-2">
          {detail.comments.length === 0 && <p className="text-sm text-slate-400">No messages yet.</p>}
          {detail.comments.map((c) => (
            <div
              key={c.id}
              className={`p-3 border text-sm ${
                c.author_type === "end_user" ? "bg-blue-50/60 border-blue-100 ml-8" : "bg-slate-50 border-slate-100 mr-8"
              }`}
            >
              <div className="flex justify-between gap-2 text-xs text-slate-500 mb-1">
                <span className="font-semibold text-slate-700">{c.author_type === "end_user" ? "You" : c.author_name}</span>
                <span>{formatWhen(c.created_at)}</span>
              </div>
              <p className="text-slate-700 whitespace-pre-wrap">{c.body}</p>
              {c.attachments.map((a) => (
                <a
                  key={a.id}
                  href={`${BACKEND_URL}${a.file_path}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 mt-1 mr-2 text-xs text-blue-600 hover:underline"
                >
                  <Paperclip className="w-3 h-3" /> {a.file_name}
                </a>
              ))}
            </div>
          ))}
        </div>
        {can("comment") && (
          <form
            className="mt-3 space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => apis.complaints.comment(complaintId, message, files))) {
                setMessage("");
                setFiles([]);
              }
            }}
          >
            <textarea
              rows={2}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                detail.status === "WAITING_FOR_INFORMATION"
                  ? "The department needs more information. Reply here..."
                  : "Write a message to the department..."
              }
              className="w-full p-2 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <div className="flex items-center justify-between">
              {canAttach ? (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  />
                  <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600">
                    <Paperclip className="w-3.5 h-3.5" />
                    {files.length ? `${files.length} file${files.length > 1 ? "s" : ""} attached` : "Attach photo or PDF"}
                  </button>
                </>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60"
              >
                <Send className="w-4 h-4" /> Send
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Timeline */}
      <div>
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-blue-600" /> Timeline
        </h3>
        <ol className="border-l-2 border-slate-200 ml-2 space-y-3">
          {[...detail.timeline].reverse().map((e) => (
            <li key={e.id} className="relative pl-4">
              <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
              <p className="text-sm text-slate-800">{e.message}</p>
              {e.note && <p className="text-xs text-slate-600 bg-slate-50 px-2 py-1 mt-1">&ldquo;{e.note}&rdquo;</p>}
              <p className="text-xs text-slate-400 mt-0.5">
                {e.actor_name} · {formatWhen(e.created_at)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
