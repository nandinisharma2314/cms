import React from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export interface MetricCardData {
  id: string;
  title: string;
  value: string;
  /** Change vs the previous 30 days; null when there is no earlier data to compare. */
  trend: string | null;
  trendType: "positive" | "negative";
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

interface MetricCardsProps {
  metrics?: MetricCardData[];
  isLoading?: boolean;
}

export function MetricCards({ metrics = [], isLoading = false }: MetricCardsProps) {
  if (isLoading || metrics.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-5 bg-white rounded-none border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] animate-pulse"
          >
            <div className="w-14 h-14 rounded-none bg-slate-100 shrink-0" />
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {metrics.map((card) => {
        const IconComponent = card.icon;
        const isGreen = card.trendType === "positive";

        return (
          <div
            key={card.id}
            className="flex items-center gap-4 p-5 bg-white rounded-none border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-md transition-shadow"
          >
            <div
              className={`w-14 h-14 rounded-none ${card.iconBg} flex items-center justify-center shrink-0`}
            >
              <IconComponent className={`w-7 h-7 ${card.iconColor}`} />
            </div>

            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-500 tracking-normal">
                {card.title}
              </span>
              <span className="text-2xl font-bold text-slate-800 tracking-tight my-0.5">
                {card.value}
              </span>
              {card.trend === null ? (
                <span className="text-xs text-slate-400 font-normal">No data for previous 30 days</span>
              ) : (
                <div className="flex items-center gap-1.5 text-xs">
                  <span
                    className={`font-semibold flex items-center ${
                      isGreen ? "text-emerald-600" : "text-rose-500"
                    }`}
                  >
                    {isGreen ? (
                      <ArrowUpRight className="w-3.5 h-3.5 inline mr-0.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5 inline mr-0.5" />
                    )}
                    {card.trend}
                  </span>
                  <span className="text-slate-400 font-normal">vs previous 30 days</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
