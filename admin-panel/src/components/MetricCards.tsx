import React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Change } from "@/lib/api";

export interface MetricCardData {
  id: string;
  title: string;
  value: number;
  /** Change vs the previous comparison window; null when there is nothing to compare with. */
  change: Change | null;
  icon: React.ElementType;
  tint: string;
}

const SENTIMENT_COLOR: Record<Change["sentiment"], string> = {
  good: "text-emerald-700",
  bad: "text-rose-600",
  neutral: "text-slate-500",
};

function ChangeLine({ change, days }: { change: Change | null; days: number }) {
  if (change === null) return <span className="text-xs text-slate-400">No data for the previous {days} days</span>;
  const Icon = change.direction === "up" ? ArrowUpRight : change.direction === "down" ? ArrowDownRight : Minus;
  const verdict = change.sentiment === "neutral" ? "" : change.sentiment === "good" ? " (better)" : " (worse)";
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 text-xs">
      <span className={`font-semibold flex items-center ${SENTIMENT_COLOR[change.sentiment]}`}>
        <Icon className="w-3.5 h-3.5 mr-0.5" aria-hidden="true" />
        {change.percent > 0 ? "+" : ""}
        {change.percent}%<span className="sr-only">{verdict}</span>
      </span>
      <span className="text-slate-400">vs previous {days} days</span>
    </span>
  );
}

export function MetricCards({ metrics, loading, days }: { metrics: MetricCardData[]; loading: boolean; days: number }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-slate-100 animate-pulse">
            <div className="w-14 h-14 rounded-xl bg-slate-100 shrink-0" />
            <div className="flex flex-col gap-2 flex-1">
              <div className="w-20 h-3 bg-slate-100 rounded" />
              <div className="w-16 h-6 bg-slate-200 rounded" />
              <div className="w-24 h-3 bg-slate-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
      {metrics.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.id}
            className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)]"
          >
            <div className={`w-14 h-14 rounded-xl ${card.tint} flex items-center justify-center shrink-0`}>
              <Icon className="w-7 h-7" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-slate-500">{card.title}</span>
              <span className="text-2xl font-bold text-slate-800 tracking-tight my-0.5">{card.value.toLocaleString()}</span>
              <ChangeLine change={card.change} days={days} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
