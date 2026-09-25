"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apis, CitizenNotification } from "@/lib/apis";
import { BellBadgeIcon } from "./DashboardIcons";

const POLL_MS = 60_000;

function formatWhen(iso: string) {
  const date = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Updates about the citizen's complaints (status changes, replies, escalations). */
export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CitizenNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    apis.notifications
      .list()
      .then((data) => {
        setItems(data.items);
        setUnread(data.unread_count);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const openItem = async (n: CitizenNotification) => {
    setOpen(false);
    if (!n.read_at) await apis.notifications.markRead(n.id).catch(() => undefined);
    load();
    if (n.complaint_id) router.push(`/dashboard/complaints?open=${encodeURIComponent(n.complaint_id)}`);
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 transition-colors relative"
        onClick={() => setOpen(!open)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <BellBadgeIcon size={20} color="#64748b" hasBadge={unread > 0} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white shadow-lg border border-slate-100 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-bold text-slate-800">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-blue-600 hover:underline"
                onClick={async () => {
                  await apis.notifications.markAllRead().catch(() => undefined);
                  load();
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">No updates yet.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${n.read_at ? "" : "bg-blue-50/50"}`}
                >
                  <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                  {n.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[11px] text-slate-400 mt-1">{formatWhen(n.created_at)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
