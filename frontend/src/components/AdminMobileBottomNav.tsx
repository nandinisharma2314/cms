"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ArrowUpCircle, BarChart3, Bell, FileText, Home, Plus, Settings, User, Users } from "lucide-react";
import { useSession } from "@/lib/session";

type NavIcon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

interface NavItem {
  name: string;
  icon: NavIcon;
  activeIcon?: NavIcon;
  href: string;
  exact?: boolean;
}

function HomeSolid({ className }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M10.7 2.6a2 2 0 0 1 2.6 0l7.3 6.3a2 2 0 0 1 .7 1.5V19a2 2 0 0 1-2 2h-3.8v-5.3a1.5 1.5 0 0 0-1.5-1.5h-4a1.5 1.5 0 0 0-1.5 1.5V21H4.7a2 2 0 0 1-2-2v-8.6a2 2 0 0 1 .7-1.5z" />
    </svg>
  );
}

export function AdminMobileBottomNav() {
  const pathname = usePathname();
  const { me, can } = useSession();
  const canCreate = can("complaint.create");

  const leftItems: NavItem[] = [
    { name: "Home", icon: Home, activeIcon: HomeSolid, href: "/", exact: true },
    { name: "Complaints", icon: FileText, href: "/complaints" },
  ];

  const middleItem: NavItem = can("complaint.assign")
    ? { name: "Escalated", icon: ArrowUpCircle, href: "/escalated" }
    : can("reports.view")
      ? { name: "Reports", icon: BarChart3, href: "/reports" }
      : { name: "Notifications", icon: Bell, href: "/notifications" };

  const rightItems: NavItem[] = [
    middleItem,
    { name: "Teams", icon: Users, href: "/my-team" },
  ];

  const renderItem = (item: NavItem) => {
    const isActive = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
    const Icon = (isActive && item.activeIcon) || item.icon;
    return (
      <Link
        key={item.name}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={`relative flex flex-1 flex-col items-center justify-center gap-1.5 ${isActive ? "text-blue-600" : "text-slate-500"}`}
      >
        <span className="relative">
          <Icon className="h-6 w-6" strokeWidth={1.9} />
        </span>
        <span className={`whitespace-nowrap text-[11.5px] leading-none ${isActive ? "font-semibold" : "font-medium"}`}>
          {item.name}
        </span>
        <span className={`absolute bottom-2 h-[3px] w-11 rounded-full bg-blue-600 ${isActive ? "" : "invisible"}`} />
      </Link>
    );
  };

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-50">
      <div className="relative flex h-[76px] items-stretch rounded-t-[28px] bg-white px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_-14px_rgba(15,23,42,0.25)]">
        {leftItems.map(renderItem)}
        {canCreate && <div className="w-[72px] shrink-0" />}
        {rightItems.map(renderItem)}

        {canCreate && (
          <Link
            href="/complaints/new"
            aria-label="New complaint"
            className="absolute left-1/2 -top-7 flex h-[60px] w-[60px] -translate-x-1/2 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-[6px] ring-slate-50 transition-transform active:scale-95"
          >
            <Plus className="h-7 w-7" strokeWidth={2.6} />
          </Link>
        )}
      </div>
    </nav>
  );
}
