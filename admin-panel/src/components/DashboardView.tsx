"use client";

import React from "react";
import { MetricCards, MetricCardData } from "./MetricCards";
import { ComplaintsTrendChart } from "./ComplaintsTrendChart";
import { ComplaintsByStatusChart } from "./ComplaintsByStatusChart";
import { TopDepartments } from "./TopDepartments";
import { RecentComplaintsTable } from "./RecentComplaintsTable";
import { PendingActionsList } from "./PendingActionsList";
import { QuickActionsBar } from "./QuickActionsBar";
import { FileText, Clock, CheckCircle2, Hourglass } from "lucide-react";
import { api } from "@/lib/api";
import { useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { scopeLabel } from "./ScopeEditor";
import { ErrorBanner } from "./ui";

const ROLE_TAGLINES: Record<string, string> = {
  super_admin: "Together for a cleaner, safer and better community.",
  admin: "Municipal Grievance Redressal & Operations Management.",
  manager: "Department Performance, SLA Tracking & Allocation.",
  supervisor: "Zonal Inspection, Verification & Squad Dispatch.",
  agent: "On-ground Task Execution & Work Order Completion.",
};

export function DashboardView() {
  const { me, can, canAny } = useSession();
  const canViewComplaints = can("complaint.view");

  // Every number below is already filtered to the user's department/location scope by the API.
  const { data, error, loading: isLoadingData, reload: loadBackendData } = useApiData(async () => {
    if (!canViewComplaints) return { stats: null, complaints: [] };
    const [stats, complaints] = await Promise.all([api.complaints.stats(), api.complaints.list()]);
    return { stats, complaints };
  }, [canViewComplaints]);
  const backendStats = data?.stats ?? null;
  const complaints = data?.complaints ?? [];

  const m = backendStats?.metrics;
  const metrics: MetricCardData[] = [
    {
      id: "total",
      title: "Total Complaints",
      value: (m?.total ?? 0).toLocaleString(),
      trend: m?.total_trend ?? null,
      trendType: m?.total_trend_type ?? "positive",
      icon: FileText,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      id: "open",
      title: "Open",
      value: (m?.open ?? 0).toLocaleString(),
      trend: m?.open_trend ?? null,
      trendType: m?.open_trend_type ?? "negative",
      icon: Clock,
      iconBg: "bg-rose-50",
      iconColor: "text-rose-500",
    },
    {
      id: "resolved",
      title: "Resolved",
      value: (m?.resolved ?? 0).toLocaleString(),
      trend: m?.resolved_trend ?? null,
      trendType: m?.resolved_trend_type ?? "positive",
      icon: CheckCircle2,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
    {
      id: "in-progress",
      title: "In Progress",
      value: (m?.in_progress ?? 0).toLocaleString(),
      trend: m?.in_progress_trend ?? null,
      trendType: m?.in_progress_trend_type ?? "negative",
      icon: Hourglass,
      iconBg: "bg-purple-50",
      iconColor: "text-purple-600",
    },
  ];

  const showPendingActions = canAny("user.reset_password", "complaint.respond", "complaint.assign");
  const scopeText = me.is_super_admin
    ? "Entire system"
    : me.scopes.map(scopeLabel).join("; ") || "No scope assigned";

  return (
    <>
      {/* Welcome Greeting Section */}
      <div className="flex flex-col">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          Welcome, {me.name}
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-1">
          <span className="font-semibold text-slate-700">{me.role.name}</span>
          {" • "}
          {ROLE_TAGLINES[me.role.key] ?? ROLE_TAGLINES.super_admin}
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5">Showing: {scopeText}</p>
      </div>

      <ErrorBanner message={error} />

      {canViewComplaints && (
        <>
          {/* Row 1: KPI Metric Cards */}
          <MetricCards metrics={metrics} isLoading={isLoadingData} />

          {/* Row 2: Trend, Status Donut, Top Departments */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div className="lg:col-span-5 min-h-[300px]">
              <ComplaintsTrendChart trend={backendStats?.trend} isLoading={isLoadingData} />
            </div>
            <div className="lg:col-span-4 min-h-[300px]">
              <ComplaintsByStatusChart stats={backendStats} isLoading={isLoadingData} />
            </div>
            <div className="lg:col-span-3 min-h-[300px]">
              <TopDepartments departments={backendStats?.departments} isLoading={isLoadingData} />
            </div>
          </div>

          {/* Row 3: Recent Complaints Table + Pending Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div className={showPendingActions ? "lg:col-span-8" : "lg:col-span-12"}>
              <RecentComplaintsTable complaints={complaints} isLoading={isLoadingData} />
            </div>
            {showPendingActions && (
              <div className="lg:col-span-4">
                <PendingActionsList
                  pendingSummary={backendStats?.pending_summary}
                  slaBreached={backendStats?.metrics.sla_breached}
                  isLoading={isLoadingData}
                  onRefresh={loadBackendData}
                />
              </div>
            )}
          </div>
        </>
      )}

    </>
  );
}
