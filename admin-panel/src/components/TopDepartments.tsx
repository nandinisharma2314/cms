"use client";

import React from "react";
import { ChevronRight } from "lucide-react";

interface TopDepartmentsProps {
  departments?: { name: string; count: number }[];
  isLoading?: boolean;
}

const colorMap: Record<string, string> = {
  "Electricity": "bg-[#2563eb]",
  "Water": "bg-[#14b8a6]",
  "Sanitation": "bg-[#10b981]",
  "Roads": "bg-[#f97316]",
  "Healthcare": "bg-[#e11d48]",
  "Education": "bg-[#a855f7]",
  "Transport": "bg-[#eab308]",
  "General": "bg-[#64748b]",
};

export function TopDepartments({ departments = [], isLoading = false }: TopDepartmentsProps) {
  const maxTotal = departments.length > 0 ? Math.max(...departments.map((d) => d.count), 1) : 1;

  return (
    <div className="flex flex-col p-6 bg-white rounded-none border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-bold text-slate-800">Top Departments</h3>
        <button
          type="button"
          className="flex items-center text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
        >
          <span>View All</span>
          <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col justify-between flex-1 gap-4 py-4 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-24 h-3 bg-slate-200 rounded"></div>
              <div className="flex-1 h-3 bg-slate-100 rounded-full"></div>
              <div className="w-6 h-3 bg-slate-200 rounded"></div>
            </div>
          ))}
        </div>
      ) : departments.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-xs text-slate-400">
          No department data available.
        </div>
      ) : (
        /* Department Progress Rows */
        <div className="flex flex-col justify-between flex-1 gap-4">
          {departments.map((dept) => {
            const widthPercent = (dept.count / maxTotal) * 100;
            const barColor = colorMap[dept.name] || "bg-[#2563eb]";

            return (
              <div key={dept.name} className="flex items-center justify-between gap-3 text-xs">
                <span className="w-28 font-medium text-slate-700 truncate shrink-0">
                  {dept.name}
                </span>

                {/* Progress track */}
                <div className="flex-1 h-3 bg-slate-100/90 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor} transition-all duration-500`}
                    style={{ width: `${Math.max(widthPercent, 4)}%` }}
                  ></div>
                </div>

                <span className="w-8 font-semibold text-slate-700 text-right shrink-0">
                  {dept.count.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
