"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Clock,
  ExternalLink,
  Megaphone,
  FileText,
  AlertTriangle,
  Send,
  UserCheck,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { apis } from "@/lib/apis";
import ComplaintModal from "@/components/Dashboard/ComplaintModal";

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | "unread" | "alerts">("all");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<any | null>(null);

  const fetchNotifications = async (showRefresh = false) => {
    try {
      if (showRefresh) setIsRefreshing(true);
      const res = await apis.notifications.getNotifications();
      if (res && res.success) {
        setNotifications(res.notifications || []);
      }
    } catch (err) {
      console.warn("Could not fetch notifications:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 25000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkRead = async (id: number) => {
    try {
      await apis.notifications.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apis.notifications.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearAll = async () => {
    try {
      await apis.notifications.clearAll();
      setNotifications([]);
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.is_read;
    if (filter === "alerts") return n.type === "civic_alert";
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const renderIcon = (type: string) => {
    switch (type) {
      case "forwarded":
      case "complaint_update":
        return (
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Send size={16} />
          </div>
        );
      case "assigned":
        return (
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <UserCheck size={16} />
          </div>
        );
      case "resolved":
      case "resolution":
        return (
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 size={16} />
          </div>
        );
      case "civic_alert":
        return (
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Megaphone size={16} />
          </div>
        );
      default:
        return (
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <FileText size={16} />
          </div>
        );
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-2 md:p-4">
      <div className="max-w-3xl mx-auto flex flex-col gap-2 pb-24">
        {/* Top Back Link */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
          <button
            type="button"
            onClick={() => fetchNotifications(true)}
            className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
          >
            <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {/* Card Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-slate-50 to-indigo-50/20">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900">Live Notifications</h1>
                  {unreadCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 text-xs font-bold">
                      {unreadCount} unread
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time updates on your registered complaints and municipal alerts
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <CheckCheck size={14} /> Mark All Read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="px-3 py-1.5 rounded-xl border border-red-100 text-red-600 bg-red-50/50 hover:bg-red-50 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 size={13} /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center border-b border-slate-100 px-6 bg-white text-xs font-bold">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`py-3 px-4 border-b-2 transition-all cursor-pointer ${
                filter === "all"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-400 hover:text-slate-700"
              }`}
            >
              All Notifications ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`py-3 px-4 border-b-2 transition-all cursor-pointer ${
                filter === "unread"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-400 hover:text-slate-700"
              }`}
            >
              Unread ({unreadCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("alerts")}
              className={`py-3 px-4 border-b-2 transition-all cursor-pointer ${
                filter === "alerts"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-400 hover:text-slate-700"
              }`}
            >
              Civic Alerts
            </button>
          </div>

          {/* List */}
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="p-8 flex flex-col gap-4 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 shrink-0" />
                    <div className="flex-1">
                      <div className="h-4 bg-slate-100 rounded w-1/3 mb-2" />
                      <div className="h-3 bg-slate-50 rounded w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 px-6 flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mb-3">
                  <Sparkles size={26} />
                </div>
                <h3 className="text-sm font-bold text-slate-800">No Notifications</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  You are completely caught up! New status updates will appear here in real time.
                </p>
              </div>
            ) : (
              filtered.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (!item.is_read) handleMarkRead(item.id);
                  }}
                  className={`p-4 md:p-5 flex items-start gap-4 hover:bg-slate-50 transition-colors cursor-pointer relative ${
                    !item.is_read ? "bg-indigo-50/20" : ""
                  }`}
                >
                  {renderIcon(item.type)}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="text-sm font-bold text-slate-800 truncate">{item.title}</h4>
                      <span className="text-xs text-slate-400 font-medium shrink-0 flex items-center gap-1">
                        <Clock size={12} /> {item.time}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.message}</p>

                    {item.complaint_id && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-bold">
                          {item.complaint_id}
                        </span>
                      </div>
                    )}
                  </div>

                  {!item.is_read && (
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0 mt-1 shadow-sm shadow-blue-400" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
