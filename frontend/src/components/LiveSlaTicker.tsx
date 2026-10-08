"use client";

import React, { useEffect, useState } from "react";
import { ArrowUpCircle, Clock } from "lucide-react";
import { ComplaintData } from "@/lib/api";
import { currentSla, SLA_BADGE } from "@/lib/status";

function formatDuration(ms: number): string {
  const absMs = Math.abs(ms);
  const totalMinutes = Math.floor(absMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function LiveSlaTicker({
  complaint,
  showEscalation = true,
}: {
  complaint: ComplaintData;
  showEscalation?: boolean;
}) {
  const [, setTick] = useState(0);

  // Ticking timer: re-render every 30 seconds to update live countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const isResolvedOrClosed = complaint.status === "RESOLVED" || complaint.status === "CLOSED";

  // If already resolved or closed, show final status
  if (isResolvedOrClosed) {
    const resSla = complaint.sla.resolution;
    if (resSla === "met") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span>✓</span> SLA Met
        </span>
      );
    }
    if (resSla === "met_late") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <span>⚠️</span> Met Late
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
        Closed
      </span>
    );
  }

  // If paused
  if (complaint.sla_paused) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
        <span>⏸</span> Paused
      </span>
    );
  }

  // Active target date: resolution_due_at or response_due_at
  const targetDateStr =
    complaint.acknowledged_at || complaint.status !== "SUBMITTED"
      ? complaint.resolution_due_at
      : complaint.response_due_at || complaint.resolution_due_at;

  if (!targetDateStr) {
    const fallbackState = currentSla(complaint.sla);
    const badge = fallbackState ? SLA_BADGE[fallbackState] : null;
    return badge ? (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.className}`}>
        {badge.label}
      </span>
    ) : null;
  }

  const now = Date.now();
  const dueTime = new Date(targetDateStr).getTime();
  const diffMs = dueTime - now;

  // Breached state
  if (diffMs < 0) {
    const overStr = formatDuration(diffMs);
    return (
      <div className="flex flex-wrap items-center gap-1">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-300 ring-2 ring-rose-400/20 shadow-2xs"
          title={`Target was ${targetDateStr}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping shrink-0" />
          <span>Breached {overStr} ago</span>
        </span>
        {showEscalation && complaint.escalation && (
          <span
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800"
            title={`Escalated to ${complaint.escalation.to.name}`}
          >
            <ArrowUpCircle className="w-3 h-3" /> L{complaint.escalation.level}
          </span>
        )}
      </div>
    );
  }

  // At risk state (< 4 hours)
  const fourHoursMs = 4 * 60 * 60 * 1000;
  if (diffMs < fourHoursMs) {
    const remStr = formatDuration(diffMs);
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 ring-2 ring-amber-400/20 shadow-2xs"
        title={`Due at ${targetDateStr}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />
        <span>⏱️ {remStr} left</span>
      </span>
    );
  }

  // Normal on-track state
  const remStr = formatDuration(diffMs);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200"
      title={`Due at ${targetDateStr}`}
    >
      <Clock className="w-3 h-3 text-slate-400" />
      <span>{remStr} left</span>
    </span>
  );
}
