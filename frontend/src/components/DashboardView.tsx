"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, FileText, Hourglass } from "lucide-react";
import { api, ConfigurationProblem } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { ComplaintTable } from "./ComplaintTable";
import { ComplaintsByStatusChart } from "./ComplaintsByStatusChart";
import { DashboardTrend } from "./DashboardTrend";
import { MetricCards, MetricCardData } from "./MetricCards";
import { PendingActionsList } from "./PendingActionsList";
import { scopeLabel } from "./ScopeEditor";
import { TopDepartments } from "./TopDepartments";
import { Card, ErrorBanner } from "./ui";
import { useI18n } from "@/lib/i18n";

const AREA_LINKS: Record<ConfigurationProblem["area"], string> = {
  settings: "/settings",
  locations: "/locations",
  priorities: "/sla",
  sla: "/sla",
};

/** What the Super Admin still has to set up; hidden once everything is configured. */
function SetupChecklist() {
  const { data } = useApiData(() => api.settings.status(), []);
  const { t } = useI18n();
  if (!data || data.problems.length === 0) return null;
  return (
    <Card className="p-5 border-amber-200 bg-amber-50/60">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-amber-900">{t("Finish setting up")}</h2>
          <p className="text-xs text-amber-800">{t("Parts of the system don't work until these are configured:")}</p>
          <ul className="text-xs text-amber-900 space-y-1">
            {data.problems.map((p) => (
              <li key={p.field}>
                <Link href={AREA_LINKS[p.area]} className="underline underline-offset-2 hover:text-amber-700">
                  {p.message}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

export function DashboardView() {
  const { t } = useI18n();
  useDocumentTitle(t("Dashboard"));
  const { me, can } = useSession();
  const { ui } = useConfig();
  const canViewComplaints = can("complaint.view");
  const canCreate = !me.is_super_admin && can("complaint.create");
  const [complaintTab, setComplaintTab] = React.useState<"scope" | "mine">("scope");

  // Every number below is already limited to the user's department/location scope by the API.
  const stats = useApiData(() => (canViewComplaints ? api.complaints.stats() : Promise.resolve(undefined)), [canViewComplaints]);
  const recent = useApiData(
    () => (canViewComplaints ? api.complaints.list({ page_size: ui.dashboard_recent_items }) : Promise.resolve(undefined)),
    [canViewComplaints, ui.dashboard_recent_items],
  );
  const myRaised = useApiData(
    () => (canCreate ? api.complaints.list({ created_by: "me", page_size: ui.dashboard_recent_items }) : Promise.resolve(undefined)),
    [canCreate, ui.dashboard_recent_items],
  );
  const m = stats.data?.metrics;
  const metrics: MetricCardData[] = m
    ? [
        {
          id: "total",
          title: t("Total complaints"),
          value: m.total,
          change: m.total_change,
          icon: FileText,
          tint: "bg-blue-50 text-blue-600",
          href: "/complaints",
        },
        {
          id: "open",
          title: t("Awaiting action"),
          value: m.open,
          change: m.open_change,
          icon: Clock,
          tint: "bg-rose-50 text-rose-500",
          href: "/complaints?group=open",
        },
        {
          id: "in_progress",
          title: t("In progress"),
          value: m.in_progress,
          change: m.in_progress_change,
          icon: Hourglass,
          tint: "bg-violet-50 text-violet-600",
          href: "/complaints?group=in_progress",
        },
        {
          id: "resolved",
          title: t("Resolved"),
          value: m.resolved,
          change: m.resolved_change,
          icon: CheckCircle2,
          tint: "bg-emerald-50 text-emerald-600",
          href: "/complaints?group=resolved",
        },
      ]
    : [];
  const scopeText = me.is_super_admin ? t("Entire system") : me.scopes.map((s) => scopeLabel(s, t)).join("; ") || t("No scope assigned");

  return (
    <>
      <div className="-mt-5 sm:-mt-2">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">{t("Welcome, {name}", { name: me.name })}</h1>
        <p className="text-xs text-slate-500 font-medium mt-1">
          <span className="font-semibold text-slate-700">{t(me.role.name)}</span> · {scopeText}
        </p>
      </div>

      {can("settings.manage") && <SetupChecklist />}
      <ErrorBanner message={stats.error ?? recent.error} />

      {canViewComplaints ? (
        <>
          {/* Shown while loading or with data; a failed load is reported by the banner above, not as zeros. */}
          {(stats.loading || stats.data) && (
            <>
              <MetricCards metrics={metrics} loading={stats.loading} days={ui.dashboard_comparison_days} />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                <div className="lg:col-span-5 min-h-75">
                  <DashboardTrend trend={stats.data?.trend} loading={stats.loading} />
                </div>
                <div className="lg:col-span-4 min-h-75">
                  <ComplaintsByStatusChart stats={stats.data} loading={stats.loading} />
                </div>
                <div className="lg:col-span-3 min-h-75">
                  <TopDepartments departments={stats.data?.departments ?? []} loading={stats.loading} />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
            {(recent.loading || recent.data || myRaised.loading || myRaised.data) && (
              <Card className="xl:col-span-8 overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <div className="flex items-center gap-3">
                    {canCreate ? (
                      <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setComplaintTab("scope")}
                          className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                            complaintTab === "scope"
                              ? "bg-white text-slate-800 shadow-xs"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {t("Latest in scope")}
                          {recent.data && (
                            <span className="ml-1.5 text-[11px] text-slate-400 font-semibold">
                              ({recent.data.total})
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setComplaintTab("mine")}
                          className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                            complaintTab === "mine"
                              ? "bg-white text-blue-600 shadow-xs"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {t("Raised by you")}
                          {myRaised.data && (
                            <span className="ml-1.5 text-[11px] font-semibold text-blue-500">
                              ({myRaised.data.total})
                            </span>
                          )}
                        </button>
                      </div>
                    ) : (
                      <h2 className="text-base font-bold text-slate-800">
                        {t("Latest complaints")}
                        {recent.data && (
                          <span className="ml-2 text-xs text-slate-400 font-medium">
                            ({recent.data.total.toLocaleString()} {t("in your scope")})
                          </span>
                        )}
                      </h2>
                    )}
                  </div>
                  <Link
                    href={complaintTab === "mine" ? "/complaints?created_by=me" : "/complaints"}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    {t("View all")}
                  </Link>
                </div>
                <ComplaintTable
                  compact
                  complaints={(complaintTab === "mine" ? myRaised.data?.items : recent.data?.items) ?? []}
                  loading={complaintTab === "mine" ? myRaised.loading : recent.loading}
                  emptyText={complaintTab === "mine" ? t("You haven't raised any complaints yet.") : t("No complaints in your scope yet.")}
                />
              </Card>
            )}
            {(stats.loading || stats.data) && (
              <div className="xl:col-span-4">
                <PendingActionsList stats={stats.data} loading={stats.loading} onRefresh={stats.reload} />
              </div>
            )}
          </div>
        </>
      ) : (
        <Card className="p-8 text-center text-xs text-slate-500">
          {t("Your role doesn't include complaints. Use the menu for the areas you manage.")}
        </Card>
      )}
    </>
  );
}
