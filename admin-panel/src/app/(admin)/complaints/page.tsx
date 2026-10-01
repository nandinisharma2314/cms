"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { api, StatusGroup } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { useApiData, useDebounced } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { GROUP_LABELS } from "@/lib/status";
import { ComplaintTable } from "@/components/ComplaintTable";
import { RequirePermission } from "@/components/RequirePermission";
import { Card, ErrorBanner, inputClass, PageHeader, Pagination, tabClass } from "@/components/ui";

interface Filters {
  search: string;
  group: StatusGroup | "";
  assigned: "me" | "unassigned" | "";
  priority_id: string;
  department_id: string;
  sla: "breached" | "at_risk" | "";
  escalated: "me" | "any" | "";
}

const GROUP_TABS: { value: StatusGroup | ""; label: string }[] = [
  { value: "", label: "All" },
  ...(Object.entries(GROUP_LABELS) as [StatusGroup, string][]).map(([value, label]) => ({ value, label })),
];

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | "" {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

function ComplaintsList({ initial }: { initial: Filters }) {
  const { me, can } = useSession();
  const { ui } = useConfig();
  const [filters, setFilters] = useState<Filters>(initial);
  useDocumentTitle(filters.escalated === "me" ? "Escalated to me" : filters.escalated === "any" ? "Escalated complaints" : "Complaints");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(initial.assigned || initial.priority_id || initial.department_id || initial.sla || initial.escalated),
  );
  const search = useDebounced(filters.search.trim());
  const set = (patch: Partial<Filters>) => {
    setFilters({ ...filters, ...patch });
    setPage(1);
  };

  const { data: facets } = useApiData(() => api.complaints.facets(), []);
  const { data, error, loading, refreshing } = useApiData(
    () =>
      api.complaints.list({
        search: search || undefined,
        group: filters.group,
        assigned: filters.assigned,
        priority_ids: filters.priority_id || undefined,
        department_id: filters.department_id ? Number(filters.department_id) : undefined,
        sla: filters.sla,
        escalated: filters.escalated,
        page,
        page_size: ui.default_page_size,
      }),
    [
      search,
      filters.group,
      filters.assigned,
      filters.priority_id,
      filters.department_id,
      filters.sla,
      filters.escalated,
      page,
      ui.default_page_size,
    ],
  );

  const activeFilters = [filters.assigned, filters.priority_id, filters.department_id, filters.sla, filters.escalated].filter(
    Boolean,
  ).length;

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] -mt-5 sm:-mt-2">
      <div className="shrink-0">
        <PageHeader
          title={
            filters.escalated === "me"
              ? "Complaints (Escalated to me)"
              : filters.escalated === "any"
              ? "Escalated complaints"
              : "Complaints"
          }
          description={
            filters.escalated === "me"
              ? "Complaints where an SLA target was missed and escalated to you for supervision."
              : filters.escalated === "any"
              ? "Complaints across the system currently in an escalated state."
              : me.is_super_admin
              ? "All complaints in the system."
              : "Complaints inside your department and location scope."
          }
        />
      </div>

      <div className="flex flex-col gap-3 shrink-0 mt-2 sm:mt-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-72">
              <Search className="absolute left-2.5 sm:left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
              type="search"
              className="w-full h-10 pl-8 sm:pl-10 pr-2 sm:pr-4 text-xs font-medium bg-white border border-slate-200 text-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400"
              placeholder="Search by ID, title or area"
              aria-label="Search complaints"
              value={filters.search}
              onChange={(e) => set({ search: e.target.value })}
            />
          </div>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            aria-expanded={filtersOpen}
            className={`shrink-0 flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 h-10 font-semibold text-xs rounded-xl border cursor-pointer ${
              filtersOpen || activeFilters
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters{activeFilters ? ` (${activeFilters})` : ""}
          </button>
          <div className="block lg:hidden shrink-0 w-24 sm:w-32">
            <select
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-1.5 sm:px-3 text-[10px] sm:text-sm font-semibold text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={filters.group}
              onChange={(e) => set({ group: e.target.value as Filters["group"] })}
              aria-label="Status"
            >
              {GROUP_TABS.map((tab) => (
                <option key={tab.value || "all"} value={tab.value}>
                  {tab.label}
                </option>
              ))}
            </select>
          </div>
          </div>
          <div className="hidden lg:flex flex-row gap-2 lg:ml-auto" role="tablist" aria-label="Status">
            {GROUP_TABS.map((tab) => (
              <button
                key={tab.value || "all"}
                role="tab"
                aria-selected={filters.group === tab.value}
                onClick={() => set({ group: tab.value })}
                className={tabClass(filters.group === tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filtersOpen && (
          <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2.5 items-center">
            <select
              className={inputClass}
              aria-label="Assignment"
              value={filters.assigned}
              onChange={(e) => set({ assigned: e.target.value as Filters["assigned"] })}
            >
              <option value="">Anyone</option>
              <option value="me">Assigned to me</option>
              {can("complaint.assign") && <option value="unassigned">Unassigned</option>}
            </select>
            <select
              className={inputClass}
              aria-label="Priority"
              value={filters.priority_id}
              onChange={(e) => set({ priority_id: e.target.value })}
            >
              <option value="">All priorities</option>
              {facets?.priorities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.is_active ? "" : " (retired)"}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              aria-label="Department"
              value={filters.department_id}
              onChange={(e) => set({ department_id: e.target.value })}
            >
              <option value="">All departments</option>
              {facets?.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              aria-label="SLA"
              value={filters.sla}
              onChange={(e) => set({ sla: e.target.value as Filters["sla"] })}
            >
              <option value="">Any SLA state</option>
              <option value="breached">Target missed</option>
              <option value="at_risk">Due soon</option>
            </select>
            <div className="flex gap-2">
              <select
                className={inputClass}
                aria-label="Escalation"
                value={filters.escalated}
                onChange={(e) => set({ escalated: e.target.value as Filters["escalated"] })}
              >
                <option value="">Escalated or not</option>
                <option value="me">Escalated to me</option>
                <option value="any">All escalated</option>
              </select>
              {activeFilters > 0 && (
                <button
                  onClick={() => set({ assigned: "", priority_id: "", department_id: "", sla: "", escalated: "" })}
                  className="px-3 h-9 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex-1 min-h-0 flex flex-col gap-3">
        <ErrorBanner message={error} />
        {(loading || data) && (
          <Card className={`overflow-x-auto overflow-y-auto flex-1 min-h-0 relative transition-opacity ${refreshing ? "opacity-60" : ""}`}>
            <ComplaintTable complaints={data?.items ?? []} loading={loading} emptyText="No complaints match these filters." />
          </Card>
        )}
        {data && <Pagination page={page} pageSize={data.page_size} total={data.total} noun="complaints" onPage={setPage} />}
      </div>
    </div>
  );
}

function ComplaintsRoute() {
  // Links from the dashboard, sidebar and header search set these; remount when they change.
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (params.get("escalated") === "me") {
      const q = new URLSearchParams(params.toString());
      q.delete("escalated");
      const qs = q.toString();
      router.replace(`/escalated${qs ? `?${qs}` : ""}`);
    }
  }, [params, router]);

  const initial: Filters = {
    search: params.get("search") ?? "",
    group: pick(params.get("group"), ["open", "in_progress", "resolved", "rejected"] as const),
    assigned: pick(params.get("assigned"), ["me", "unassigned"] as const),
    priority_id: params.get("priority_id") ?? "",
    department_id: params.get("department_id") ?? "",
    sla: pick(params.get("sla"), ["breached", "at_risk"] as const),
    escalated: pick(params.get("escalated"), ["me", "any"] as const),
  };
  return <ComplaintsList key={params.toString()} initial={initial} />;
}

export default function ComplaintsPage() {
  return (
    <RequirePermission anyOf={["complaint.view"]}>
      <Suspense>
        <ComplaintsRoute />
      </Suspense>
    </RequirePermission>
  );
}
