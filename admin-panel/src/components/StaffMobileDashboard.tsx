"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpCircle, ChevronRight } from "lucide-react";
import { api, ComplaintData, DashboardStats } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { scopeLabel } from "./ScopeEditor";
import { StatusBadge } from "./ui";

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function StaffMobileDashboard() {
  const { me, can, setMe } = useSession();
  const canViewComplaints = can("complaint.view");
  const canAssign = can("complaint.assign");
  const canCreate = can("complaint.create");
  const isAgent = me.role.key === "agent" || me.role.key === "field_worker";

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [complaints, setComplaints] = useState<ComplaintData[] | null>(null);
  const [loading, setLoading] = useState(canViewComplaints);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!canViewComplaints) {
      return;
    }

    Promise.all([
      api.complaints.stats(),
      api.complaints.list({
        assigned: isAgent ? "me" : undefined,
        page_size: 5,
      }),
    ])
      .then(([statsData, complaintsData]) => {
        setStats(statsData);
        setComplaints(complaintsData.items);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [canViewComplaints, isAgent]);

  const toggleAvailability = async () => {
    setToggling(true);
    try {
      const updated = await api.auth.setAvailability(!me.is_available);
      setMe(updated);
    } catch {
      // keep current state
    } finally {
      setToggling(false);
    }
  };

  const m = stats?.metrics;
  const pending = stats?.pending_summary;

  const tiles = isAgent
    ? [
        {
          label: "My Tasks",
          count: pending?.assigned_to_me ?? 0,
          tile: "bg-[#eef3fb]",
          value: "text-[#0b1a3f]",
          caption: "text-slate-500",
          href: "/complaints?assigned=me",
        },
        {
          label: "Awaiting",
          count: m?.open ?? 0,
          tile: "bg-red-50",
          value: "text-red-600",
          caption: "text-slate-500",
          href: "/complaints?group=open",
        },
        {
          label: "Escalated",
          count: m?.escalated ?? 0,
          tile: "bg-violet-50",
          value: "text-violet-600",
          caption: "text-violet-900/60",
          href: "/escalated",
        },
        {
          label: "Resolved",
          count: m?.resolved ?? 0,
          tile: "bg-emerald-50",
          value: "text-emerald-600",
          caption: "text-emerald-800/80",
          href: "/complaints?group=resolved",
        },
      ]
    : [
        {
          label: "Total",
          count: m?.total ?? 0,
          tile: "bg-[#eef3fb]",
          value: "text-[#0b1a3f]",
          caption: "text-slate-500",
          href: "/complaints",
        },
        {
          label: "Awaiting",
          count: m?.open ?? 0,
          tile: "bg-red-50",
          value: "text-red-600",
          caption: "text-slate-500",
          href: "/complaints?group=open",
        },
        {
          label: "Escalated",
          count: m?.escalated ?? 0,
          tile: "bg-violet-50",
          value: "text-violet-600",
          caption: "text-violet-900/60",
          href: "/escalated",
        },
        {
          label: "Resolved",
          count: m?.resolved ?? 0,
          tile: "bg-emerald-50",
          value: "text-emerald-600",
          caption: "text-emerald-800/80",
          href: "/complaints?group=resolved",
        },
      ];

  const scopeText = me.is_super_admin ? "Entire system" : me.scopes.map(scopeLabel).join("; ") || null;
  const hour = new Date().getHours();

  return (
    <div className="flex flex-col gap-3.5 pb-6">
      {/* 1. Greeting & Profile Section */}
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-[14px] text-slate-500">{greetingFor(hour)},</p>
          <h1 className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight text-slate-900 truncate">
            {me.name} <span aria-hidden="true">👋</span>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="font-semibold text-blue-600">{me.role.name}</span>
            {scopeText && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-slate-500 truncate max-w-[200px]">{scopeText}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleAvailability}
            disabled={toggling}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all ${
              me.is_available
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-600 border border-slate-200"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${me.is_available ? "bg-emerald-500" : "bg-slate-400"}`} />
            {me.is_available ? "Available" : "Off duty"}
          </button>
        </div>
      </div>

      {/* 2. Stat Tiles Card (Matches End User StatCard perfectly) */}
      <section className="rounded-2xl bg-white p-3.5 shadow-[0_2px_14px_-6px_rgba(15,23,42,0.12)]">
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-[15px] font-bold text-[#0b1a3f]">Work queue</h2>
          <Link href="/complaints" className="flex items-center text-[13px] font-semibold text-blue-600 hover:text-blue-700">
            View all <ChevronRight className="ml-0.5 h-3.5 w-3.5" strokeWidth={2.4} />
          </Link>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {tiles.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className={`rounded-xl px-1 py-3 text-center transition-transform active:scale-[0.98] ${t.tile}`}
            >
              <div className={`text-[20px] font-bold leading-none ${t.value}`}>{loading ? "–" : t.count}</div>
              <div className={`mt-2 truncate text-[11px] font-medium leading-none ${t.caption}`}>{t.label}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* 3. Escalations Alert Banner (if any) */}
      {canAssign && (m?.escalated ?? 0) > 0 && (
        <Link
          href="/escalated"
          className="flex items-center justify-between gap-3 rounded-2xl bg-linear-to-r from-violet-50 to-purple-50 border border-violet-100 p-3.5 shadow-xs transition-transform active:scale-[0.99]"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-xs">
              <ArrowUpCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-violet-950 truncate">
                {m?.escalated} escalated {m?.escalated === 1 ? "complaint" : "complaints"}
              </div>
              <p className="text-[11.5px] text-violet-700">Requires review or reassignment</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-violet-400" />
        </Link>
      )}

      {/* 4. Recent Requests / Tasks Feed (Matches RecentComplaints.tsx styling) */}
      <section className="min-w-0 flex-1 rounded-2xl bg-white px-4 pb-1 pt-4 shadow-[0_2px_14px_-6px_rgba(15,23,42,0.12)]">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[15px] font-bold text-[#0b1a3f]">{isAgent ? "Assigned to you" : "Recent requests"}</h2>
          <Link
            href={isAgent ? "/complaints?assigned=me" : "/complaints"}
            className="flex items-center text-[13px] font-semibold text-blue-600 hover:text-blue-700"
          >
            View all <ChevronRight className="ml-0.5 h-3.5 w-3.5" strokeWidth={2.4} />
          </Link>
        </div>

        {loading ? (
          <ul aria-hidden="true" className="animate-pulse">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 py-3.5">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="flex-1 space-y-1.5">
                  <span className="block h-3.5 w-2/3 rounded bg-slate-200" />
                  <span className="block h-3 w-1/2 rounded bg-slate-100" />
                </span>
              </li>
            ))}
          </ul>
        ) : !complaints || complaints.length === 0 ? (
          <p className="py-7 text-center text-[13px] text-slate-500">
            No active complaints in your queue.
            {canCreate && (
              <Link href="/complaints" className="block mt-1 font-semibold text-blue-600">
                Register a complaint
              </Link>
            )}
          </p>
        ) : (
          <ul>
            {complaints.map((c) => (
              <li key={c.id} className="group">
                <Link href={`/complaints/${encodeURIComponent(c.id)}`} className="flex w-full items-center gap-3 text-left">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 items-center gap-2 border-b border-slate-100 py-3 group-last:border-b-0">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-[#0b1a3f]">{c.title}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-slate-500">
                        {c.id}
                        <span className="mx-1 text-slate-300" aria-hidden="true">
                          |
                        </span>
                        {c.department}
                        {c.location && (
                          <>
                            <span className="mx-1 text-slate-300" aria-hidden="true">
                              |
                            </span>
                            {c.location}
                          </>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">{formatDateTime(c.created_at)}</span>
                    </span>
                    <span className="shrink-0 flex flex-col items-end gap-1">
                      <StatusBadge status={c.status} label={c.status_label} />
                      {c.escalation && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600">
                          <ArrowUpCircle className="w-3 h-3" /> L{c.escalation.level}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2.4} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
