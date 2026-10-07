"use client";

import React, { useRef, useState } from "react";
import { CheckCircle2, History, MessageSquare, Paperclip, RotateCcw, Send, Star } from "lucide-react";
import { api, attachmentUrl, ComplaintDetail, EndUserAction } from "@/lib/portalApi";
import { attachmentProblem } from "@/lib/attachments";
import { useConfig } from "@/lib/portalConfig";
import { formatWhen } from "@/lib/portalFormat";
import { useEndUser } from "@/lib/portalSession";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white p-3 text-[14px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100";

function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <div
      className="flex items-center gap-1"
      role={onChange ? "radiogroup" : undefined}
      aria-label={onChange ? "Rating" : `${value} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            onClick={() => onChange(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="rounded p-0.5"
          >
            <Star className={`h-7 w-7 ${n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
          </button>
        ) : (
          <Star
            key={n}
            className={`h-5 w-5 ${n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`}
            aria-hidden="true"
          />
        ),
      )}
    </div>
  );
}

/**
 * What the end user can do on a complaint (confirm, reopen, rate, reply),
 * the conversation with the department and the public timeline.
 */
export default function ComplaintActivity({
  detail,
  onUpdate,
}: {
  detail: ComplaintDetail;
  onUpdate: (detail: ComplaintDetail) => void;
}) {
  const { limits, attachments } = useConfig();
  const canAttach = useEndUser().can("portal.complaint.attach");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [reopening, setReopening] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const can = (action: EndUserAction) => detail.actions.includes(action);
  const room = attachments.max_per_complaint === null ? 0 : attachments.max_per_complaint - detail.attachments.length;

  const run = async (call: () => Promise<ComplaintDetail>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      onUpdate(await call());
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-5 md:p-7">
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-[14px] text-red-700">
          {error}
        </p>
      )}

      {(detail.response_due_at || detail.resolution_due_at) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
          {detail.response_due_at && (
            <span>
              Expected first response by <b>{formatWhen(detail.response_due_at)}</b>
            </span>
          )}
          {detail.resolution_due_at && (
            <span>
              Target resolution by <b>{formatWhen(detail.resolution_due_at)}</b>
            </span>
          )}
        </div>
      )}

      {detail.resolution_note && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-[14px] font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Resolution from the {detail.department} department
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[14px] text-emerald-900">{detail.resolution_note}</p>
        </div>
      )}

      {(can("confirm") || can("reopen") || can("feedback")) && (
        <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
          {(can("confirm") || can("feedback")) && (
            <>
              <p className="text-[15px] font-semibold text-slate-800">
                {can("confirm") ? "Is your issue fixed?" : "How did it go?"}
              </p>
              {can("feedback") && (
                <>
                  <Stars value={rating} onChange={setRating} />
                  <textarea
                    rows={2}
                    maxLength={limits.feedback}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Anything you'd like to add? (optional)"
                    className={inputClass}
                  />
                </>
              )}
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {can("confirm") && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  // A comment is kept together with a rating, so don't let one be dropped quietly.
                  if (feedback.trim() && !rating) {
                    setError("Choose a star rating to send your comment with it, or clear the comment.");
                    return;
                  }
                  run(() =>
                    api.complaints.confirm(detail.id, can("feedback") && rating ? rating : null, feedback.trim() || null),
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" /> Yes, it&apos;s fixed
              </button>
            )}
            {!can("confirm") && can("feedback") && (
              <button
                type="button"
                disabled={busy || rating === 0}
                onClick={() => run(() => api.complaints.feedback(detail.id, rating, feedback.trim() || null))}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <Star className="h-4 w-4" /> Send rating
              </button>
            )}
            {can("reopen") && !reopening && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setReopening(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-4 w-4" /> Not fixed, reopen it
              </button>
            )}
          </div>
          {reopening && (
            <form
              className="space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await run(() => api.complaints.reopen(detail.id, reopenReason))) {
                  setReopening(false);
                  setReopenReason("");
                }
              }}
            >
              <label className="block text-[13px] font-semibold text-slate-700">
                What is still wrong?
                <textarea
                  rows={2}
                  required
                  maxLength={limits.note}
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-orange-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  Reopen complaint
                </button>
                <button
                  type="button"
                  onClick={() => setReopening(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[14px]"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          {detail.reopen_until && (
            <p className="text-[12px] text-slate-500">You can reopen it until {formatWhen(detail.reopen_until)}.</p>
          )}
        </div>
      )}

      {detail.feedback_rating !== null && (
        <div className="flex items-center gap-3 text-[14px] text-slate-600">
          <span>Your rating:</span>
          <Stars value={detail.feedback_rating} />
        </div>
      )}

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-slate-500">
          <MessageSquare className="h-4 w-4 text-blue-600" aria-hidden="true" /> Messages
        </h3>
        <div className="space-y-2">
          {detail.comments.length === 0 && <p className="text-[14px] text-slate-400">No messages yet.</p>}
          {detail.comments.map((c) => (
            <div
              key={c.id}
              className={`rounded-2xl border p-3 text-[14px] ${c.author_type === "end_user" ? "ml-8 border-blue-100 bg-blue-50/60" : "mr-8 border-slate-100 bg-slate-50"}`}
            >
              <div className="mb-1 flex justify-between gap-2 text-[12px] text-slate-500">
                <span className="font-semibold text-slate-700">{c.author_type === "end_user" ? "You" : c.author_name}</span>
                <span>{formatWhen(c.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-slate-700 wrap-break-word">{c.body}</p>
              {c.attachments.map((a) => (
                <a
                  key={a.id}
                  href={attachmentUrl(a)}
                  target="_blank"
                  rel="noreferrer"
                  className="mr-2 mt-1 inline-flex items-center gap-1 text-[12px] text-blue-600 hover:underline"
                >
                  <Paperclip className="h-3 w-3" aria-hidden="true" /> {a.file_name}
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
              if (await run(() => api.complaints.comment(detail.id, message, files))) {
                setMessage("");
                setFiles([]);
                if (fileInput.current) fileInput.current.value = "";
              }
            }}
          >
            <label className="sr-only" htmlFor="reply">
              Message to the department
            </label>
            <textarea
              id="reply"
              rows={3}
              required
              maxLength={limits.comment}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                detail.status === "WAITING_FOR_INFORMATION"
                  ? "The department needs more information. Reply here…"
                  : "Write a message to the department…"
              }
              className={inputClass}
            />
            <div className="flex items-center justify-between gap-3">
              {canAttach && room > 0 && attachments.allowed_types.length > 0 ? (
                <div className="min-w-0">
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
                    onClick={() => fileInput.current?.click()}
                    className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-blue-600"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {files.length ? `${files.length} file${files.length > 1 ? "s" : ""} attached` : "Attach a file"}
                  </button>
                  <span className="block text-[11px] text-slate-400">
                    Up to {room} more{attachments.max_mb ? `, ${attachments.max_mb} MB each` : ""}
                  </span>
                </div>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <Send className="h-4 w-4" /> Send
              </button>
            </div>
          </form>
        )}
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-slate-500">
          <History className="h-4 w-4 text-blue-600" aria-hidden="true" /> Timeline
        </h3>
        <ol className="ml-2 space-y-3 border-l-2 border-slate-200">
          {[...detail.timeline].reverse().map((e) => (
            <li key={e.id} className="relative pl-4">
              <span
                className="absolute -left-1.75 top-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500"
                aria-hidden="true"
              />
              <p className="text-[14px] text-slate-800">{e.message}</p>
              {e.note && (
                <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1 text-[12px] text-slate-600">&ldquo;{e.note}&rdquo;</p>
              )}
              <p className="mt-0.5 text-[12px] text-slate-400">
                {e.actor_name ? `${e.actor_name} · ` : ""}
                {formatWhen(e.created_at)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
