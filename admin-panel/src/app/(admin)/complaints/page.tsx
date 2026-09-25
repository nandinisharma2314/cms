"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, StatusGroup } from "@/lib/api";
import { useApiData, useDebounced } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { GROUP_LABELS } from "@/lib/status";
import { RequirePermission } from "@/components/RequirePermission";
import { RecentComplaintsTable } from "@/components/RecentComplaintsTable";
import { ErrorBanner, inputClass, PageHeader, primaryButtonClass, secondaryButtonClass, CustomSelect } from "@/components/ui";
import { Filter, X, Search, SlidersHorizontal, ChevronDown } from "lucide-react";

interface Filters {
  search: string;
  group: StatusGroup | "";
  assigned: "me" | "unassigned" | "";
  priority: string;
  sla: "breached" | "at_risk" | "";
  escalated: "me" | "any" | "";
}

const GROUP_TABS: { value: StatusGroup | ""; label: string }[] = [
  { value: "", label: "All" },
  ...(Object.entries(GROUP_LABELS) as [StatusGroup, string][]).map(([value, label]) => ({ value, label })),
];

function ComplaintsList({ initial }: { initial: Filters }) {
  const { me, can } = useSession();
  const [filters, setFilters] = useState<Filters>(initial);
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const debouncedSearch = useDebounced(filters.search.trim());
  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });

  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: complaints = [], error, loading } = useApiData(
    () =>
      api.complaints.list({
        search: debouncedSearch || undefined,
        group: filters.group,
        assigned: filters.assigned,
        priority: filters.priority || undefined,
        sla: filters.sla,
        escalated: filters.escalated,
      }),
    [debouncedSearch, filters.group, filters.assigned, filters.priority, filters.sla, filters.escalated],
  );

  // Department options come from the complaints themselves, so users who
  // cannot list departments still get a working filter.
  const departmentNames = Array.from(new Set(complaints.map((c) => c.department))).sort();
  const visible = departmentFilter === "All" ? complaints : complaints.filter((c) => c.department === departmentFilter);

  return (
    <>
      <PageHeader
        title="Complaints"
        description={
          me.is_super_admin ? "All complaints in the system." : "Complaints inside your department and location scope."
        }
      />
      <div className="flex items-center justify-between gap-4 w-full relative z-20 overflow-visible">
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative w-[220px]">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              className="w-full h-10 pl-10 pr-4 text-xs font-medium bg-white border border-slate-200 text-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm placeholder:text-slate-400 transition-all"
              placeholder="Search by ID, title or area"
              value={filters.search}
              onChange={(e) => set({ search: e.target.value })}
            />
          </div>

          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`flex shrink-0 items-center gap-2 px-4 h-10 font-semibold text-xs rounded-xl transition-colors shadow-sm cursor-pointer border ${
              filtersOpen ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <SlidersHorizontal className={`w-4 h-4 ${filtersOpen ? "text-blue-600" : "text-slate-500"}`} />
            <span>Filters</span>
          </button>

          {filtersOpen && (
            <div className="flex items-center gap-2.5 animate-in fade-in slide-in-from-left-4 duration-300 shrink-0">
              <CustomSelect
                className="w-[140px]"
                value={filters.assigned}
                onChange={(v) => set({ assigned: v as Filters["assigned"] })}
                placeholder="Anyone"
                options={[
                  { value: "", label: "Anyone" },
                  { value: "me", label: "Assigned to me" },
                  ...(can("complaint.assign") ? [{ value: "unassigned", label: "Unassigned" }] : []),
                ]}
              />

              <CustomSelect
                className="w-[140px]"
                value={filters.priority}
                onChange={(v) => set({ priority: v })}
                placeholder="All priorities"
                options={[
                  { value: "", label: "All priorities" },
                  { value: "High,Critical", label: "High + Critical" },
                  ...["Critical", "High", "Medium", "Low"].map((p) => ({ value: p, label: p })),
                ]}
              />

              <CustomSelect
                className="w-[140px]"
                value={filters.sla}
                onChange={(v) => set({ sla: v as Filters["sla"] })}
                placeholder="Any SLA state"
                options={[
                  { value: "", label: "Any SLA state" },
                  { value: "breached", label: "SLA breached" },
                  { value: "at_risk", label: "Due soon" },
                ]}
              />

              <CustomSelect
                className="w-[140px]"
                value={filters.escalated}
                onChange={(v) => set({ escalated: v as Filters["escalated"] })}
                placeholder="Escalated or not"
                options={[
                  { value: "", label: "Escalated or not" },
                  { value: "me", label: "Escalated to me" },
                  { value: "any", label: "All escalated" },
                ]}
              />

              <CustomSelect
                className="w-[150px]"
                value={departmentFilter}
                onChange={(v) => setDepartmentFilter(v)}
                placeholder="All departments"
                options={[
                  { value: "All", label: "All departments" },
                  ...departmentNames.map((d) => ({ value: d, label: d })),
                ]}
              />

              <button
                onClick={() => {
                  set({ assigned: "", priority: "", sla: "", escalated: "" });
                  setDepartmentFilter("All");
                }}
                className="ml-1 px-3 h-10 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-transparent hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {GROUP_TABS.map((tab) => (
            <button
              key={tab.value || "all"}
              onClick={() => set({ group: tab.value })}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer whitespace-nowrap ${
                filters.group === tab.value
                  ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <ErrorBanner message={error} />
      <RecentComplaintsTable title="Complaints" complaints={visible} isLoading={loading} showAllRows />
    </>
  );
}

function ComplaintsRoute() {
  // Links from the dashboard and header search set these; remount when they change.
  const params = useSearchParams();
  const initial: Filters = {
    search: params.get("search") ?? "",
    group: (params.get("group") as Filters["group"]) ?? "",
    assigned: (params.get("assigned") as Filters["assigned"]) ?? "",
    priority: params.get("priority") ?? "",
    sla: (params.get("sla") as Filters["sla"]) ?? "",
    escalated: (params.get("escalated") as Filters["escalated"]) ?? "",
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
