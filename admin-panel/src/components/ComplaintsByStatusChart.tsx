"use client";

import React, { useState } from "react";
import Link from "next/link";
import { DashboardStats, StatusGroup } from "@/lib/api";
import { GROUP_COLORS, GROUP_LABELS } from "@/lib/status";

const GROUPS: StatusGroup[] = ["open", "in_progress", "resolved", "rejected"];

/** Donut of every status group (they always add up to the total). */
export function ComplaintsByStatusChart({ stats, loading }: { stats: DashboardStats | undefined; loading: boolean }) {
  const [hovered, setHovered] = useState<StatusGroup | null>(null);
  const total = stats?.metrics.total ?? 0;
  const radius = 68;
  const strokeWidth = 26;
  const circumference = 2 * Math.PI * radius;

  const counts = GROUPS.map((group) => stats?.status_breakdown[group].count ?? 0);
  const slices = GROUPS.map((group, i) => ({
    group,
    count: counts[i],
    fraction: total ? counts[i] / total : 0,
    // where this slice starts: the share of the slices before it
    offset: total ? counts.slice(0, i).reduce((sum, n) => sum + n, 0) / total : 0,
  }));

  return (
    <div className="flex flex-col p-5 sm:p-6 bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] h-full">
      <h2 className="text-base font-bold text-slate-800 mb-4">Complaints by status</h2>
      {loading ? (
        <div className="flex items-center justify-center flex-1 py-10">
          <div className="w-36 h-36 rounded-full border-4 border-slate-100 border-t-blue-500 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 gap-5">
          <div className="relative w-40 h-40 shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 180 180" role="img" aria-label="Complaints by status">
              <circle cx="90" cy="90" r={radius} stroke="#f1f5f9" strokeWidth={strokeWidth} fill="transparent" />
              {slices
                .filter((s) => s.fraction > 0)
                .map((s) => (
                  <circle
                    key={s.group}
                    cx="90"
                    cy="90"
                    r={radius}
                    stroke={GROUP_COLORS[s.group]}
                    strokeWidth={hovered === s.group ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={`${s.fraction * circumference} ${circumference}`}
                    strokeDashoffset={-s.offset * circumference}
                    fill="transparent"
                    className="transition-all duration-200"
                    onMouseEnter={() => setHovered(s.group)}
                    onMouseLeave={() => setHovered(null)}
                  />
                ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-extrabold text-slate-800 leading-tight">{total.toLocaleString()}</span>
              <span className="text-xs font-semibold text-slate-400">Total</span>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 w-full">
            {slices.map((s) => (
              <li key={s.group}>
                <Link
                  href={`/complaints?group=${s.group}`}
                  onMouseEnter={() => setHovered(s.group)}
                  onMouseLeave={() => setHovered(null)}
                  className={`flex items-start gap-2 text-xs transition-opacity ${hovered && hovered !== s.group ? "opacity-45" : ""}`}
                >
                  <span
                    className="w-2.5 h-2.5 mt-1 rounded-full shrink-0"
                    style={{ backgroundColor: GROUP_COLORS[s.group] }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-700 truncate">{GROUP_LABELS[s.group]}</span>
                    <span className="block text-slate-600">
                      {s.count.toLocaleString()}{" "}
                      <span className="text-slate-400">({stats?.status_breakdown[s.group].percentage ?? 0}%)</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
