"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowUpCircle, Ban, ChevronRight, Clock, Inbox, KeyRound, TimerOff, UserCheck, Users2 } from "lucide-react";
import { DashboardStats } from "@/lib/api";
import { plural } from "@/lib/format";
import { useSession } from "@/lib/session";
import { ResetTicketsDialog } from "./ResetTicketsDialog";

function ActionRow({
  href,
  onClick,
  icon: Icon,
  tint,
  title,
  subtitle,
}: {
  href?: string;
  onClick?: () => void;
  icon: React.ElementType;
  tint: string;
  title: string;
  subtitle: string;
}) {
  const body = (
    <>
      <span className="flex items-center gap-3.5 min-w-0">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>
          <Icon className="w-5 h-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-bold text-slate-800 group-hover:text-blue-600">{title}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">{subtitle}</span>
        </span>
      </span>
      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 shrink-0" aria-hidden="true" />
    </>
  );
  const className =
    "flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/60 text-left w-full group cursor-pointer";
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <button onClick={onClick} className={className}>
      {body}
    </button>
  );
}

/** Links to the work waiting for this user; rows only appear when they can act on them. */
export function PendingActionsList({
  stats,
  loading,
  onRefresh,
}: {
  stats: DashboardStats | undefined;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { can } = useSession();
  const [resetsOpen, setResetsOpen] = useState(false);
  const summary = stats?.pending_summary;
  const metrics = stats?.metrics;

  return (
    <div className="flex flex-col p-5 sm:p-6 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] h-full">
      <h2 className="text-base font-bold text-slate-800 mb-4">Waiting for you</h2>
      {loading || !summary || !metrics ? (
        <div className="flex flex-col gap-2.5 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-xl border border-slate-100 bg-slate-50" />
          ))}
        </div>
      ) : (
        (() => {
          const rows = [
            summary.pending_resets !== null && summary.pending_resets > 0 && (
              <ActionRow
                key="resets"
                onClick={() => setResetsOpen(true)}
                icon={KeyRound}
                tint="bg-blue-600 text-white"
                title={plural(summary.pending_resets, "password reset request", "password reset requests")}
                subtitle="Waiting for your approval"
              />
            ),
            summary.rejection_requests > 0 && (
              <ActionRow
                key="rejections"
                href="/rejection-requests"
                icon={Ban}
                tint="bg-fuchsia-600 text-white"
                title={`${plural(summary.rejection_requests, "rejection request", "rejection requests")} to decide`}
                subtitle="Approve or deny them"
              />
            ),
            summary.escalated_to_me > 0 && (
              <ActionRow
                key="escalated"
                href="/complaints?escalated=me"
                icon={ArrowUpCircle}
                tint="bg-rose-600 text-white"
                title={`${plural(summary.escalated_to_me, "complaint", "complaints")} escalated to you`}
                subtitle="A target was missed below you; you are now accountable"
              />
            ),
            metrics.sla_breached > 0 && (
              <ActionRow
                key="breached"
                href="/complaints?sla=breached"
                icon={TimerOff}
                tint="bg-rose-50 text-rose-600"
                title={`${plural(metrics.sla_breached, "complaint", "complaints")} past a target`}
                subtitle="Response or resolution time missed"
              />
            ),
            metrics.sla_at_risk > 0 && (
              <ActionRow
                key="at-risk"
                href="/complaints?sla=at_risk"
                icon={Clock}
                tint="bg-amber-50 text-amber-600"
                title={`${plural(metrics.sla_at_risk, "complaint", "complaints")} due soon`}
                subtitle="Inside the warning window of a target"
              />
            ),
            (summary.assigned_to_me > 0 || can("complaint.receive")) && (
              <ActionRow
                key="mine"
                href="/complaints?assigned=me"
                icon={Inbox}
                tint="bg-blue-50 text-blue-600"
                title={`${plural(summary.assigned_to_me, "open complaint", "open complaints")} assigned to you`}
                subtitle="Waiting for action or in progress"
              />
            ),
            can("complaint.assign") && summary.unassigned > 0 && (
              <ActionRow
                key="unassigned"
                href="/complaints?assigned=unassigned"
                icon={UserCheck}
                tint="bg-amber-50 text-amber-600"
                title={`${plural(summary.unassigned, "complaint", "complaints")} waiting for someone`}
                subtitle="Nobody in scope was available to take them"
              />
            ),
            summary.total_users !== null && (
              <ActionRow
                key="users"
                href="/users"
                icon={Users2}
                tint="bg-slate-100 text-slate-600"
                title={`${plural(summary.total_users, "staff account", "staff accounts")} under you`}
                subtitle="People you can manage"
              />
            ),
          ].filter(Boolean);
          return rows.length ? (
            <div className="flex flex-col gap-2.5 overflow-y-auto">{rows}</div>
          ) : (
            <p className="flex flex-1 items-center justify-center text-xs text-slate-400">Nothing is waiting for you.</p>
          );
        })()
      )}
      {resetsOpen && <ResetTicketsDialog onClose={() => setResetsOpen(false)} onChanged={onRefresh} />}
    </div>
  );
}
