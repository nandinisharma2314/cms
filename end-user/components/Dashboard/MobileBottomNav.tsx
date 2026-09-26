"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, FileText, Home, Plus, User } from "lucide-react";
import { apis } from "@/lib/apis";
import { useEndUser } from "@/lib/endUserSession";

type NavIcon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

interface NavItem {
  name: string;
  icon: NavIcon;
  activeIcon?: NavIcon;
  href: string;
  exact?: boolean;
}

interface MobileBottomNavProps {
  activeTab?: string;
  onTabChange?: React.Dispatch<React.SetStateAction<string>>;
  onCenterAction?: () => void;
}

// Filled house with the door cut out, for the active Home tab.
function HomeSolid({ className }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M10.7 2.6a2 2 0 0 1 2.6 0l7.3 6.3a2 2 0 0 1 .7 1.5V19a2 2 0 0 1-2 2h-3.8v-5.3a1.5 1.5 0 0 0-1.5-1.5h-4a1.5 1.5 0 0 0-1.5 1.5V21H4.7a2 2 0 0 1-2-2v-8.6a2 2 0 0 1 .7-1.5z" />
    </svg>
  );
}

const LEFT_ITEMS: NavItem[] = [
  { name: "Home", icon: Home, activeIcon: HomeSolid, href: "/dashboard", exact: true },
  { name: "My Complaints", icon: FileText, href: "/dashboard/complaints" },
];

const RIGHT_ITEMS: NavItem[] = [
  { name: "Notifications", icon: Bell, href: "/dashboard/notifications" },
  { name: "Profile", icon: User, href: "/dashboard/profile" },
];

// The tabs follow the URL; the props are only accepted for older callers.
const MobileBottomNav: React.FC<MobileBottomNavProps> = () => {
  const pathname = usePathname();
  const canCreate = useEndUser().can("portal.complaint.create");
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    apis.notifications
      .list()
      .then((res) => setHasUnread(res.unread_count > 0))
      .catch(() => undefined);
  }, [pathname]);

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
          {item.href === "/dashboard/notifications" && hasUnread && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
          )}
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
        {LEFT_ITEMS.map(renderItem)}
        {canCreate && <div className="w-[72px] shrink-0" />}
        {RIGHT_ITEMS.map(renderItem)}

        {canCreate && (
          <Link
            href="/dashboard/register"
            aria-label="Register a complaint"
            className="absolute left-1/2 -top-7 flex h-[60px] w-[60px] -translate-x-1/2 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-[6px] ring-slate-50 transition-transform active:scale-95"
          >
            <Plus className="h-7 w-7" strokeWidth={2.6} />
          </Link>
        )}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
