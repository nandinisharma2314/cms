"use client";

import React, { useState } from "react";

interface TrendPoint {
  date: string;
  received: number;
  resolved: number;
}

interface ComplaintsTrendChartProps {
  trend?: TrendPoint[];
  isLoading?: boolean;
}

export function ComplaintsTrendChart({ trend = [], isLoading = false }: ComplaintsTrendChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // SVG coordinate calculations
  const width = 460;
  const height = 210;
  const paddingLeft = 32;
  const paddingRight = 16;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Calculate dynamic maxY from live data
  const maxDataVal =
    trend.length > 0
      ? Math.max(...trend.map((d) => Math.max(d.received, d.resolved)))
      : 10;
  const maxY = Math.max(Math.ceil((maxDataVal * 1.2) / 5) * 5, 10);

  // Convert live data points to SVG coordinates
  const points = trend.map((d, index) => {
    const denom = trend.length > 1 ? trend.length - 1 : 1;
    const x = paddingLeft + (index / denom) * chartWidth;
    const yReceived = paddingTop + chartHeight - (d.received / maxY) * chartHeight;
    const yResolved = paddingTop + chartHeight - (d.resolved / maxY) * chartHeight;
    return { ...d, x, yReceived, yResolved };
  });

  // Generate smooth spline SVG path
  const createSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const current = pts[i];
      const next = pts[i + 1];
      const controlX1 = current.x + (next.x - current.x) * 0.45;
      const controlY1 = current.y;
      const controlX2 = current.x + (next.x - current.x) * 0.55;
      const controlY2 = next.y;
      path += ` C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${next.x} ${next.y}`;
    }
    return path;
  };

  const receivedPath = createSmoothPath(
    points.map((p) => ({ x: p.x, y: p.yReceived }))
  );
  const resolvedPath = createSmoothPath(
    points.map((p) => ({ x: p.x, y: p.yResolved }))
  );

  const receivedArea =
    points.length > 0
      ? `${receivedPath} L ${points[points.length - 1].x} ${
          paddingTop + chartHeight
        } L ${points[0].x} ${paddingTop + chartHeight} Z`
      : "";

  const yTicks = [
    maxY,
    Math.round(maxY * 0.75),
    Math.round(maxY * 0.5),
    Math.round(maxY * 0.25),
    0,
  ];

  return (
    <div className="flex flex-col p-6 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] h-full">
      {/* Header with Title and Legend */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-slate-800">Complaints Trend</h3>
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2563eb]"></span>
            <span>Received</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></span>
            <span>Resolved</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1 py-12">
          <div className="w-32 h-16 bg-slate-100 rounded-lg animate-pulse"></div>
        </div>
      ) : points.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-xs text-slate-400">
          No trend data available.
        </div>
      ) : (
        /* Interactive Chart Container */
        <div className="relative w-full flex-1 flex items-center justify-center">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-full overflow-visible"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines and Y labels */}
            {yTicks.map((tick) => {
              const y = paddingTop + chartHeight - (tick / maxY) * chartHeight;
              return (
                <g key={tick}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    stroke="#f1f5f9"
                    strokeWidth="1.2"
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize="11"
                    fontFamily="inherit"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* Area Fills */}
            {receivedArea && <path d={receivedArea} fill="url(#blueGradient)" />}

            {/* Line paths */}
            {receivedPath && (
              <path
                d={receivedPath}
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {resolvedPath && (
              <path
                d={resolvedPath}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Data point dots and interaction areas */}
            {points.map((p, i) => (
              <g key={i}>
                {/* Vertical guideline on hover */}
                {hoverIndex === i && (
                  <line
                    x1={p.x}
                    y1={paddingTop}
                    x2={p.x}
                    y2={paddingTop + chartHeight}
                    stroke="#cbd5e1"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                )}

                {/* Received Dot */}
                <circle
                  cx={p.x}
                  cy={p.yReceived}
                  r={hoverIndex === i ? 5.5 : 4}
                  fill="#2563eb"
                  stroke="#ffffff"
                  strokeWidth="2"
                  className="transition-all duration-150 cursor-pointer"
                />

                {/* Resolved Dot */}
                <circle
                  cx={p.x}
                  cy={p.yResolved}
                  r={hoverIndex === i ? 5.5 : 4}
                  fill="#10b981"
                  stroke="#ffffff"
                  strokeWidth="2"
                  className="transition-all duration-150 cursor-pointer"
                />

                {/* Invisible wider hit area for hover */}
                <rect
                  x={p.x - 20}
                  y={paddingTop}
                  width={40}
                  height={chartHeight}
                  fill="transparent"
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() => setHoverIndex(null)}
                  className="cursor-pointer"
                />

                {/* X Axis Date Labels */}
                <text
                  x={p.x}
                  y={paddingTop + chartHeight + 18}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="11"
                  fontFamily="inherit"
                >
                  {p.date}
                </text>
              </g>
            ))}
          </svg>

          {/* Hover Tooltip Overlay */}
          {hoverIndex !== null && points[hoverIndex] && (
            <div
              className="absolute -top-3 pointer-events-none transform -translate-x-1/2 bg-slate-900 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-lg z-20 flex flex-col gap-0.5"
              style={{
                left: `${(points[hoverIndex].x / width) * 100}%`,
              }}
            >
              <div className="font-semibold text-slate-300">{points[hoverIndex].date}</div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                <span>Received: {points[hoverIndex].received}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>Resolved: {points[hoverIndex].resolved}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
