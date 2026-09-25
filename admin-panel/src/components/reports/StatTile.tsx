import React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export type Better = "up" | "down" | "neutral";

const GOOD = "#006300"; // success text
const BAD = "#d03b3b"; // status critical
const SECONDARY = "#52514e";

/**
 * label · value · optional detail line · optional delta vs the previous period.
 * The delta's colour says whether the change is good (per `better`), and the
 * arrow + sign say the direction, so colour never carries it alone.
 */
export function StatTile({
  label,
  value,
  detail,
  current,
  previous,
  better = "neutral",
  formatDelta,
  periodLabel,
}: {
  label: string;
  value: string;
  detail?: string;
  current?: number | null;
  previous?: number | null;
  better?: Better;
  formatDelta?: (delta: number) => string;
  periodLabel: string;
}) {
  let delta: React.ReactNode = null;
  if (current != null && previous != null) {
    const change = current - previous;
    const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
    const good = better === "neutral" || change === 0 ? null : (change > 0) === (better === "up");
    const color = good === null ? SECONDARY : good ? GOOD : BAD;
    const text = formatDelta ? formatDelta(change) : `${change > 0 ? "+" : ""}${change.toLocaleString()}`;
    delta = (
      <div className="flex flex-wrap items-center gap-x-1 text-[11px] mt-1">
        <span className="flex items-center font-semibold whitespace-nowrap" style={{ color }}>
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          {text}
        </span>
        <span className="text-slate-400 whitespace-nowrap">
          vs {periodLabel}
          {good !== null && <span className="sr-only">{good ? " (better)" : " (worse)"}</span>}
        </span>
      </div>
    );
  }
  return (
    <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 mt-0.5">{value}</div>
      {detail && <div className="text-[11px] text-slate-500 mt-0.5">{detail}</div>}
      {delta}
    </div>
  );
}
