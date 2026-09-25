"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CivicLogo } from "./CivicLogo";
import {
  Home,
  FileText,
  Users,
  Contact,
  Building2,
  MapPin,
  ShieldCheck,
  ScrollText,
  Timer,
  ArrowUpCircle,
  Ban,
  History,
  BarChart3,
  Headphones,
  ChevronLeft,
} from "lucide-react";
import { useSession } from "@/lib/session";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  /** Shown when the user holds any of these; no list = everyone. */
  anyOf?: string[];
}

// What a user sees is driven by permissions, not role names, so custom roles
// get the right menu automatically.
const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/complaints", label: "Complaints", icon: FileText, anyOf: ["complaint.view"] },
  { href: "/complaints?escalated=me", label: "Escalated to Me", icon: ArrowUpCircle, anyOf: ["complaint.assign"] },
  {
    href: "/rejection-requests",
    label: "Rejection Requests",
    icon: Ban,
    anyOf: ["complaint.reject.approve", "complaint.reject.request"],
  },
  { href: "/reports", label: "Reports", icon: BarChart3, anyOf: ["reports.view"] },
  { href: "/users", label: "Staff Users", icon: Users, anyOf: ["user.view"] },
  { href: "/end-users", label: "Citizens", icon: Contact, anyOf: ["end_user.view"] },
  { href: "/departments", label: "Departments", icon: Building2, anyOf: ["department.view"] },
  { href: "/locations", label: "Locations", icon: MapPin, anyOf: ["location.view"] },
  { href: "/roles", label: "Roles & Permissions", icon: ShieldCheck, anyOf: ["role.manage"] },
  { href: "/sla", label: "SLA & Escalation", icon: Timer, anyOf: ["sla.manage"] },
  { href: "/imports", label: "Import History", icon: History, anyOf: ["location.import", "end_user.import"] },
  { href: "/audit-logs", label: "Audit Logs", icon: ScrollText, anyOf: ["audit.view"] },
];

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { canAny } = useSession();
  const items = NAV_ITEMS.filter((item) => !item.anyOf || canAny(...item.anyOf));

  return (
    <aside
      className={`sticky top-0 flex flex-col bg-[#111c38] text-slate-300 transition-all duration-300 ease-in-out z-30 shrink-0 ${
        isCollapsed ? "w-20" : "w-64"
      } h-screen border-r border-[#1e2d54]`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-[#1b284e]">
        {!isCollapsed && <CivicLogo size={36} theme="dark" />}
        {isCollapsed && (
          <div className="mx-auto">
            <CivicLogo size={32} showText={false} theme="dark" />
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-[#1e2d54] text-slate-300 hover:text-white hover:bg-[#2563eb] transition-colors cursor-pointer"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            className={`w-4 h-4 transition-transform duration-300 ${
              isCollapsed ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3.5 py-4 space-y-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          // Links with a query (filtered views) are not highlighted; their base page is.
          const active =
            !item.href.includes("?") && (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center w-full px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-[#2563eb] text-white shadow-md shadow-blue-900/30"
                  : "text-slate-300 hover:bg-[#1a274c] hover:text-white"
              }`}
            >
              <Icon className={`w-[18px] h-[18px] mr-3 shrink-0 ${active ? "" : "text-slate-400"}`} />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Need Help Card */}
      {!isCollapsed && (
        <div className="p-4 m-3.5 rounded-xl bg-[#162244] border border-[#233566]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-[#203260] flex items-center justify-center text-sky-400">
              <Headphones className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-white">Need Help?</h4>
              <p className="text-[11px] text-slate-400">Contact support team</p>
            </div>
          </div>
          <button
            onClick={() => alert("Support helpline: +91 1800-CIVIC-CARE\nEmail: support@civiccare.gov.in")}
            className="w-full mt-2 py-2 px-3 text-xs font-medium text-white bg-[#101b38] hover:bg-[#1f2f5e] rounded-lg border border-[#2b3e75] transition-all text-center cursor-pointer shadow-sm"
          >
            Contact Support
          </button>
        </div>
      )}

      {/* Collapsed small support icon */}
      {isCollapsed && (
        <div className="p-3 mx-auto mb-4">
          <button
            onClick={() => alert("Support helpline: +91 1800-CIVIC-CARE")}
            className="w-10 h-10 rounded-full bg-[#162244] border border-[#233566] flex items-center justify-center text-sky-400 hover:bg-[#203260]"
            title="Need Help?"
          >
            <Headphones className="w-5 h-5" />
          </button>
        </div>
      )}
    </aside>
  );
}
