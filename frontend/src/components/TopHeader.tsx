/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Award, Bell, Camera, ChevronDown, KeyRound, LogOut, MapPin, Menu, Search, Shield, User } from "lucide-react";
import { api, NotificationItem, NOTIFICATIONS_CHANGED_EVENT, resolveAvatarUrl } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { formatDateTime, initials } from "@/lib/format";
import { useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { scopeLabel } from "./ScopeEditor";
import { QuickActionsBar } from "./QuickActionsBar";
import { ChangePasswordModal } from "./ChangePasswordForm";
import { ChangeAvatarModal } from "./ChangeAvatarModal";
import { openCommandPalette } from "./CommandPalette";
import { SystemHealthPill } from "./SystemHealthPill";

/** Closes a popover on outside click or Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
  return { open, setOpen, ref };
}

function Notifications() {
  const router = useRouter();
  const { me } = useSession();
  const { ui } = useConfig();
  const { open: menuOpen, setOpen: setMenuOpen, ref: menuRef } = usePopover();
  const {
    data: inbox,
    error,
    reload,
  } = useApiData(() => api.notifications.list({ page_size: ui.notification_menu_items }), [me.id, ui.notification_menu_items]);

  useEffect(() => {
    const timer = setInterval(reload, ui.notification_poll_seconds * 1000);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, reload);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, reload);
    };
  }, [reload, ui.notification_poll_seconds]);

  const openNotification = async (n: NotificationItem) => {
    setMenuOpen(false);
    if (!n.read_at) await api.notifications.markRead(n.id).catch(() => undefined);
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT)); // reloads this menu and the notifications page
    if (n.complaint_id) router.push(`/complaints/${encodeURIComponent(n.complaint_id)}`);
  };

  const unread = inbox?.unread_count ?? 0;
  return (
    <div className="static sm:relative" ref={menuRef}>
      <button
        onClick={async () => {
          const opening = !menuOpen;
          setMenuOpen(opening);
          if (opening && unread > 0) {
            await api.notifications.markAllRead().catch(() => undefined);
            window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
          }
        }}
        className="relative p-2.5 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={menuOpen}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-4.5 h-4.5 px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {menuOpen && (
        <div className="absolute left-4 right-4 top-16 sm:top-auto sm:left-auto sm:right-0 sm:mt-3 sm:w-[24rem] bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 z-50">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-800">Notifications</span>
            {unread > 0 && (
              <button
                onClick={async () => {
                  await api.notifications.markAllRead().catch(() => undefined);
                  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
                }}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {!inbox ? (
              <p className="p-6 text-center text-slate-400 text-xs">{error ?? "Loading…"}</p>
            ) : inbox.items.length === 0 ? (
              <p className="p-6 text-center text-slate-400 text-xs">No notifications yet.</p>
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
                        n.read_at
                          ? "bg-transparent"
                          : n.kind.startsWith("sla") || n.kind === "complaint.escalated"
                            ? "bg-rose-500"
                            : "bg-blue-500"
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800">
                        {n.title}
                        {!n.read_at && <span className="sr-only"> (unread)</span>}
                      </div>
                      {n.body && <div className="text-[11px] text-slate-500 line-clamp-2">{n.body}</div>}
                      <div className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(n.created_at)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          <Link
            href="/notifications"
            onClick={() => setMenuOpen(false)}
            className="block px-3.5 py-2 border-t border-slate-100 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
          >
            {inbox && inbox.total > inbox.items.length
              ? `See all ${inbox.total.toLocaleString()} notifications`
              : "Open notifications"}
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { me, can, logout, setMe } = useSession();
  const { open: menuOpen, setOpen: setMenuOpen, ref: menuRef } = usePopover();
  const [error, setError] = useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
        aria-expanded={menuOpen}
        aria-label="Account menu"
      >
        <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-100 text-blue-700 font-bold text-xs overflow-hidden">
          {me.avatar_url ? (
            <img src={resolveAvatarUrl(me.avatar_url)!} alt={me.name} className="w-full h-full object-cover" />
          ) : (
            initials(me.name)
          )}
        </span>
        <span className="text-xs font-semibold text-slate-800 hidden md:inline-block max-w-35 truncate">{me.name}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden md:inline-block" />
      </button>

      {menuOpen && (
        <div className="absolute right-0 mt-3 w-72 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 py-2 z-50">
          <div className="px-3.5 py-2 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-800">{me.name}</p>
            <p className="text-[11px] text-slate-400 truncate">{me.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 rounded-md">
              {me.role.name}
            </span>
            {!me.is_super_admin && (
              <ul className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                {me.scopes.map((scope, i) => (
                  <li key={i} className="truncate">
                    • {scopeLabel(scope)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {can("complaint.receive") && (
            <label className="flex items-start gap-2 px-3.5 py-2 text-xs text-slate-700 border-b border-slate-100 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={me.is_available}
                onChange={async (e) => {
                  setError(null);
                  try {
                    setMe(await api.auth.setAvailability(e.target.checked));
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              />
              <span>
                Available for new complaints
                <span className="block text-[10px] text-slate-400">Automatic routing skips you while this is off.</span>
              </span>
            </label>
          )}
          {error && <p className="px-3.5 py-1 text-[11px] text-rose-600">{error}</p>}
          {can("rewards.view") && (
            <Link
              href="/rewards"
              onClick={() => setMenuOpen(false)}
              className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium text-amber-800 hover:bg-amber-50 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Award className="w-3.5 h-3.5 text-amber-600" />
                Rewards & Recognition
              </span>
              <span className="font-bold text-[11px] text-amber-700">🪙 {me.reward_points_balance ?? 0}</span>
            </Link>
          )}
          <Link
            href={can("settings.manage") ? "/settings" : `/users/staff/${me.id}`}
            onClick={() => setMenuOpen(false)}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer text-left"
          >
            <User className="w-3.5 h-3.5" /> View Profile
          </Link>
          <button
            onClick={() => {
              setAvatarOpen(true);
              setMenuOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer text-left"
          >
            <Camera className="w-3.5 h-3.5" /> Change profile photo
          </button>
          <button
            onClick={() => {
              setPasswordOpen(true);
              setMenuOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer text-left"
          >
            <KeyRound className="w-3.5 h-3.5" /> Change password
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      )}
      {passwordOpen && <ChangePasswordModal onClose={() => setPasswordOpen(false)} />}
      {avatarOpen && <ChangeAvatarModal onClose={() => setAvatarOpen(false)} />}
    </div>
  );
}

export function TopHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const router = useRouter();
  const { me, can } = useSession();
  const [search, setSearch] = useState("");
  const scopeSummary = me.is_super_admin
    ? "Entire system"
    : me.scopes.length === 1
      ? scopeLabel(me.scopes[0])
      : `${me.scopes.length} scopes`;

  const hideHamburger = ["agent", "manager", "team_lead", "supervisor", "field_worker"].includes(me.role.key);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 py-3 px-4 sm:px-6 lg:px-8 bg-slate-50/95 backdrop-blur border-b border-slate-100 lg:border-0">
      {!hideHamburger && (
        <button
          onClick={onOpenMenu}
          className="lg:hidden p-2 rounded-xl text-slate-700 hover:bg-slate-100 cursor-pointer"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {can("complaint.view") ? (
        <div
          onClick={openCommandPalette}
          className="relative flex-1 max-w-lg hidden sm:flex items-center h-11 pl-10 pr-3.5 bg-white border border-slate-200/90 rounded-xl hover:border-slate-300 hover:shadow-xs transition-all cursor-pointer group select-none"
          title="Open Command Palette (Ctrl + Space)"
        >
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors pointer-events-none" />
          <span className="text-xs text-slate-400 group-hover:text-slate-600 transition-colors flex-1 truncate">
            Search tickets, navigate, or run commands…
          </span>
          <kbd className="hidden md:inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-mono font-bold text-slate-500 shadow-2xs group-hover:bg-slate-200/80 transition-colors">
            Ctrl + Space
          </kbd>
        </div>
      ) : null}
      <div className="flex-1 sm:hidden" />

      <div className="flex items-center gap-2 sm:gap-3 ml-auto">
        
        <div
          className="hidden xl:flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl"
          title={me.scopes.map(scopeLabel).join("\n") || scopeSummary}
        >
          <Shield className="w-4 h-4 text-blue-600" />
          <span>{me.role.name}</span>
          <span className="text-blue-300" aria-hidden="true">
            |
          </span>
          <MapPin className="w-3.5 h-3.5 text-blue-500" />
          <span className="font-medium max-w-55 truncate">{scopeSummary}</span>
        </div>
        {can("rewards.view") && (
          <Link
            href="/rewards"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 text-amber-900 transition-colors cursor-pointer text-xs font-semibold shadow-xs pointer-events-none md:pointer-events-auto"
            title={`Reward Points: ${me.reward_points_balance ?? 0}`}
          >
            <span className="text-sm">🪙</span>
            <span className="font-bold text-amber-900">{me.reward_points_balance ?? 0}</span>
            <span className="hidden sm:inline text-[11px] text-amber-700 font-medium">pts</span>
          </Link>
        )}
        <SystemHealthPill />
        <Notifications />
        <QuickActionsBar />
        <UserMenu />
      </div>
    </header>
  );
}
