import React, { useState } from "react";
import { api, DashboardStats } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { formatDay } from "@/lib/format";
import { useApiData } from "@/lib/hooks";
import { TREND_COLORS, TrendLineChart } from "./reports/TrendLineChart";
import { CardDateFilter, DateRange } from "./CardDateFilter";

const SERIES = [
  { key: "received", label: "Received", color: TREND_COLORS[0] },
  { key: "resolved", label: "Resolved", color: TREND_COLORS[2] },
];

export function DashboardTrend({ trend, loading }: { trend: DashboardStats["trend"] | undefined; loading: boolean }) {
  const { ui } = useConfig();
  const [dateRange, setDateRange] = useState<DateRange>(null);
  
  const customStats = useApiData(
    () => (dateRange ? api.complaints.stats(dateRange) : Promise.resolve(undefined)),
    [dateRange?.date_from, dateRange?.date_to]
  );
  
  const activeTrend = dateRange ? customStats.data?.trend : trend;
  const isLoading = dateRange ? customStats.loading : loading;
  
  const title = dateRange && dateRange.date_from && dateRange.date_to
    ? `${formatDay(dateRange.date_from)} - ${formatDay(dateRange.date_to)}`
    : `Last ${ui.dashboard_trend_days} days`;

  return (
    <div className="flex flex-col p-5 sm:p-6 bg-white border border-slate-200/60 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] h-full transition-shadow hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h2 className="text-base font-bold text-slate-800">{title}</h2>
        <CardDateFilter onChange={setDateRange} />
      </div>
      {isLoading || !activeTrend ? (
        <div className="flex-1 min-h-40 bg-slate-50 rounded-xl animate-pulse" />
      ) : (
        <TrendLineChart
          points={activeTrend.map((p) => ({ ...p, label: formatDay(p.date) }))}
          series={SERIES}
          height={180}
          ariaLabel="Complaints received and resolved per day; use the arrow keys to read values."
        />
      )}
    </div>
  );
}
