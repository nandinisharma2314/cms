"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  X,
  Clock,
  ExternalLink,
  Megaphone,
  FileText,
  AlertTriangle,
  Send,
  UserCheck,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { apis } from "@/lib/apis";

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  type: string;
  complaint_id?: string;
  is_read: boolean;
  time: string;
  created_at: string;
}

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectComplaint?: (complaintId: string) => void;
  onUnreadChange?: (count: number) => void;
}

export default function NotificationPanel({
  isOpen,
  onClose,
  onSelectComplaint,
  onUnreadChange,
}: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<"all" | "unread" | "alerts">("all");
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await apis.notifications.getNotifications();
      if (res && res.success) {
        setNotifications(res.notifications || []);
        if (onUnreadChange) {
          onUnreadChange(res.unread_count || 0);
        }
      }
    } catch (err) {
      console.warn("Could not fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleMarkRead = async (id: number) => {
    try {
      await apis.notifications.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      const remainingUnread = notifications.filter((n) => !n.is_read && n.id !== id).length;
      if (onUnreadChange) onUnreadChange(remainingUnread);
    } catch (err) {
      console.error("Failed to mark notification read", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apis.notifications.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      if (onUnreadChange) onUnreadChange(0);
    } catch (err) {
      console.error("Failed to mark all read", err);
    }
  };

  const handleClearAll = async () => {
    try {
      await apis.notifications.clearAll();
      setNotifications([]);
      if (onUnreadChange) onUnreadChange(0);
    } catch (err) {
      console.error("Failed to clear notifications", err);
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.is_read;
    if (filter === "alerts") return n.type === "civic_alert";
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (!isOpen) return null;

  const renderIcon = (type: string) => {
    switch (type) {
      case "forwarded":
      case "complaint_update":
        return (
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Send size={15} />
          </div>
        );
      case "assigned":
        return (
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <UserCheck size={15} />
          </div>
        );
      case "resolved":
      case "resolution":
        return (
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 size={15} />
          </div>
        );
      case "civic_alert":
        return (
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Megaphone size={15} />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <FileText size={15} />
          </div>
        );
    }
  };

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-sm shadow-indigo-600/30">
            <Bell size={14} />
          </div>
          <h3 className="font-bold text-slate-800 text-sm">Live Notifications</h3>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 text-[10px] font-extrabold animate-pulse">
              {unreadCount} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              title="Mark all as read"
              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-white text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <CheckCheck size={14} />
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              title="Clear all"
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white transition-colors cursor-pointer"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center border-b border-slate-100 px-3 bg-white text-xs">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`py-2 px-3 font-semibold border-b-2 transition-all cursor-pointer ${
            filter === "all"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-400 hover:text-slate-700"
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("unread")}
          className={`py-2 px-3 font-semibold border-b-2 transition-all cursor-pointer ${
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
          className={`py-2 px-3 font-semibold border-b-2 transition-all cursor-pointer ${
            filter === "alerts"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-400 hover:text-slate-700"
          }`}
        >
          Civic Alerts
        </button>
      </div>

      {/* List */}
      <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-50">
        {filtered.length === 0 ? (
          <div className="py-12 px-6 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-400 flex items-center justify-center mb-3">
              <Sparkles size={22} />
            </div>
            <p className="text-xs font-bold text-slate-700">All caught up!</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              No {filter !== "all" ? filter : ""} notifications at this time.
            </p>
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                if (!item.is_read) handleMarkRead(item.id);
                if (item.complaint_id && onSelectComplaint) {
                  onSelectComplaint(item.complaint_id);
                  onClose();
                }
              }}
              className={`p-3.5 transition-all flex items-start gap-3 hover:bg-slate-50/80 cursor-pointer relative group ${
                !item.is_read ? "bg-indigo-50/25" : ""
              }`}
            >
              {renderIcon(item.type)}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <h4 className="text-xs font-bold text-slate-800 truncate">{item.title}</h4>
                  <span className="text-[10px] text-slate-400 font-medium shrink-0 flex items-center gap-1">
                    <Clock size={10} /> {item.time}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                  {item.message}
                </p>

                {item.complaint_id && (
                  <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 mt-1.5 group-hover:underline">
                    <span>View {item.complaint_id}</span>
                    <ExternalLink size={10} />
                  </div>
                )}
              </div>

              {!item.is_read && (
                <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1.5 shadow-sm shadow-blue-400" />
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-2.5 px-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1 text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Civic Updates
        </span>
        <span className="text-[10px] text-slate-400">Auto-refreshed</span>
      </div>
    </div>
  );
}
