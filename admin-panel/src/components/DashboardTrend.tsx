import React from "react";
import { DashboardStats } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { formatDay } from "@/lib/format";
import { TREND_COLORS, TrendLineChart } from "./reports/TrendLineChart";

const SERIES = [
  { key: "received", label: "Received", color: TREND_COLORS[0] },
  { key: "resolved", label: "Resolved", color: TREND_COLORS[2] },
];

export function DashboardTrend({ trend, loading }: { trend: DashboardStats["trend"] | undefined; loading: boolean }) {
  const { ui } = useConfig();
  return (
    <div className="flex flex-col p-5 sm:p-6 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] h-full">
      <h2 className="text-base font-bold text-slate-800 mb-3">Last {ui.dashboard_trend_days} days</h2>
      {loading || !trend ? (
        <div className="flex-1 min-h-40 bg-slate-50 rounded-xl animate-pulse" />
      ) : (
        <TrendLineChart
          points={trend.map((p) => ({ ...p, label: formatDay(p.date) }))}
          series={SERIES}
          height={180}
          ariaLabel="Complaints received and resolved per day; use the arrow keys to read values."
        />
      )}
    </div>
  );
}
