"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, NotificationItem, NOTIFICATIONS_CHANGED_EVENT } from "@/lib/portalApi";
import { useConfig } from "@/lib/portalConfig";
import { formatWhen } from "@/lib/portalFormat";
import { BellBadgeIcon } from "./DashboardIcons";

/** Updates about the end user's complaints (status changes, replies, escalations). */
export default function NotificationBell() {
  const router = useRouter();
  const { ui } = useConfig();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api.notifications.list({ page_size: ui.notification_menu_items }).then(
      (data) => {
        setItems(data.items);
        setUnread(data.unread_count);
      },
      () => undefined, // the bell simply keeps its last state; the next poll retries
    );
  }, [ui.notification_menu_items]);

  useEffect(() => {
    load();
    const timer = setInterval(load, ui.notification_poll_seconds * 1000);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, load);
    };
  }, [load, ui.notification_poll_seconds]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openItem = async (n: NotificationItem) => {
    setOpen(false);
    if (!n.read_at) await api.notifications.markRead(n.id).catch(() => undefined);
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT)); // reloads this bell and the tab bar
    if (n.complaint_id) router.push(`/dashboard/complaints/${encodeURIComponent(n.complaint_id)}`);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-slate-50"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <BellBadgeIcon size={20} color="#64748b" hasBadge={unread > 0} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-bold text-slate-800">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-blue-600 hover:underline"
                onClick={async () => {
                  await api.notifications.markAllRead().catch(() => undefined);
                  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 divide-y divide-slate-50 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">No updates yet.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${n.read_at ? "" : "bg-blue-50/50"}`}
                >
                  <p className="text-sm font-semibold text-slate-800">
                    {n.title}
                    {!n.read_at && <span className="sr-only"> (unread)</span>}
                  </p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-slate-400">{formatWhen(n.created_at)}</p>
                </button>
              ))
            )}
          </div>
          <Link
            href="/dashboard/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-semibold text-blue-600 hover:bg-slate-50"
          >
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
