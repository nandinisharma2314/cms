"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  UserCheck,
  AlertTriangle,
  Users2,
  KeyRound,
  X,
  CheckCircle2,
  Inbox,
  ArrowUpCircle,
  TimerOff,
  Ban,
} from "lucide-react";
import { api, PasswordResetTicket, DashboardStatsResponse } from "@/lib/api";
import { useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";

interface PendingActionsListProps {
  pendingSummary?: DashboardStatsResponse["pending_summary"];
  slaBreached?: number;
  isLoading?: boolean;
  onRefresh?: () => void;
}

function ActionRow({
  href,
  onClick,
  icon: Icon,
  iconClass,
  title,
  subtitle,
}: {
  href?: string;
  onClick?: () => void;
  icon: React.ElementType;
  iconClass: string;
  title: string;
  subtitle: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-3.5">
        <div className={`w-10 h-10 rounded-none flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${iconClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{title}</h4>
          <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all shrink-0" />
    </>
  );
  const className =
    "flex items-center justify-between p-3.5 rounded-none border border-slate-100 hover:border-slate-200 hover:bg-slate-50/60 transition-all text-left w-full group cursor-pointer";
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function PendingActionsList({
  pendingSummary,
  slaBreached = 0,
  isLoading = false,
  onRefresh,
}: PendingActionsListProps) {
  const { can } = useSession();
  const canApproveResets = can("user.reset_password");
  const [resetsOpen, setResetsOpen] = useState(false);
  const [approvedKey, setApprovedKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { data: resetTickets = [], reload: loadTickets } = useApiData<PasswordResetTicket[]>(
    () => (canApproveResets ? api.auth.resetQueries() : Promise.resolve([])),
    [canApproveResets, resetsOpen],
  );

  const handleApproveReset = async (ticketId: string) => {
    setIsProcessing(true);
    setActionError(null);
    try {
      const res = await api.auth.approveResetQuery(ticketId);
      setApprovedKey(res.temporary_key);
      loadTickets();
      if (onRefresh) onRefresh();
    } catch (err) {
      setActionError((err as Error).message);
    }
    setIsProcessing(false);
  };

  const pendingResetCount =
    resetTickets.filter((t) => t.status === "Pending Approval").length || (pendingSummary?.pending_resets ?? 0);
  const unassigned = pendingSummary?.pending_assignments ?? 0;
  const mine = pendingSummary?.assigned_to_me ?? 0;
  const urgent = pendingSummary?.escalations ?? 0;
  const escalatedToMe = pendingSummary?.escalated_to_me ?? 0;
  const rejectionRequests = pendingSummary?.rejection_requests ?? 0;
  const staffCount = pendingSummary?.total_users ?? null;

  return (
    <div className="flex flex-col p-6 bg-white rounded-none border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] h-[450px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-slate-800">Pending Actions</h3>
      </div>

      {isLoading ? (
        <div className="flex flex-col flex-1 gap-2.5 animate-pulse py-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-3.5 rounded-none border border-slate-100 bg-slate-50 flex items-center gap-3">
              <div className="w-10 h-10 rounded-none bg-slate-200" />
              <div className="flex-1 space-y-1.5">
                <div className="w-3/4 h-3 bg-slate-200 rounded" />
                <div className="w-1/2 h-2.5 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col flex-1 gap-2.5 overflow-y-auto pr-1">
          {canApproveResets && pendingResetCount > 0 && (
            <ActionRow
              onClick={() => setResetsOpen(true)}
              icon={KeyRound}
              iconClass="bg-blue-600 text-white"
              title={`${plural(pendingResetCount, "password reset query", "password reset queries")} pending`}
              subtitle="Awaiting your approval"
            />
          )}
          {rejectionRequests > 0 && (
            <ActionRow
              href="/rejection-requests"
              icon={Ban}
              iconClass="bg-fuchsia-600 text-white"
              title={`${plural(rejectionRequests, "rejection request", "rejection requests")} to decide`}
              subtitle="Agents are waiting for your approval or denial"
            />
          )}
          {escalatedToMe > 0 && (
            <ActionRow
              href="/complaints?escalated=me"
              icon={ArrowUpCircle}
              iconClass="bg-rose-600 text-white"
              title={`${plural(escalatedToMe, "complaint", "complaints")} escalated to you`}
              subtitle="An SLA was missed below you; you are now accountable"
            />
          )}
          {slaBreached > 0 && (
            <ActionRow
              href="/complaints?sla=breached"
              icon={TimerOff}
              iconClass="bg-rose-50 text-rose-600"
              title={`${plural(slaBreached, "complaint", "complaints")} past their SLA`}
              subtitle="Response or resolution target missed"
            />
          )}
          {(mine > 0 || can("complaint.receive")) && (
            <ActionRow
              href="/complaints?assigned=me"
              icon={Inbox}
              iconClass="bg-blue-50 text-blue-600"
              title={`${plural(mine, "complaint", "complaints")} assigned to you`}
              subtitle="Open and in progress"
            />
          )}
          {can("complaint.assign") && (
            <ActionRow
              href="/complaints?assigned=unassigned&group=open"
              icon={UserCheck}
              iconClass="bg-amber-50 text-amber-500"
              title={`${plural(unassigned, "complaint", "complaints")} waiting for assignment`}
              subtitle="No officer in scope was available"
            />
          )}
          <ActionRow
            href="/complaints?priority=High,Critical&group=open"
            icon={AlertTriangle}
            iconClass="bg-rose-50 text-rose-500"
            title={`${plural(urgent, "high priority complaint", "high priority complaints")} open`}
            subtitle="High or critical, not yet resolved"
          />
          {staffCount !== null && (
            <ActionRow
              href="/users"
              icon={Users2}
              iconClass="bg-blue-50 text-blue-500"
              title={`${plural(staffCount, "staff account", "staff accounts")} under you`}
              subtitle="Officers you can manage"
            />
          )}
        </div>
      )}

      {resetsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white rounded-none p-6 shadow-2xl border border-slate-100">
            <button
              onClick={() => {
                setResetsOpen(false);
                setApprovedKey(null);
                setActionError(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-none hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-none bg-blue-100 text-blue-600 flex items-center justify-center">
                <KeyRound className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Password Reset Queries</h3>
            </div>
            {actionError && (
              <div className="mb-3 p-2.5 rounded-none bg-rose-50 text-rose-700 text-xs border border-rose-200">{actionError}</div>
            )}
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {resetTickets.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No password reset tickets pending.</p>
              ) : (
                resetTickets.map((t) => (
                  <div key={t.ticket_id} className="p-3.5 rounded-none border border-slate-200 bg-slate-50 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-blue-600">#{t.ticket_id}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          t.status === "Approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                    <p className="text-slate-700">
                      Officer: <strong className="text-slate-900">{t.email_or_id}</strong> (Dept: {t.department})
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {t.matched_user
                        ? `Matches ${t.matched_user.name} (${t.matched_user.role})`
                        : "No staff account matches this email/mobile"}
                    </p>
                    <p className="text-slate-500 italic">&ldquo;{t.reason}&rdquo;</p>
                    {t.status === "Pending Approval" && t.matched_user && (
                      <div className="pt-1 flex items-center justify-end">
                        <button
                          disabled={isProcessing}
                          onClick={() => handleApproveReset(t.ticket_id)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-none text-xs font-semibold cursor-pointer"
                        >
                          {isProcessing ? "Processing..." : "Approve & Issue Temporary Password"}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            {approvedKey && (
              <div className="mt-4 p-3 rounded-none bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>
                  Temporary password: <strong className="font-mono">{approvedKey}</strong>. Share it with the officer
                  securely; it is shown only once.
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
