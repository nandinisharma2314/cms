"use client";

import React, { useState } from "react";
import Link from "next/link";
import { api, RejectionRequestItem } from "@/lib/api";
import { useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { PRIORITY_BADGE } from "@/lib/status";
import { RequirePermission } from "@/components/RequirePermission";
import { RejectionDecision } from "@/components/RejectionPanel";
import { Card, ErrorBanner, formatDateTime, PageHeader } from "@/components/ui";

type View = "to_decide" | "mine" | "all";

const STATUS_STYLE: Record<RejectionRequestItem["status"], string> = {
  PENDING: "bg-fuchsia-50 text-fuchsia-700",
  APPROVED: "bg-slate-800 text-white",
  DENIED: "bg-emerald-50 text-emerald-700",
  WITHDRAWN: "bg-slate-100 text-slate-500",
};

function RequestCard({ request, onChanged }: { request: RejectionRequestItem; onChanged: () => void }) {
  return (
    <Card className="p-5 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Link href={`/complaints/${request.complaint.id}`} className="font-mono font-bold text-blue-600 hover:underline">
          {request.complaint.id}
        </Link>
        <span className="font-semibold text-slate-800">{request.complaint.title}</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${PRIORITY_BADGE[request.complaint.priority] ?? ""}`}>
          {request.complaint.priority}
        </span>
        <span className="text-slate-400">
          {request.complaint.department} · {request.complaint.location}
        </span>
        <span className={`ml-auto px-2 py-0.5 rounded-md text-[10px] font-semibold ${STATUS_STYLE[request.status]}`}>
          {request.direct ? "REJECTED DIRECTLY" : request.status}
        </span>
      </div>
      <div className="text-xs text-slate-700">
        <span className="font-semibold">{request.requested_by.name}</span> ({request.requested_by.role}) ·{" "}
        {formatDateTime(request.created_at)}
        <div className="mt-1">
          <span className="font-semibold">{request.category}.</span> {request.reason}
        </div>
      </div>
      {request.decided_by && (
        <div className="text-[11px] text-slate-500">
          Decided by {request.decided_by} · {formatDateTime(request.decided_at)}
          {request.decision_note && <> · &ldquo;{request.decision_note}&rdquo;</>}
        </div>
      )}
      {request.can_decide && <RejectionDecision request={request} onDecided={onChanged} />}
    </Card>
  );
}

function RejectionRequests() {
  const { can } = useSession();
  const canApprove = can("complaint.reject.approve");
  const tabs: { value: View; label: string }[] = [
    ...(canApprove ? [{ value: "to_decide" as View, label: "Awaiting my decision" }] : []),
    ...(can("complaint.reject.request") ? [{ value: "mine" as View, label: "My requests" }] : []),
    ...(canApprove ? [{ value: "all" as View, label: "All in my scope" }] : []),
  ];
  const [view, setView] = useState<View>(tabs[0]?.value ?? "mine");
  const { data: requests = [], error, loading, reload } = useApiData(() => api.rejections.list(view), [view]);

  return (
    <>
      <PageHeader
        title="Rejection Requests"
        description="Agents cannot reject complaints on their own; someone above them approves or denies each request."
      />
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setView(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
              view === tab.value ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <ErrorBanner message={error} />
      {!loading && requests.length === 0 && (
        <p className="text-xs text-slate-400">{view === "to_decide" ? "Nothing is waiting for your decision." : "No requests."}</p>
      )}
      <div className="space-y-3">
        {requests.map((r) => (
          <RequestCard key={r.id} request={r} onChanged={reload} />
        ))}
      </div>
    </>
  );
}

export default function RejectionRequestsPage() {
  return (
    <RequirePermission anyOf={["complaint.reject.approve", "complaint.reject.request"]}>
      <RejectionRequests />
    </RequirePermission>
  );
}
