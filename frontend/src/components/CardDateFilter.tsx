import React, { useState } from "react";
import { ChevronDown, CalendarDays } from "lucide-react";
import { isoDay } from "@/lib/format";

export type DateRange = { date_from?: string; date_to?: string } | null;

export function CardDateFilter({ onChange }: { onChange: (range: DateRange) => void }) {
  const [mode, setMode] = useState<string>("default");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setMode(val);

    if (val === "default") {
      onChange(null);
    } else if (val === "7d") {
      onChange({ date_from: isoDay(6), date_to: isoDay(0) });
    } else if (val === "30d") {
      onChange({ date_from: isoDay(29), date_to: isoDay(0) });
    } else if (val === "this_year") {
      const year = new Date().getFullYear();
      onChange({ date_from: `${year}-01-01`, date_to: `${year}-12-31` });
    } else if (val === "last_year") {
      const year = new Date().getFullYear() - 1;
      onChange({ date_from: `${year}-01-01`, date_to: `${year}-12-31` });
    }
  };

  const handleCustomChange = (from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
    if (from && to) {
      onChange({ date_from: from, date_to: to });
    }
  };

  const inputClass =
    "px-3 py-1.5 bg-white border border-slate-200/80 rounded-lg text-xs font-medium text-slate-700 outline-none hover:border-blue-300 hover:shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)]";

  return (
    <div className="flex flex-wrap items-center gap-2 relative z-10">
      <div className="relative">
        <select className={`${inputClass} appearance-none pr-8 cursor-pointer`} value={mode} onChange={handleModeChange}>
          <option value="default">Default</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="this_year">This year</option>
          <option value="last_year">Last year</option>
          <option value="custom">Custom...</option>
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      {mode === "custom" && (
        <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 duration-200">
          <div className="relative">
            <input
              type="date"
              className={`${inputClass} pl-8 min-w-[125px] cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer`}
              value={customFrom}
              max={customTo && customTo < isoDay(0) ? customTo : isoDay(0)}
              onChange={(e) => handleCustomChange(e.target.value, customTo)}
            />
            <CalendarDays className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">to</span>
          <div className="relative">
            <input
              type="date"
              className={`${inputClass} pl-8 min-w-[125px] cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer`}
              value={customTo}
              max={isoDay(0)}
              min={customFrom}
              onChange={(e) => handleCustomChange(customFrom, e.target.value)}
            />
            <CalendarDays className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      )}
    </div>
  );
}
