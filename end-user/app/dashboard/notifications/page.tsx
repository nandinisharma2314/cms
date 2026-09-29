"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  RefreshCw,
  Trash2,
  UserCog,
} from "lucide-react";
import { api, NotificationItem, NOTIFICATIONS_CHANGED_EVENT } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { formatWhen } from "@/lib/format";

/** Icon per notification kind (the kinds the API sends to end users). */
const KIND_STYLE: Record<string, { icon: React.ElementType; className: string }> = {
  "complaint.status": { icon: CheckCircle2, className: "bg-emerald-50 text-emerald-600" },
  "complaint.reply": { icon: MessageSquare, className: "bg-sky-50 text-sky-600" },
  "account.contact_changed": { icon: UserCog, className: "bg-amber-50 text-amber-600" },
};
const OTHER_STYLE = { icon: FileText, className: "bg-indigo-50 text-indigo-600" };

export default function NotificationsPage() {
  useDocumentTitle("Notifications");
  const router = useRouter();
  const { ui } = useConfig();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    (pageNumber: number) =>
      api.notifications.list({ unread_only: unreadOnly, page: pageNumber, page_size: ui.default_page_size }).then(
        (result) => {
          setItems(result.items);
          setTotal(result.total);
          setUnread(result.unread_count);
          setError(null);
        },
        (err: Error) => setError(err.message),
      ),
    [unreadOnly, ui.default_page_size],
  );

  const refresh = () => {
    setRefreshing(true);
    load(page).finally(() => setRefreshing(false));
  };
  const pages = Math.max(1, Math.ceil(total / ui.default_page_size));

  useEffect(() => {
    load(page);
    const timer = setInterval(() => load(page), ui.notification_poll_seconds * 1000);
    return () => clearInterval(timer);
  }, [load, page, ui.notification_poll_seconds]);

  const act = async (call: () => Promise<unknown>) => {
    try {
      await call();
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
      await load(page);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const open = async (item: NotificationItem) => {
    if (!item.read_at) {
      await api.notifications.markRead(item.id).catch(() => undefined);
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    }
    if (item.complaint_id) router.push(`/dashboard/complaints/${encodeURIComponent(item.complaint_id)}`);
    else load(page);
  };

  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto bg-white p-0 md:px-6 md:pb-6 lg:px-8 lg:pb-8">
      <div className="flex w-full max-w-5xl flex-col overflow-hidden bg-white md:rounded-b-3xl md:border-x md:border-b md:border-slate-100 md:shadow-sm mb-20 md:mb-20">
        <div className="overflow-hidden bg-white">
          <div className="flex items-center justify-between">
          
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => act(api.notifications.markAllRead)}
                  className="flex items-center gap-1.5 rounded-none border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 hover:bg-slate-50"
                >
                  <CheckCheck size={14} /> Mark all read
                </button>
              )}
              {total > 0 && (
                <button
                  type="button"
                  onClick={() => confirm("Delete all your notifications?") && act(api.notifications.clear)}
                  className="flex items-center gap-1.5 rounded-none border border-red-100 bg-red-50/50 px-3 py-1.5 text-[12px] font-bold text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={13} /> Clear all
                </button>
              )}
            </div>
          </div>

          <div className="flex border-b border-slate-100 px-4 text-[13px] font-bold" role="tablist">
            {[false, true].map((value) => (
              <button
                key={String(value)}
                type="button"
                role="tab"
                aria-selected={unreadOnly === value}
                onClick={() => {
                  setUnreadOnly(value);
                  setPage(1);
                }}
                className={`border-b-2 px-4 py-3 transition-all ${unreadOnly === value ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-700"}`}
              >
                {value ? `Unread (${unread})` : "All"}
              </button>
            ))}
          </div>

          {error && (
            <p role="alert" className="border-b border-slate-100 bg-red-50 p-3 text-[13px] text-red-700">
              {error}
            </p>
          )}

          <ul className="divide-y divide-slate-100">
            {items === null ? (
              !error && (
              <li className="flex animate-pulse gap-4 p-6" aria-hidden="true">
                <div className="h-10 w-10 shrink-0 rounded-none bg-slate-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-slate-100" />
                  <div className="h-3 w-3/4 rounded bg-slate-50" />
                </div>
              </li>
              )
            ) : items.length === 0 ? (
              <li className="flex flex-col items-center px-6 py-16 text-center">
                <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-none bg-blue-50 text-blue-500">
                  <Bell size={26} />
                </span>
                <p className="text-[14px] font-bold text-slate-800">You&apos;re all caught up</p>
                <p className="mt-1 max-w-sm text-[13px] text-slate-400">New updates about your complaints will appear here.</p>
              </li>
            ) : (
              items.map((item) => {
                const { icon: Icon, className } = KIND_STYLE[item.kind] ?? OTHER_STYLE;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => open(item)}
                      className={`flex w-full items-start gap-4 p-4 text-left transition-colors hover:bg-slate-50 md:p-5 ${item.read_at ? "" : "bg-blue-50/30"}`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-none ${className}`}>
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="mb-1 flex items-start justify-between gap-2">
                          <span className="text-[14px] font-bold text-slate-800">
                            {item.title}
                            {!item.read_at && <span className="sr-only"> (unread)</span>}
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-slate-400">
                            <Clock size={12} aria-hidden="true" /> {formatWhen(item.created_at)}
                          </span>
                        </span>
                        {item.body && <span className="block text-[13px] leading-relaxed text-slate-600">{item.body}</span>}
                        {item.complaint_id && (
                          <span className="mt-2 inline-block rounded-md bg-blue-50 px-2.5 py-0.5 font-mono text-[11px] font-bold text-blue-700">
                            {item.complaint_id}
                          </span>
                        )}
                      </span>
                      {!item.read_at && (
                        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })
              
            )}
          </ul>
        </div>

        {pages > 1 && (
          <nav className="flex items-center justify-center gap-3 text-[13px] text-slate-500" aria-label="Pages">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-none border border-slate-200 bg-white px-4 py-2 font-semibold text-blue-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Newer
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
              className="rounded-none border border-slate-200 bg-white px-4 py-2 font-semibold text-blue-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Older
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
