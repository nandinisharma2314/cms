"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, StatusGroup } from "@/lib/api";
import { useApiData, useDebounced } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { GROUP_LABELS } from "@/lib/status";
import { RequirePermission } from "@/components/RequirePermission";
import { RecentComplaintsTable } from "@/components/RecentComplaintsTable";
import { ErrorBanner, inputClass, PageHeader } from "@/components/ui";

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
      <div className="flex flex-wrap items-center gap-2">
        {GROUP_TABS.map((tab) => (
          <button
            key={tab.value || "all"}
            onClick={() => set({ group: tab.value })}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
              filters.group === tab.value
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <input
          className={`${inputClass} max-w-xs`}
          placeholder="Search by ID, title or area"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
        />
        <select
          className={`${inputClass} max-w-[180px]`}
          value={filters.assigned}
          onChange={(e) => set({ assigned: e.target.value as Filters["assigned"] })}
        >
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          {can("complaint.assign") && <option value="unassigned">Unassigned</option>}
        </select>
        <select className={`${inputClass} max-w-[170px]`} value={filters.priority} onChange={(e) => set({ priority: e.target.value })}>
          <option value="">All priorities</option>
          <option value="High,Critical">High + Critical</option>
          {["Critical", "High", "Medium", "Low"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          className={`${inputClass} max-w-[160px]`}
          value={filters.sla}
          onChange={(e) => set({ sla: e.target.value as Filters["sla"] })}
        >
          <option value="">Any SLA state</option>
          <option value="breached">SLA breached</option>
          <option value="at_risk">Due soon</option>
        </select>
        <select
          className={`${inputClass} max-w-[170px]`}
          value={filters.escalated}
          onChange={(e) => set({ escalated: e.target.value as Filters["escalated"] })}
        >
          <option value="">Escalated or not</option>
          <option value="me">Escalated to me</option>
          <option value="any">All escalated</option>
        </select>
        <select
          className={`${inputClass} max-w-[180px]`}
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
        >
          <option value="All">All departments</option>
          {departmentNames.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
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
