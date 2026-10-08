"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { api, NotificationItem, NOTIFICATIONS_CHANGED_EVENT } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { useAction, useApiData } from "@/lib/hooks";
import { Card, ErrorBanner, PageHeader, Pagination, secondaryButtonClass, Spinner, tabClass } from "@/components/ui";

/** Every notification of the signed-in staff user; the header menu shows only the latest few. */
export default function NotificationsPage() {
  useDocumentTitle("Notifications");
  const router = useRouter();
  const { ui } = useConfig();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const { data, error, reload } = useApiData(
    () => api.notifications.list({ unread_only: unreadOnly, page, page_size: ui.default_page_size }),
    [unreadOnly, page, ui.default_page_size],
  );
  const { busy, error: actionError, run } = useAction();
  // Reading them in the header menu updates this list too.
  useEffect(() => {
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, reload);
  }, [reload]);

  const changed = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT)); // reloads this page and the menu

  const open = (item: NotificationItem) =>
    run(async () => {
      if (!item.read_at) await api.notifications.markRead(item.id);
      if (item.complaint_id) router.push(`/complaints/${encodeURIComponent(item.complaint_id)}`);
      else changed();
    });

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Assignments, escalations, replies and other updates about the complaints you work on."
        actions={
          data && data.unread_count > 0 ? (
            <button
              className={secondaryButtonClass}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api.notifications.markAllRead();
                  changed();
                })
              }
            >
              <CheckCheck className="w-3.5 h-3.5" /> Mark all read
            </button>
          ) : undefined
        }
      />
      <div className="flex gap-2" role="tablist" aria-label="Show">
        {[false, true].map((value) => (
          <button
            key={String(value)}
            role="tab"
            aria-selected={unreadOnly === value}
            className={tabClass(unreadOnly === value)}
            onClick={() => {
              setUnreadOnly(value);
              setPage(1);
            }}
          >
            {value ? `Unread${data ? ` (${data.unread_count})` : ""}` : "All"}
          </button>
        ))}
      </div>
      <ErrorBanner message={error ?? actionError} />
      {!data ? (
        !error && <Spinner />
      ) : (
        <Card className="overflow-hidden">
          {data.items.length === 0 ? (
            <p className="p-8 text-center text-xs text-slate-400">{unreadOnly ? "Nothing unread." : "No notifications yet."}</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {data.items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => open(item)}
                    disabled={busy}
                    className={`w-full text-left px-5 py-3 hover:bg-slate-50 cursor-pointer ${item.read_at ? "" : "bg-blue-50/40"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-800">
                          {item.title}
                          {!item.read_at && <span className="sr-only"> (unread)</span>}
                        </div>
                        {item.body && <div className="text-[11px] text-slate-500 mt-0.5">{item.body}</div>}
                      </div>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatDateTime(item.created_at)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {data && (
        <Pagination page={page} pageSize={ui.default_page_size} total={data.total} noun="notifications" onPage={setPage} />
      )}
    </>
  );
}
