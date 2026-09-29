"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { api, Complaint } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { formatDateTime, shortPlace } from "@/lib/format";
import { useEndUser } from "@/lib/session";
import { departmentDot, GROUP_PILLS } from "@/lib/status";

/** The end user's most recent complaints; a row opens its page. */
export default function RecentComplaints() {
  const { ui } = useConfig();
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canCreate = useEndUser().can("portal.complaint.create");

  useEffect(() => {
    api.complaints.list({ page_size: ui.dashboard_recent_items }).then(
      (page) => setComplaints(page.items),
      (err: Error) => setError(err.message),
    );
  }, [ui.dashboard_recent_items]);

  return (
    <section className="min-w-0 flex-1 rounded-2xl bg-white px-4 pb-1 pt-4 shadow-[0_2px_14px_-6px_rgba(15,23,42,0.12)] md:px-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-[#0b1a3f] md:text-[17px]">Recent complaints</h2>
        <Link
          href="/dashboard/complaints"
          className="flex items-center text-[14px] font-semibold text-blue-600 hover:text-blue-700"
        >
          View all <ChevronRight className="ml-0.5 h-4 w-4" strokeWidth={2.4} />
        </Link>
      </div>

      {error ? (
        <p role="alert" className="py-8 text-center text-[14px] text-red-600">
          {error}
        </p>
      ) : complaints === null ? (
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
      ) : complaints.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-slate-500">
          You haven&apos;t registered any complaints yet.{" "}
          {canCreate && (
            <Link href="/dashboard/register" className="font-semibold text-blue-600">
              Register one
            </Link>
          )}
        </p>
      ) : (
        <ul>
          {complaints.map((c) => {
            const pill = GROUP_PILLS[c.status_group];
            return (
              <li key={c.id} className="group">
                <Link
                  href={`/dashboard/complaints/${encodeURIComponent(c.id)}`}
                  className="flex w-full items-center gap-3.5 text-left"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${departmentDot(c.department)}`} aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 items-center gap-2 border-b border-slate-100 py-3.5 group-last:border-b-0">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold text-[#0b1a3f]">{c.title}</span>
                      <span className="mt-1 block truncate text-[12.5px] text-slate-500">
                        {c.id}
                        <span className="mx-1.5 text-slate-300" aria-hidden="true">
                          |
                        </span>
                        {shortPlace(c.location_detail)}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] text-slate-500">{formatDateTime(c.created_at)}</span>
                    </span>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[11.5px] font-medium ${pill.className}`}
                    >
                      {c.status_label}
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
}
