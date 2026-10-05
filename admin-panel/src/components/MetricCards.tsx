import React from "react";
import Link from "next/link";
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
  href?: string;
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
      <div className="grid grid-cols-4 gap-2 sm:gap-4 xl:gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col xl:flex-row items-center gap-2 xl:gap-4 p-2 xl:p-5 bg-white border border-slate-100 animate-pulse">
            <div className="w-8 h-8 xl:w-14 xl:h-14 rounded-lg xl:rounded-xl bg-slate-100 shrink-0" />
            <div className="flex flex-col items-center xl:items-start gap-1 xl:gap-2 flex-1 w-full">
              <div className="w-full xl:w-20 h-2 xl:h-3 bg-slate-100 rounded" />
              <div className="w-8 xl:w-16 h-4 xl:h-6 bg-slate-200 rounded" />
              <div className="hidden xl:block w-24 h-3 bg-slate-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-4 xl:gap-5">
      {metrics.map((card) => {
        const Icon = card.icon;
        const innerContent = (
          <>
            <div className={`w-8 h-8 xl:w-14 xl:h-14 rounded-lg xl:rounded-xl ${card.tint} flex items-center justify-center shrink-0`}>
              <Icon className="w-4 h-4 xl:w-7 xl:h-7" />
            </div>
            <div className="flex flex-col min-w-0 items-center xl:items-start w-full">
              <span className="text-[8.5px] sm:text-[10px] xl:text-xs font-semibold text-slate-500 leading-[1.1] sm:leading-tight break-words whitespace-normal text-center xl:text-left">{card.title}</span>
              <span className="text-sm xl:text-2xl font-bold text-slate-800 tracking-tight my-0.5">{card.value.toLocaleString()}</span>
              <div className="hidden xl:block">
                <ChangeLine change={card.change} days={days} />
              </div>
            </div>
          </>
        );

        const className = `flex flex-col xl:flex-row items-center xl:items-start gap-1.5 xl:gap-4 p-2 xl:p-5 bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] text-center xl:text-left ${card.href ? 'hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group block' : ''}`;

        if (card.href) {
          return (
            <Link key={card.id} href={card.href} className={className}>
              {innerContent}
            </Link>
          );
        }

        return (
          <div key={card.id} className={className}>
            {innerContent}
          </div>
        );
      })}
    </div>
  );
}
