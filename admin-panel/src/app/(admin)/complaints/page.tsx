"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  useDocumentTitle("Complaints");
  const { me, can } = useSession();
  const { ui } = useConfig();
  const [filters, setFilters] = useState<Filters>(initial);
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
    <>
      <PageHeader
        title="Complaints"
        description={
          me.is_super_admin ? "All complaints in the system." : "Complaints inside your department and location scope."
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              className="w-full h-10 pl-10 pr-4 text-xs font-medium bg-white border border-slate-200 text-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400"
              placeholder="Search by ID, title or area"
              aria-label="Search complaints"
              value={filters.search}
              onChange={(e) => set({ search: e.target.value })}
            />
          </div>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            aria-expanded={filtersOpen}
            className={`flex items-center gap-2 px-4 h-10 font-semibold text-xs rounded-xl border cursor-pointer ${
              filtersOpen || activeFilters
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters{activeFilters ? ` (${activeFilters})` : ""}
          </button>
          <div className="flex flex-wrap gap-2 lg:ml-auto" role="tablist" aria-label="Status">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 items-center">
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

      <ErrorBanner message={error} />
      {(loading || data) && (
        <Card className={`overflow-hidden transition-opacity ${refreshing ? "opacity-60" : ""}`}>
          <ComplaintTable complaints={data?.items ?? []} loading={loading} emptyText="No complaints match these filters." />
        </Card>
      )}
      {data && <Pagination page={page} pageSize={data.page_size} total={data.total} noun="complaints" onPage={setPage} />}
    </>
  );
}

function ComplaintsRoute() {
  // Links from the dashboard, sidebar and header search set these; remount when they change.
  const params = useSearchParams();
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
