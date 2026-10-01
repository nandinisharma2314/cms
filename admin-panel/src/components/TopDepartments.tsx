import React from "react";
import { CHART_PALETTE } from "@/lib/status";

/** Complaint counts per department in the user's scope (largest first, as the API sends them). */
export function TopDepartments({ departments, loading }: { departments: { name: string; count: number }[]; loading: boolean }) {
  const max = Math.max(1, ...departments.map((d) => d.count));
  return (
    <div className="flex flex-col p-5 sm:p-6 bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] h-full">
      <h2 className="text-base font-bold text-slate-800 mb-5">Complaints by department</h2>
      {loading ? (
        <div className="flex flex-col flex-1 gap-4 py-2 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-24 h-3 bg-slate-200 rounded" />
              <div className="flex-1 h-3 bg-slate-100 rounded-full" />
            </div>
          ))}
        </div>
      ) : departments.length === 0 ? (
        <p className="flex items-center justify-center flex-1 text-xs text-slate-400">No complaints yet.</p>
      ) : (
        <ul className="flex flex-col flex-1 gap-4 overflow-y-auto">
          {departments.map((dept, i) => (
            <li key={dept.name} className="flex items-center gap-3 text-xs">
              <span className="w-28 font-medium text-slate-700 truncate shrink-0" title={dept.name}>
                {dept.name}
              </span>
              <span className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden" aria-hidden="true">
                <span
                  className="block h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max((dept.count / max) * 100, 4)}%`,
                    backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length],
                  }}
                />
              </span>
              <span className="w-10 font-semibold text-slate-700 text-right shrink-0">{dept.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
