"use client";

import React, { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Calendar,
  Layers,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api, LocationNode, StatusGroup } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { useApiData, useDebounced } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { GROUP_LABELS } from "@/lib/status";
import { ComplaintTable } from "@/components/ComplaintTable";
import {
  ComplaintFilterDrawer,
  ComplaintFilters,
  countActiveFilters,
} from "@/components/ComplaintFilterDrawer";
import { RequirePermission } from "@/components/RequirePermission";
import { Card, ErrorBanner, PageHeader, Pagination, tabClass } from "@/components/ui";

const GROUP_TABS: { value: StatusGroup | ""; label: string }[] = [
  { value: "", label: "All" },
  ...(Object.entries(GROUP_LABELS) as [StatusGroup, string][]).map(([value, label]) => ({ value, label })),
];

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | "" {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

function findLocationNode(nodes: LocationNode[], id: number): LocationNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const found = findLocationNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function EscalatedList({ initial }: { initial: ComplaintFilters }) {
  const { can } = useSession();
  const { ui } = useConfig();
  const [filters, setFilters] = useState<ComplaintFilters>(initial);
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useDocumentTitle(filters.escalated === "any" ? "All Escalated" : "Escalated to me");

  const search = useDebounced(filters.search.trim());
  const set = (patch: Partial<ComplaintFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const resetAll = () => {
    setFilters({
      search: "",
      group: "",
      assigned: "",
      priority_id: "",
      department_id: "",
      location_id: "",
      date_from: "",
      date_to: "",
      sla: "",
      escalated: "me",
    });
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
        location_id: filters.location_id ? Number(filters.location_id) : undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
        sla: filters.sla,
        escalated: filters.escalated || "me",
        page,
        page_size: ui.default_page_size,
      }),
    [
      search,
      filters.group,
      filters.assigned,
      filters.priority_id,
      filters.department_id,
      filters.location_id,
      filters.date_from,
      filters.date_to,
      filters.sla,
      filters.escalated,
      page,
      ui.default_page_size,
    ],
  );

  const activeCount = countActiveFilters(filters);

  // Active filter chip labels
  const { data: _locPath } = useApiData(
    () => filters.location_id ? api.locations.path(Number(filters.location_id)) : Promise.resolve([]),
    [filters.location_id]
  );
  const selectedLocation = _locPath && _locPath.length > 0 ? _locPath[_locPath.length - 1] : null;

  const selectedDepartment = useMemo(() => {
    if (!filters.department_id || !facets?.departments) return null;
    return facets.departments.find((d) => String(d.id) === filters.department_id);
  }, [facets?.departments, filters.department_id]);

  const selectedPriority = useMemo(() => {
    if (!filters.priority_id || !facets?.priorities) return null;
    return facets.priorities.find((p) => String(p.id) === filters.priority_id);
  }, [facets?.priorities, filters.priority_id]);

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] -mt-5 sm:-mt-2">
      <div className="shrink-0">
        <PageHeader
          title={filters.escalated === "any" ? "All Escalated Complaints" : "Escalated to me"}
          description={
            filters.escalated === "any"
              ? "All complaints across the organization currently in an escalated state."
              : "Complaints escalated to you requiring immediate supervisor attention and resolution."
          }
        />
      </div>

      <div className="flex flex-col gap-3 shrink-0 mt-2 sm:mt-4">
        {/* Controls row */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-72">
              <Search className="absolute left-2.5 sm:left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                className="w-full h-10 pl-8 sm:pl-10 pr-2 sm:pr-4 text-xs font-medium bg-white border border-slate-200 text-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400"
                placeholder="Search by ID, title or area"
                aria-label="Search escalated complaints"
                value={filters.search}
                onChange={(e) => set({ search: e.target.value })}
              />
            </div>

            {/* Trigger button for Offcanvas Drawer */}
            <button
              onClick={() => setDrawerOpen(true)}
              aria-expanded={drawerOpen}
              className={`shrink-0 flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 h-10 font-semibold text-xs rounded-xl border cursor-pointer transition-all ${
                drawerOpen || activeCount > 0
                  ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Filters</span>
              {activeCount > 0 && (
                <span
                  className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    drawerOpen || activeCount > 0 ? "bg-white text-blue-600" : "bg-blue-600 text-white"
                  }`}
                >
                  {activeCount}
                </span>
              )}
            </button>

            {/* Mobile status dropdown */}
            <div className="block lg:hidden shrink-0 w-24 sm:w-32">
              <select
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-1.5 sm:px-3 text-[10px] sm:text-sm font-semibold text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={filters.group}
                onChange={(e) => set({ group: e.target.value as StatusGroup | "" })}
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

          {/* Desktop Status Group Tabs */}
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

        {/* Active Filter Chips Bar (Shown when any filters are active) */}
        {activeCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">Active:</span>

            {/* Date filter chip */}
            {(filters.date_from || filters.date_to) && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-semibold">
                <Calendar className="w-3 h-3 text-blue-600" />
                <span>
                  {filters.date_from && filters.date_to
                    ? `${filters.date_from} → ${filters.date_to}`
                    : filters.date_from
                    ? `From ${filters.date_from}`
                    : `Until ${filters.date_to}`}
                </span>
                <button
                  type="button"
                  onClick={() => set({ date_from: "", date_to: "" })}
                  className="hover:text-blue-900 cursor-pointer"
                  title="Remove date filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Location filter chip */}
            {selectedLocation && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                <MapPin className="w-3 h-3 text-emerald-600" />
                <span>{selectedLocation.name}</span>
                <button
                  type="button"
                  onClick={() => set({ location_id: "" })}
                  className="hover:text-emerald-950 cursor-pointer"
                  title="Remove location filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Department filter chip */}
            {selectedDepartment && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 text-[11px] font-semibold">
                <Layers className="w-3 h-3 text-purple-600" />
                <span>{selectedDepartment.name}</span>
                <button
                  type="button"
                  onClick={() => set({ department_id: "" })}
                  className="hover:text-purple-950 cursor-pointer"
                  title="Remove department filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Priority filter chip */}
            {selectedPriority && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-semibold">
                <span>Priority: {selectedPriority.name}</span>
                <button
                  type="button"
                  onClick={() => set({ priority_id: "" })}
                  className="hover:text-indigo-950 cursor-pointer"
                  title="Remove priority filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Assignment filter chip */}
            {filters.assigned && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 text-[11px] font-semibold">
                <span>{filters.assigned === "me" ? "Assigned to me" : "Unassigned"}</span>
                <button
                  type="button"
                  onClick={() => set({ assigned: "" })}
                  className="hover:text-slate-950 cursor-pointer"
                  title="Remove assignment filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* SLA filter chip */}
            {filters.sla && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold">
                <span>{filters.sla === "breached" ? "Target missed (breached)" : "Due soon (at risk)"}</span>
                <button
                  type="button"
                  onClick={() => set({ sla: "" })}
                  className="hover:text-amber-950 cursor-pointer"
                  title="Remove SLA filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Escalation filter chip */}
            {filters.escalated !== "me" && filters.escalated && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-[11px] font-semibold">
                <span>All escalated</span>
                <button
                  type="button"
                  onClick={() => set({ escalated: "me" })}
                  className="hover:text-rose-950 cursor-pointer"
                  title="Reset to escalated to me"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Reset button */}
            <button
              type="button"
              onClick={resetAll}
              className="text-[11px] font-bold text-red-600 hover:text-red-700 hover:underline px-2 py-0.5 cursor-pointer ml-1"
            >
              Reset all
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="mt-4 flex-1 min-h-0 flex flex-col gap-3">
        <ErrorBanner message={error} />
        {(loading || data) && (
          <Card
            className={`overflow-x-auto overflow-y-auto flex-1 min-h-0 relative transition-opacity ${
              refreshing ? "opacity-60" : ""
            }`}
          >
            <ComplaintTable
              complaints={data?.items ?? []}
              loading={loading}
              emptyText={
                filters.escalated === "any"
                  ? "No escalated complaints found."
                  : "No complaints are currently escalated to you."
              }
            />
          </Card>
        )}
        {data && (
          <Pagination
            page={page}
            pageSize={data.page_size}
            total={data.total}
            noun="escalated complaints"
            onPage={setPage}
          />
        )}
      </div>

      {/* Offcanvas Filter Drawer */}
      <ComplaintFilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        onChange={set}
        onReset={resetAll}
        facets={facets}
        canAssign={can("complaint.assign")}
        totalCount={data?.total}
      />
    </div>
  );
}

function EscalatedRoute() {
  const params = useSearchParams();
  const initial: ComplaintFilters = {
    search: params.get("search") ?? "",
    group: pick(params.get("group"), ["open", "in_progress", "resolved", "rejected"] as const),
    assigned: pick(params.get("assigned"), ["me", "unassigned"] as const),
    priority_id: params.get("priority_id") ?? "",
    department_id: params.get("department_id") ?? "",
    location_id: params.get("location_id") ?? "",
    date_from: params.get("date_from") ?? "",
    date_to: params.get("date_to") ?? "",
    sla: pick(params.get("sla"), ["breached", "at_risk"] as const),
    escalated: pick(params.get("escalated"), ["me", "any"] as const) || "me",
  };

  return <EscalatedList initial={initial} />;
}

export default function EscalatedPage() {
  return (
    <RequirePermission anyOf={["complaint.view"]}>
      <Suspense>
        <EscalatedRoute />
      </Suspense>
    </RequirePermission>
  );
}
