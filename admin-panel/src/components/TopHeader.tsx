"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Bell,
  Calendar,
  ChevronDown,
  Shield,
  LogOut,
  MapPin,
} from "lucide-react";
import { api, NotificationItem } from "@/lib/api";
import { useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { scopeLabel } from "./ScopeEditor";
import { formatDateTime } from "./ui";
import { QuickActionsBar } from "./QuickActionsBar";

const NOTIFICATION_POLL_MS = 60_000;

export function TopHeader() {
  const router = useRouter();
  const { me, can, logout, reload } = useSession();
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const notifRef = React.useRef<HTMLDivElement>(null);
  const userRef = React.useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [currentDateStr] = useState(() =>
    new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
  );
  const { data: inbox, reload: reloadInbox } = useApiData(() => api.notifications.list(), [me.id]);
  useEffect(() => {
    const timer = setInterval(reloadInbox, NOTIFICATION_POLL_MS);
    return () => clearInterval(timer);
  }, [reloadInbox]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifMenuOpen && notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifMenuOpen(false);
      }
      if (userMenuOpen && userRef.current && !userRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifMenuOpen, userMenuOpen]);

  const openNotification = async (n: NotificationItem) => {
    setNotifMenuOpen(false);
    if (!n.read_at) await api.notifications.markRead(n.id).catch(() => undefined);
    reloadInbox();
    if (n.complaint_id) router.push(`/complaints/${n.complaint_id}`);
  };

  const toggleNotifications = async () => {
    const isOpening = !notifMenuOpen;
    setNotifMenuOpen(isOpening);
    if (isOpening && inbox && inbox.unread_count > 0) {
      await api.notifications.markAllRead().catch(() => undefined);
      reloadInbox();
    }
  };

  // Compute initials from name (e.g. "Rahul Sharma" -> "RS")
  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const unread = inbox?.unread_count ?? 0;
  const scopeSummary = me.is_super_admin
    ? "Entire system"
    : me.scopes.length === 1
      ? scopeLabel(me.scopes[0])
      : `${me.scopes.length} scopes`;

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between min-h-[96px] py-4 px-8 bg-[#f8fafc]">
      {/* Search complaints (scoped by the backend) */}
      <form
        className="relative w-full max-w-lg"
        onSubmit={(e) => {
          e.preventDefault();
          if (can("complaint.view")) router.push(`/complaints?search=${encodeURIComponent(searchQuery.trim())}`);
        }}
      >
        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={!can("complaint.view")}
          placeholder="Search complaints by ID, title or area, then press Enter"
          className="w-full h-11 pl-11 pr-4 text-sm text-slate-800 bg-[#f8fafc] border border-slate-200/90 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
        />
      </form>

      {/* Right Action Icons & Profile */}
      <div className="flex items-center gap-3.5">
        {/* Role and scope of the signed-in officer */}
        <div
          className="hidden lg:flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50/90 border border-blue-100/90 rounded-xl select-none shadow-xs"
          title={me.scopes.map(scopeLabel).join("\n") || scopeSummary}
        >
          <Shield className="w-4 h-4 text-blue-600" />
          <span>{me.role.name}</span>
          <span className="text-blue-300">|</span>
          <MapPin className="w-3.5 h-3.5 text-blue-500" />
          <span className="font-medium max-w-[220px] truncate">{scopeSummary}</span>
        </div>

        {/* Date Display Pill / Box with Live Date */}
        <div className="hidden xl:flex items-center gap-3 px-3.5 py-2 bg-slate-50/80 border border-slate-200/80 rounded-none text-slate-700 select-none">
          <Calendar className="w-4 h-4 text-blue-600" />
          <div className="flex flex-col text-left">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 leading-none">
              Today
            </span>
            <span className="text-xs font-bold text-slate-800 leading-tight">
              {currentDateStr}
            </span>
          </div>
        </div>
        {/* Notifications Icon with Dynamic Badge */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={toggleNotifications}
            className="relative p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Notifications"
          >
            <Bell className="w-5 h-5 text-slate-700" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full ring-2 ring-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>

          {notifMenuOpen && (
            <div className="absolute right-0 mt-3 w-96 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100/80 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100/80">
                <span className="text-xs font-bold text-slate-800">Notifications</span>
                {unread > 0 && (
                  <button
                    onClick={async () => {
                      await api.notifications.markAllRead().catch(() => undefined);
                      reloadInbox();
                    }}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
                {!inbox || inbox.items.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs">No notifications yet.</div>
                ) : (
                  inbox.items.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => openNotification(n)}
                      className={`w-full text-left px-3.5 py-2.5 hover:bg-slate-50 cursor-pointer ${n.read_at ? "" : "bg-blue-50/40"}`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                            n.read_at ? "bg-transparent" : n.kind.startsWith("sla") || n.kind === "complaint.escalated" ? "bg-rose-500" : "bg-blue-500"
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800">{n.title}</div>
                          {n.body && <div className="text-[11px] text-slate-500 line-clamp-2">{n.body}</div>}
                          <div className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(n.created_at)}</div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>


        <QuickActionsBar />

        {/* User Profile Avatar with Initials and Name */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 p-1 rounded-none hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-none bg-blue-100 text-blue-700 font-bold text-xs shadow-inner">
              {getInitials(me.name)}
            </div>
            <span className="text-xs font-semibold text-slate-800 hidden sm:inline-block">
              {me.name}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:inline-block" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-3 w-64 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100/80 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-3.5 py-2 border-b border-slate-100/80">
                <p className="text-xs font-bold text-slate-800">{me.name}</p>
                <p className="text-[11px] text-slate-400 truncate">{me.email}</p>
                <div className="mt-1">
                  <span className="inline-block px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 rounded-md">
                    {me.role.name}
                  </span>
                </div>
                {!me.is_super_admin && (
                  <ul className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                    {me.scopes.map((scope, i) => (
                      <li key={i} className="truncate">• {scopeLabel(scope)}</li>
                    ))}
                  </ul>
                )}
              </div>
              {can("complaint.receive") && (
                <label className="flex items-center gap-2 px-3.5 py-2 text-xs text-slate-700 border-b border-slate-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={me.is_available}
                    onChange={async (e) => {
                      await api.auth.setAvailability(e.target.checked).catch(() => undefined);
                      reload();
                    }}
                  />
                  Available for new complaints
                </label>
              )}
              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
