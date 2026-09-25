"use client";

import React, { useState } from "react";

interface StatusSlice {
  label: string;
  count: number;
  percentage: number;
  color: string;
  dotColor: string;
}

interface ComplaintsByStatusChartProps {
  stats?: {
    metrics: {
      total: number;
    };
    status_breakdown: {
      open: { count: number; percentage: number };
      in_progress: { count: number; percentage: number };
      resolved: { count: number; percentage: number };
    };
  } | null;
  isLoading?: boolean;
}

export function ComplaintsByStatusChart({ stats, isLoading = false }: ComplaintsByStatusChartProps) {
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  const total = stats?.metrics.total ?? 0;
  const breakdown = stats?.status_breakdown;

  const slices: StatusSlice[] = [
    {
      label: "Open",
      count: breakdown?.open.count ?? 0,
      percentage: breakdown?.open.percentage ?? 0,
      color: "#f87171", // Coral red
      dotColor: "bg-rose-400",
    },
    {
      label: "In Progress",
      count: breakdown?.in_progress.count ?? 0,
      percentage: breakdown?.in_progress.percentage ?? 0,
      color: "#a855f7", // Soft purple
      dotColor: "bg-purple-500",
    },
    {
      label: "Resolved",
      count: breakdown?.resolved.count ?? 0,
      percentage: breakdown?.resolved.percentage ?? 0,
      color: "#2dd4bf", // Vibrant teal / green
      dotColor: "bg-teal-400",
    },
  ];

  const radius = 68;
  const strokeWidth = 26;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div className="flex flex-col p-6 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] h-full">
      <h3 className="text-base font-bold text-slate-800 mb-4">Complaints by Status</h3>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1 py-10">
          <div className="w-40 h-40 rounded-full border-4 border-slate-100 border-t-blue-500 animate-spin"></div>
        </div>
      ) : (
        <div className="flex items-center justify-between flex-1 gap-4">
          {/* Donut Chart SVG */}
          <div className="relative w-44 h-44 flex items-center justify-center shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 180 180">
              {/* Background ring */}
              <circle
                cx="90"
                cy="90"
                r={radius}
                stroke="#f1f5f9"
                strokeWidth={strokeWidth}
                fill="transparent"
              />

              {total > 0 &&
                slices.map((slice) => {
                  const strokeDasharray = `${(slice.percentage / 100) * circumference} ${circumference}`;
                  const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
                  accumulatedPercent += slice.percentage;

                  const isHovered = hoveredSlice === slice.label;

                  return (
                    <circle
                      key={slice.label}
                      cx="90"
                      cy="90"
                      r={radius}
                      stroke={slice.color}
                      strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="butt"
                      fill="transparent"
                      className="transition-all duration-200 cursor-pointer"
                      onMouseEnter={() => setHoveredSlice(slice.label)}
                      onMouseLeave={() => setHoveredSlice(null)}
                    />
                  );
                })}
            </svg>

            {/* Centered Total Count */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
              <span className="text-2xl font-extrabold text-slate-800 leading-tight">
                {total.toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-slate-400">Total</span>
            </div>
          </div>

          {/* Legend on the right */}
          <div className="flex flex-col gap-3.5 pr-2">
            {slices.map((slice) => (
              <div
                key={slice.label}
                onMouseEnter={() => setHoveredSlice(slice.label)}
                onMouseLeave={() => setHoveredSlice(null)}
                className={`flex items-center gap-2.5 text-xs transition-opacity cursor-pointer ${
                  hoveredSlice && hoveredSlice !== slice.label ? "opacity-45" : "opacity-100"
                }`}
              >
                <span
                  className={`w-3 h-3 rounded-full shrink-0 ${slice.dotColor}`}
                  style={{ backgroundColor: slice.color }}
                ></span>
                <span className="font-semibold text-slate-700 min-w-[70px]">
                  {slice.label}
                </span>
                <span className="font-semibold text-slate-600">
                  {slice.count.toLocaleString()}{" "}
                  <span className="text-slate-400 font-normal">({slice.percentage}%)</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
