"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity as ActivityIcon,
  ArrowUpCircle,
  CheckCircle,
  ChevronRight,
  Clock,
  FileText,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Send,
  UserCheck,
} from "lucide-react";
import { Activity, api } from "@/lib/portalApi";
import { useConfig } from "@/lib/portalConfig";
import { formatWhen } from "@/lib/portalFormat";
import { Dialog } from "@/components/portal/ui/Dialog";

/** Icon and colour per kind of update (event types from the complaint timeline). */
const KIND_STYLE: Record<string, { icon: React.ElementType; bg: string; color: string }> = {
  submitted: { icon: Send, bg: "bg-blue-50", color: "text-blue-600" },
  assigned: { icon: UserCheck, bg: "bg-purple-50", color: "text-purple-600" },
  routed: { icon: UserCheck, bg: "bg-purple-50", color: "text-purple-600" },
  status_changed: { icon: RefreshCw, bg: "bg-amber-50", color: "text-amber-600" },
  resolved: { icon: CheckCircle, bg: "bg-emerald-50", color: "text-emerald-600" },
  comment_added: { icon: MessageSquare, bg: "bg-sky-50", color: "text-sky-600" },
  escalated: { icon: ArrowUpCircle, bg: "bg-rose-50", color: "text-rose-600" },
  reclassified: { icon: RotateCcw, bg: "bg-orange-50", color: "text-orange-600" },
  review_completed: { icon: CheckCircle, bg: "bg-sky-50", color: "text-sky-600" },
};
const OTHER_STYLE = { icon: FileText, bg: "bg-indigo-50", color: "text-indigo-600" };

function ActivityRow({ item, onOpen, compact }: { item: Activity; onOpen: (item: Activity) => void; compact: boolean }) {
  const { icon: Icon, bg, color } = KIND_STYLE[item.kind] ?? OTHER_STYLE;
  return (
    <button type="button" onClick={() => onOpen(item)} className="group flex w-full gap-3.5 rounded-xl text-left">
      <span className={`flex shrink-0 items-center justify-center rounded-xl ${bg} ${compact ? "h-8 w-8" : "h-9 w-9"}`}>
        <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 pb-1">
        <span className="flex items-start justify-between gap-1">
          <span className="truncate text-xs font-bold text-slate-800 group-hover:text-blue-700">{item.title}</span>
          <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[10px] font-medium text-slate-400">
            <Clock size={10} aria-hidden="true" /> {formatWhen(item.created_at)}
          </span>
        </span>
        <span className={`block text-[11px] leading-snug text-slate-500 ${compact ? "line-clamp-2" : ""}`}>{item.message}</span>
        <span className="mt-0.5 block font-mono text-[10px] text-slate-400">{item.complaint_id}</span>
      </span>
    </button>
  );
}

/** Recent public updates across the end user's complaints (the side panel on larger screens). */
export default function RecentActivity() {
  const router = useRouter();
  const { ui } = useConfig();
  const [items, setItems] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [all, setAll] = useState<{ items: Activity[]; total: number } | null>(null);

  const load = useCallback(
    () =>
      api.activities({ page_size: ui.dashboard_recent_items }).then(
        (page) => {
          setItems(page.items);
          setError(null);
        },
        (err: Error) => setError(err.message),
      ),
    [ui.dashboard_recent_items],
  );

  const refresh = () => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, ui.notification_poll_seconds * 1000);
    return () => clearInterval(timer);
  }, [load, ui.notification_poll_seconds]);

  const openAll = async () => {
    setAllOpen(true);
    try {
      const page = await api.activities({ page_size: ui.max_page_size });
      setAll({ items: page.items, total: page.total });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const open = (item: Activity) => {
    setAllOpen(false);
    router.push(`/dashboard/complaints/${encodeURIComponent(item.complaint_id)}`);
  };

  return (
    <>
      <div className="flex h-full w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/40 p-3 px-4">
          <h2 className="text-base font-bold text-slate-800">Recent activity</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={refresh}
              aria-label="Refresh activity"
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white hover:text-blue-600"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin text-blue-600" : ""} />
            </button>
            <button
              type="button"
              onClick={openAll}
              className="ml-1 flex items-center text-xs font-bold text-blue-600 hover:text-blue-700"
            >
              View all <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-2">
          {error ? (
            <p role="alert" className="py-8 text-center text-xs text-red-600">
              {error}
            </p>
          ) : items === null ? (
            <div className="flex animate-pulse flex-col gap-4" aria-hidden="true">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 shrink-0 rounded-xl bg-slate-100" />
                  <div className="flex-1">
                    <div className="mb-1.5 h-3.5 w-3/4 rounded bg-slate-100" />
                    <div className="h-2.5 w-full rounded bg-slate-50" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                <ActivityIcon size={18} />
              </div>
              <p className="text-xs font-bold text-slate-700">Nothing yet</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Updates on your complaints will show up here.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {items.map((item) => (
                <li key={item.id}>
                  <ActivityRow item={item} onOpen={open} compact />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {allOpen && (
        <Dialog
          title="All activity"
          icon={<ActivityIcon className="h-4 w-4 text-blue-600" />}
          onClose={() => setAllOpen(false)}
          wide
        >
          {!all ? (
            <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
          ) : all.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Nothing yet.</p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {all.items.map((item) => (
                  <li key={item.id} className="py-3">
                    <ActivityRow item={item} onOpen={open} compact={false} />
                  </li>
                ))}
              </ul>
              {all.total > all.items.length && (
                <p className="pt-3 text-center text-[12px] text-slate-400">
                  Showing the latest {all.items.length} of {all.total} updates.
                </p>
              )}
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
