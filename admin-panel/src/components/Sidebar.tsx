"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpCircle,
  Ban,
  BarChart3,
  Building2,
  ChevronLeft,
  FileText,
  Headphones,
  History,
  Home,
  MapPin,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Timer,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useConfig } from "@/lib/config";
import { useSession } from "@/lib/session";
import { BrandMark } from "./BrandMark";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  /** Shown when the user holds any of these; no list = everyone. */
  anyOf?: string[];
}

// Driven by permissions, not role names, so custom roles get the right menu automatically.
const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/complaints", label: "Complaints", icon: FileText, anyOf: ["complaint.view"] },
  { href: "/escalated", label: "Escalated to me", icon: ArrowUpCircle, anyOf: ["complaint.assign"] },
  {
    href: "/rejection-requests",
    label: "Rejection requests",
    icon: Ban,
    anyOf: ["complaint.reject.approve", "complaint.reject.request"],
  },
  { href: "/my-team", label: "Teams", icon: UserCheck, anyOf: ["team.view"] },
  {
    href: "/grievances",
    label: "Workplace Issues",
    icon: ShieldAlert,
    anyOf: ["grievance.file", "grievance.view_own", "grievance.manage", "grievance.view_all"],
  },
  { href: "/reports", label: "Reports", icon: BarChart3, anyOf: ["reports.view"] },
  { href: "/users", label: "Users", icon: Users, anyOf: ["user.view", "end_user.view"] },
  { href: "/departments", label: "Departments", icon: Building2, anyOf: ["department.view"] },
  { href: "/locations", label: "Locations", icon: MapPin, anyOf: ["location.view"] },
  { href: "/roles", label: "Roles & permissions", icon: ShieldCheck, anyOf: ["role.view"] },
  { href: "/sla", label: "Priorities & SLA", icon: Timer, anyOf: ["sla.manage"] },
  { href: "/imports", label: "Import history", icon: History, anyOf: ["location.import", "end_user.import"] },
  { href: "/audit-logs", label: "Audit log", icon: ScrollText, anyOf: ["audit.view"] },
  { href: "/settings", label: "Settings", icon: Settings, anyOf: ["settings.manage"] },
];

function SupportCard({ collapsed }: { collapsed: boolean }) {
  const { support } = useConfig();
  const lines = [support.phone, support.email].filter((v): v is string => Boolean(v));
  if (lines.length === 0) return null;
  if (collapsed) {
    return (
      <div className="p-3 mx-auto mb-4" title={[...lines, support.hours].filter(Boolean).join("\n")}>
        <div className="w-10 h-10 rounded-full bg-[#162244] border border-[#233566] flex items-center justify-center text-sky-400">
          <Headphones className="w-5 h-5" />
        </div>
      </div>
    );
  }
  return (
    <div className="p-4 m-3.5 rounded-xl bg-[#162244] border border-[#233566] text-[11px]">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-full bg-[#203260] flex items-center justify-center text-sky-400 shrink-0">
          <Headphones className="w-4 h-4" />
        </div>
        <span className="text-xs font-semibold text-white">Support</span>
      </div>
      {support.phone && (
        <a href={`tel:${support.phone.replace(/[^\d+]/g, "")}`} className="block text-slate-300 hover:text-white truncate">
          {support.phone}
        </a>
      )}
      {support.email && (
        <a href={`mailto:${support.email}`} className="block text-slate-300 hover:text-white truncate">
          {support.email}
        </a>
      )}
      {support.hours && <p className="text-slate-500 mt-1">{support.hours}</p>}
    </div>
  );
}

function SidebarItem({ item, active, narrow }: { item: NavItem; active: boolean; narrow: boolean }) {
  const [hovered, setHovered] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });
  const Icon = item.icon;

  return (
    <>
      <Link
        href={item.href}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          // Tooltip height is roughly 24px, Link height is 38px. Offset to center: ~7px
          setPos({ top: rect.top + 7, left: rect.right + 12 });
          setHovered(true);
        }}
        onMouseLeave={() => setHovered(false)}
        aria-current={active ? "page" : undefined}
        className={`flex items-center w-full px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
          active ? "bg-blue-600 text-white shadow-md shadow-blue-900/30" : "text-slate-300 hover:bg-[#1a274c] hover:text-white"
        } ${narrow ? "justify-center" : ""}`}
      >
        <Icon className={`w-4.5 h-4.5 shrink-0 ${narrow ? "" : "mr-3"} ${active ? "" : "text-slate-400"}`} />
        {!narrow && <span>{item.label}</span>}
      </Link>

      {narrow &&
        hovered &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              top: pos.top,
              left: pos.left,
              animation: "tooltipFade 0.15s ease-out forwards",
            }}
            className="fixed px-2.5 py-1 bg-[#1b284e] text-white text-[11px] font-medium rounded shadow-xl border border-[#2a3f72] pointer-events-none z-[100] whitespace-nowrap leading-tight"
          >
            {item.label}
          </div>,
          document.body,
        )}
    </>
  );
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const { canAny } = useSession();
  const items = NAV_ITEMS.filter((item) => !item.anyOf || canAny(...item.anyOf));
  // On phones the drawer always shows labels.
  const narrow = collapsed && !mobileOpen;

  return (
    <>
      <style>{`
        @keyframes tooltipFade {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .sidebar-nav::-webkit-scrollbar { display: none; }
        .sidebar-nav { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-slate-900/60 lg:hidden" onClick={onCloseMobile} aria-hidden="true" />}
      <aside
        className={`fixed lg:sticky inset-y-0 left-0 top-0 z-50 lg:z-30 flex flex-col bg-[#111c38] text-slate-300 transition-all duration-300 shrink-0 h-screen border-r border-[#1e2d54] ${
          narrow ? "lg:w-20" : "lg:w-64"
        } w-72 ${mobileOpen ? "translate-x-0" : "-translate-x-full invisible lg:visible lg:translate-x-0"}`}
        aria-label="Main navigation"
      >
        <div
          className={`flex items-center gap-2 px-5 py-5 border-b border-[#1b284e] ${narrow ? "justify-center" : "justify-between"}`}
        >
          {!narrow && <BrandMark theme="dark" />}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-full bg-[#1e2d54] text-slate-300 hover:text-white hover:bg-blue-600 transition-colors cursor-pointer shrink-0"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} />
          </button>
          <button
            onClick={onCloseMobile}
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded-full bg-[#1e2d54] text-slate-300 hover:text-white cursor-pointer shrink-0"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="sidebar-nav flex-1 overflow-y-auto px-3.5 py-4 space-y-1">
          {items.map((item) => {
            const itemPath = item.href.split("?")[0];
            const active = itemPath === "/" ? pathname === "/" : pathname === itemPath || pathname.startsWith(itemPath + "/");
            return <SidebarItem key={item.href} item={item} active={active} narrow={narrow} />;
          })}
        </nav>

        <SupportCard collapsed={narrow} />
      </aside>
    </>
  );
}
