"use client";

import React, { useState } from "react";
import Link from "next/link";
import { api, RejectionRequestItem } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { RejectionDecision } from "@/components/RejectionPanel";
import { RequirePermission } from "@/components/RequirePermission";
import { Card, ErrorBanner, PageHeader, Pagination, PriorityBadge, Spinner, tabClass } from "@/components/ui";

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
        <Link
          href={`/complaints/${encodeURIComponent(request.complaint.id)}`}
          className="font-mono font-bold text-blue-600 hover:underline"
        >
          {request.complaint.id}
        </Link>
        <span className="font-semibold text-slate-800">{request.complaint.title}</span>
        <PriorityBadge priority={request.complaint.priority} />
        <span className="text-slate-400">
          {request.complaint.department} · {request.complaint.location}
        </span>
        <span className={`sm:ml-auto px-2 py-0.5 rounded-md text-[10px] font-semibold ${STATUS_STYLE[request.status]}`}>
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
  useDocumentTitle("Rejection requests");
  const { can } = useSession();
  const { ui } = useConfig();
  const canApprove = can("complaint.reject.approve");
  const tabs: { value: View; label: string }[] = [
    ...(canApprove ? [{ value: "to_decide" as View, label: "Waiting for my decision" }] : []),
    ...(can("complaint.reject.request") ? [{ value: "mine" as View, label: "My requests" }] : []),
    ...(canApprove ? [{ value: "all" as View, label: "All in my scope" }] : []),
  ];
  const [view, setView] = useState<View>(tabs[0].value);
  const [page, setPage] = useState(1);
  const { data, error, reload } = useApiData(
    () => api.rejections.list({ view, page, page_size: ui.default_page_size }),
    [view, page, ui.default_page_size],
  );

  return (
    <>
      <PageHeader
        title="Rejection requests"
        description="Agents can't reject complaints themselves; someone above them approves or denies each request."
      />
      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={view === tab.value}
            onClick={() => {
              setView(tab.value);
              setPage(1);
            }}
            className={tabClass(view === tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <ErrorBanner message={error} />
      {!data ? (
        !error && <Spinner />
      ) : data.items.length === 0 ? (
        <p className="text-xs text-slate-400">
          {view === "to_decide" ? "Nothing is waiting for your decision." : "No requests."}
        </p>
      ) : (
        <div className="space-y-3">
          {data.items.map((r) => (
            <RequestCard key={r.id} request={r} onChanged={reload} />
          ))}
        </div>
      )}
      {data && <Pagination page={page} pageSize={data.page_size} total={data.total} noun="requests" onPage={setPage} />}
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
