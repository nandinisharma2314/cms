"use client";

import React, { useEffect, useRef, useState } from "react";

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

interface Point {
  label: string;
  [key: string]: string | number;
}

// Categorical slots 1-3 of the reference palette, validated on the white card
// surface (aqua is under 3:1 there, so direct end labels + the table view carry it).
export const TREND_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];

const INK = { primary: "#0b0b0b", secondary: "#52514e", muted: "#898781" };
const GRID = "#e1e0d9";
const BASELINE = "#c3c2b7";
const SURFACE = "#ffffff";

const MARGIN = { top: 12, bottom: 26, left: 40 };
const RIGHT_WITH_LABELS = 112;
const RIGHT_PLAIN = 24;
const PLOT_HEIGHT = 220;

/** Top of the y-axis so that four equal steps are clean whole numbers (counts). */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value / 4));
  const multiplier = [1, 2, 5, 10].find((m) => m * magnitude * 4 >= value) ?? 10;
  return multiplier * magnitude * 4;
}

/**
 * Multi-series line chart with a snapping crosshair and one tooltip listing
 * every series. Same readout on keyboard focus (arrow keys) as on hover.
 */
export function TrendLineChart({
  points,
  series,
  ariaLabel,
}: {
  points: Point[];
  series: TrendSeries[];
  ariaLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setWidth(Math.max(320, entries[0].contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const max = niceMax(Math.max(1, ...points.flatMap((p) => series.map((s) => Number(p[s.key]) || 0))));
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  const y = (v: number) => MARGIN.top + PLOT_HEIGHT - (PLOT_HEIGHT * v) / max;
  const height = MARGIN.top + PLOT_HEIGHT + MARGIN.bottom;

  // Direct end labels only when they don't collide; otherwise legend + tooltip carry identity
  // (and the space reserved for them goes back to the plot).
  const last = points.length - 1;
  const endYs = series.map((s) => y(Number(points[last]?.[s.key]) || 0)).sort((a, b) => a - b);
  const endLabelsFit = last >= 0 && endYs.every((v, i) => i === 0 || v - endYs[i - 1] >= 14);
  const plotWidth = width - MARGIN.left - (endLabelsFit ? RIGHT_WITH_LABELS : RIGHT_PLAIN);
  const x = (i: number) => MARGIN.left + (points.length <= 1 ? plotWidth / 2 : (plotWidth * i) / (points.length - 1));
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotWidth / 70))));
  // the last date is always labelled, so skip a regular label that would crowd it
  const showTick = (i: number) => i === last || (i % labelEvery === 0 && last - i >= labelEvery / 2);

  const pick = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || points.length === 0) return;
    const relative = clientX - rect.left - MARGIN.left;
    const index = points.length <= 1 ? 0 : Math.round((relative / plotWidth) * (points.length - 1));
    setActive(Math.min(points.length - 1, Math.max(0, index)));
  };

  const tooltipLeft = active === null ? 0 : Math.min(x(active) + 12, width - 180);

  return (
    <div>
      {/* Legend: line keys, always present for 2+ series */}
      <div className="flex flex-wrap gap-4 mb-2">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs" style={{ color: INK.secondary }}>
            <span className="inline-block w-4 rounded-full" style={{ height: 2, background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div ref={wrapRef} className="relative" onPointerLeave={() => setActive(null)}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          className="block outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded"
          onPointerMove={(e) => pick(e.clientX)}
          onFocus={() => setActive(last)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? last) - 1));
            if (e.key === "ArrowRight") setActive((a) => Math.min(last, (a ?? last) + 1));
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={y(t)} y2={y(t)} stroke={t === 0 ? BASELINE : GRID} strokeWidth={1} />
              <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={INK.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                {Math.round(t).toLocaleString()}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            showTick(i) ? (
              <text key={p.label + i} x={x(i)} y={MARGIN.top + PLOT_HEIGHT + 18} textAnchor="middle" fontSize={11} fill={INK.muted}>
                {p.label}
              </text>
            ) : null,
          )}

          {series.map((s) => (
            <polyline
              key={s.key}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points.map((p, i) => `${x(i)},${y(Number(p[s.key]) || 0)}`).join(" ")}
            />
          ))}

          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={MARGIN.top + PLOT_HEIGHT} stroke={BASELINE} strokeWidth={1} />
          )}

          {/* end dots (or the hovered position's dots), each with a 2px surface ring */}
          {series.map((s) => {
            const i = active ?? last;
            if (i < 0) return null;
            return <circle key={s.key} cx={x(i)} cy={y(Number(points[i][s.key]) || 0)} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />;
          })}

          {endLabelsFit &&
            series.map((s) => (
              <text key={s.key} x={x(last) + 10} y={y(Number(points[last][s.key]) || 0)} dy="0.32em" fontSize={11} fill={INK.secondary}>
                {s.label} {Number(points[last][s.key]).toLocaleString()}
              </text>
            ))}
        </svg>

        {active !== null && points[active] && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg"
            style={{ left: tooltipLeft }}
            role="status"
          >
            <div className="text-[11px] mb-1" style={{ color: INK.muted }}>
              {points[active].label}
            </div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-xs">
                <span className="inline-block w-3 rounded-full" style={{ height: 2, background: s.color }} />
                <span className="font-semibold" style={{ color: INK.primary, fontVariantNumeric: "tabular-nums" }}>
                  {Number(points[active][s.key]).toLocaleString()}
                </span>
                <span style={{ color: INK.secondary }}>{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
