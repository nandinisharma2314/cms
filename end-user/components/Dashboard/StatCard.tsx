"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { apis, ComplaintStats } from "@/lib/apis";

const TILES: { key: keyof ComplaintStats; label: string; tile: string; value: string; caption: string }[] = [
  { key: "total", label: "Total", tile: "bg-[#eef3fb]", value: "text-[#0b1a3f]", caption: "text-slate-500" },
  { key: "open", label: "Open", tile: "bg-red-50", value: "text-red-600", caption: "text-slate-500" },
  { key: "resolved", label: "Resolved", tile: "bg-emerald-50", value: "text-emerald-600", caption: "text-emerald-700/80" },
  { key: "in_progress", label: "In Progress", tile: "bg-violet-50", value: "text-violet-600", caption: "text-violet-900/60" },
];

/** The end user's complaint counts by status group. */
const StatCard = () => {
  const [stats, setStats] = useState<ComplaintStats | null>(null);

  useEffect(() => {
    apis.complaints
      .getDashboardStats()
      .then(setStats)
      .catch((err) => console.error("Error fetching stats:", err));
  }, []);

  return (
    <section className="rounded-2xl bg-white p-3 shadow-[0_2px_14px_-6px_rgba(15,23,42,0.12)] md:p-5">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[16px] font-bold text-[#0b1a3f] md:text-[17px]">My Complaints</h2>
        <Link
          href="/dashboard/complaints"
          className="flex items-center text-[14px] font-semibold text-blue-600 hover:text-blue-700"
        >
          View All <ChevronRight className="ml-0.5 h-4 w-4" strokeWidth={2.4} />
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-2 md:gap-4">
        {TILES.map((t) => (
          <div key={t.key} className={`rounded-xl px-0.5 py-3.5 text-center md:py-5 ${t.tile}`}>
            <div className={`text-[22px] font-bold leading-none md:text-[28px] ${t.value}`}>
              {stats ? stats[t.key] : "–"}
            </div>
            <div className={`mt-2 whitespace-nowrap text-[12px] font-medium leading-none md:text-[13px] ${t.caption}`}>
              {t.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default StatCard;
