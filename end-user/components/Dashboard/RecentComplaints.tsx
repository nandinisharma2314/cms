"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { apis, Complaint, StatusGroup } from "@/lib/apis";
import { useEndUser } from "@/lib/endUserSession";
import { formatDateTime, shortPlace } from "@/lib/utils";

// Same buckets and names as the counts in StatCard.
const STATUS_PILLS: Record<StatusGroup, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-red-50 text-red-500" },
  in_progress: { label: "In Progress", className: "bg-blue-50 text-blue-600" },
  resolved: { label: "Resolved", className: "bg-emerald-50 text-emerald-600" },
  rejected: { label: "Rejected", className: "bg-slate-100 text-slate-600" },
};

// Each department keeps one dot color; departments not listed get a stable pick.
const DOT_COLORS = [
  "bg-amber-400", "bg-blue-600", "bg-red-500", "bg-violet-500",
  "bg-emerald-500", "bg-orange-400", "bg-cyan-500", "bg-pink-500",
];
const DEPARTMENT_DOTS: Record<string, number> = { Electricity: 0, Water: 1, Sanitation: 2, Roads: 3, Parks: 4 };

function dotColor(department: string) {
  const index =
    DEPARTMENT_DOTS[department] ??
    [...department].reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) >>> 0, 0) % DOT_COLORS.length;
  return DOT_COLORS[index];
}

/** The end user's five most recent complaints; a row opens its detail page. */
const RecentComplaints = () => {
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const canCreate = useEndUser().can("portal.complaint.create");

  useEffect(() => {
    apis.complaints
      .getComplaints()
      .then(setComplaints)
      .catch((err) => {
        console.error("Failed to fetch complaints:", err);
        setComplaints([]);
      });
  }, []);

  const recent = (complaints ?? []).slice(0, 5);

  return (
    <section className="min-w-0 flex-1 rounded-2xl bg-white px-4 pb-1 pt-4 shadow-[0_2px_14px_-6px_rgba(15,23,42,0.12)] md:px-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-[#0b1a3f] md:text-[17px]">Recent Complaints</h2>
        <Link
          href="/dashboard/complaints"
          className="flex items-center text-[14px] font-semibold text-blue-600 hover:text-blue-700"
        >
          View All <ChevronRight className="ml-0.5 h-4 w-4" strokeWidth={2.4} />
        </Link>
      </div>

      {complaints === null ? (
        <ul aria-hidden="true" className="animate-pulse">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 py-4">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              <span className="flex-1 space-y-2">
                <span className="block h-3.5 w-2/3 rounded bg-slate-200" />
                <span className="block h-3 w-1/2 rounded bg-slate-100" />
              </span>
            </li>
          ))}
        </ul>
      ) : recent.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-slate-500">
          You haven&apos;t raised any complaints yet.{" "}
          {canCreate && (
            <Link href="/dashboard/register" className="font-semibold text-blue-600">
              Register one
            </Link>
          )}
        </p>
      ) : (
        <ul>
          {recent.map((c) => {
            const pill = STATUS_PILLS[c.status_group] ?? STATUS_PILLS.open;
            return (
              <li key={c.id} className="group">
                <Link
                  href={`/dashboard/complaints/${encodeURIComponent(c.id)}`}
                  className="flex w-full items-center gap-3.5 text-left"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor(c.department)}`} />
                  <span className="flex min-w-0 flex-1 items-center gap-2 border-b border-slate-100 py-3.5 group-last:border-b-0">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold text-[#0b1a3f]">{c.title}</span>
                      <span className="mt-1 block truncate text-[12.5px] text-slate-500">
                        {c.generated_id}
                        <span className="mx-1.5 text-slate-300">|</span>
                        {shortPlace(c)}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] text-slate-500">{formatDateTime(c.created_at)}</span>
                    </span>
                    <span className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[11.5px] font-medium ${pill.className}`}>
                      {pill.label}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2.4} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default RecentComplaints;
