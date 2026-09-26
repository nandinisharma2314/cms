"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, Clock, FileText } from "lucide-react";

const SHORTCUTS = [
  {
    title: "My Complaints",
    subtitle: "View and track your complaints",
    href: "/dashboard/complaints",
    icon: FileText,
    tone: "bg-blue-50 text-blue-600",
  },
  {
    title: "Track Status",
    subtitle: "Check real-time updates",
    href: "/dashboard/notifications",
    icon: Clock,
    tone: "bg-emerald-50 text-emerald-600",
  },
];

/** The two shortcut cards under the greeting. */
export default function ShortcutCards() {
  return (
    <div className="grid grid-cols-2 gap-2.5 md:gap-5">
      {SHORTCUTS.map(({ title, subtitle, href, icon: Icon, tone }) => (
        <Link
          key={title}
          href={href}
          className="flex items-center rounded-2xl bg-white py-3 pl-2.5 pr-1.5 shadow-[0_2px_14px_-6px_rgba(15,23,42,0.12)] transition-shadow hover:shadow-md active:scale-[0.99] md:p-5"
        >
          <span className={`mr-2 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl md:mr-4 md:h-12 md:w-12 ${tone}`}>
            <Icon className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.1} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold leading-tight text-[#0b1a3f] md:text-[15px]">{title}</span>
            <span className="mt-1 block text-[12px] leading-snug text-slate-500 md:text-[13px]">{subtitle}</span>
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400 md:h-4 md:w-4" strokeWidth={2.6} />
        </Link>
      ))}
    </div>
  );
}
