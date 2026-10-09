"use client";

import React, { useEffect, useMemo } from "react";
import { Calendar, Check, CheckSquare, Clock, Layers, MapPin, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { ComplaintFacets, LocationNode, StatusGroup } from "@/lib/api";
import { GROUP_LABELS } from "@/lib/status";
import { inputClass } from "@/components/ui";

export interface ComplaintFilters {
  search: string;
  group: StatusGroup | "";
  assigned: "me" | "unassigned" | "";
  priority_id: string;
  department_id: string;
  location_id: string;
  date_from: string;
  date_to: string;
  sla: "breached" | "at_risk" | "";
  escalated: "me" | "any" | "";
  created_by: "me" | "";
}

export function countActiveFilters(filters: ComplaintFilters): number {
  return [
    filters.group,
    filters.assigned,
    filters.priority_id,
    filters.department_id,
    filters.location_id,
    filters.date_from || filters.date_to ? "date" : "",
    filters.sla,
    filters.escalated,
    filters.created_by,
  ].filter(Boolean).length;
}

function toYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function findNodePath(nodes: LocationNode[], targetId: number, currentPath: LocationNode[] = []): LocationNode[] | null {
  for (const node of nodes) {
    const path = [...currentPath, node];
    if (node.id === targetId) return path;
    if (node.children?.length) {
      const found = findNodePath(node.children, targetId, path);
      if (found) return found;
    }
  }
  return null;
}

interface ComplaintFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  filters: ComplaintFilters;
  onChange: (patch: Partial<ComplaintFilters>) => void;
  onReset: () => void;
  facets?: ComplaintFacets | null;
  canAssign?: boolean;
  totalCount?: number;
}

export function ComplaintFilterDrawer({
  open,
  onClose,
  filters,
  onChange,
  onReset,
  facets,
  canAssign = false,
  totalCount,
}: ComplaintFilterDrawerProps) {
  // Close on Escape key press
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [open]);

  const tree = React.useMemo(() => facets?.locations ?? [], [facets?.locations]);

  // Find the selected location path (Country -> State -> District -> City -> Area)
  const activeLocationPath = useMemo(() => {
    if (!filters.location_id || !tree.length) return null;
    return findNodePath(tree, Number(filters.location_id));
  }, [tree, filters.location_id]);

  // Build the dynamic hierarchy levels for the cascading selects
  const locationLevels = useMemo(() => {
    if (!tree.length) return [];
    const levels: {
      depth: number;
      label: string;
      nodes: LocationNode[];
      selectedId: number | null;
    }[] = [];

    let currentNodes: LocationNode[] = tree;
    let depth = 0;

    while (currentNodes && currentNodes.length > 0) {
      const selectedNode = activeLocationPath && activeLocationPath[depth] ? activeLocationPath[depth] : null;
      const typeLabel =
        currentNodes[0]?.type_name ||
        (depth === 0 ? "Country" : depth === 1 ? "State" : depth === 2 ? "District" : depth === 3 ? "City" : "Area / Zone");

      levels.push({
        depth,
        label: typeLabel,
        nodes: currentNodes,
        selectedId: selectedNode ? selectedNode.id : null,
      });

      if (selectedNode && selectedNode.children?.length) {
        currentNodes = selectedNode.children;
        depth++;
      } else {
        break;
      }
    }

    return levels;
  }, [tree, activeLocationPath]);

  // Handle selection at a specific location depth
  const handleLocationChange = (depth: number, newIdStr: string) => {
    if (!newIdStr) {
      // User picked "All" at this level -> fallback to parent node's ID or empty if top level
      if (depth === 0) {
        onChange({ location_id: "" });
      } else {
        const parentNode = activeLocationPath?.[depth - 1];
        onChange({ location_id: parentNode ? String(parentNode.id) : "" });
      }
    } else {
      onChange({ location_id: newIdStr });
    }
  };

  // Date presets
  const todayStr = useMemo(() => toYMD(new Date()), []);
  const applyPreset = (preset: "all" | "today" | "yesterday" | "7d" | "30d" | "month") => {
    const today = new Date();
    switch (preset) {
      case "all":
        onChange({ date_from: "", date_to: "" });
        break;
      case "today":
        onChange({ date_from: todayStr, date_to: todayStr });
        break;
      case "yesterday": {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        const ymd = toYMD(y);
        onChange({ date_from: ymd, date_to: ymd });
        break;
      }
      case "7d": {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        onChange({ date_from: toYMD(d), date_to: todayStr });
        break;
      }
      case "30d": {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        onChange({ date_from: toYMD(d), date_to: todayStr });
        break;
      }
      case "month": {
        const first = new Date(today.getFullYear(), today.getMonth(), 1);
        onChange({ date_from: toYMD(first), date_to: todayStr });
        break;
      }
    }
  };

  const isPresetActive = (preset: "all" | "today" | "yesterday" | "7d" | "30d" | "month"): boolean => {
    if (preset === "all") return !filters.date_from && !filters.date_to;
    if (preset === "today") return filters.date_from === todayStr && filters.date_to === todayStr;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const ymd = toYMD(y);
    if (preset === "yesterday") return filters.date_from === ymd && filters.date_to === ymd;
    const d7 = new Date();
    d7.setDate(d7.getDate() - 7);
    if (preset === "7d") return filters.date_from === toYMD(d7) && filters.date_to === todayStr;
    const d30 = new Date();
    d30.setDate(d30.getDate() - 30);
    if (preset === "30d") return filters.date_from === toYMD(d30) && filters.date_to === todayStr;
    const first = toYMD(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    if (preset === "month") return filters.date_from === first && filters.date_to === todayStr;
    return false;
  };

  const activeCount = countActiveFilters(filters);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full sm:max-w-md bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Filter Complaints"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-blue-100/80 text-blue-600">
              <SlidersHorizontal className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Filter Complaints</h2>
              <p className="text-[11px] text-slate-500">Refine by date, region, department and status</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-600 text-white">
                {activeCount} active
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
              aria-label="Close filters"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-xs text-slate-700">
          {/* Section: Date & Time Filters */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Registration Date & Time</span>
              </div>
              {(filters.date_from || filters.date_to) && (
                <button
                  type="button"
                  onClick={() => onChange({ date_from: "", date_to: "" })}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                >
                  Clear dates
                </button>
              )}
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "all", label: "All time" },
                  { id: "today", label: "Today" },
                  { id: "yesterday", label: "Yesterday" },
                  { id: "7d", label: "Last 7 days" },
                  { id: "30d", label: "Last 30 days" },
                  { id: "month", label: "This month" },
                ] as const
              ).map((p) => {
                const active = isPresetActive(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                      active
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Range Inputs */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">From Date</label>
                <input
                  type="date"
                  className={inputClass}
                  value={filters.date_from}
                  onChange={(e) => onChange({ date_from: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">To Date</label>
                <input
                  type="date"
                  className={inputClass}
                  value={filters.date_to}
                  onChange={(e) => onChange({ date_to: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Section: Location Hierarchy (Country -> State -> District -> City -> Area / Zone) */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span>Location Criteria</span>
              </div>
              {filters.location_id && (
                <button
                  type="button"
                  onClick={() => onChange({ location_id: "" })}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                >
                  Clear location
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">Filter by entire state/city or narrow down to a specific ward or area.</p>

            {/* Active Selected Location Breadcrumb */}
            {activeLocationPath && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl border border-blue-200 bg-blue-50/80 text-blue-900 text-xs">
                <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="font-semibold truncate">{activeLocationPath.map((n) => n.name).join(" > ")}</span>
                <button
                  type="button"
                  onClick={() => onChange({ location_id: "" })}
                  className="ml-auto text-blue-400 hover:text-blue-700 cursor-pointer"
                  title="Remove location filter"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Cascading Dropdowns */}
            {locationLevels.length > 0 ? (
              <div className="space-y-2.5">
                {locationLevels.map((lvl) => (
                  <div key={lvl.depth}>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">{lvl.label}</label>
                    <select
                      className={inputClass}
                      value={lvl.selectedId ? String(lvl.selectedId) : ""}
                      onChange={(e) => handleLocationChange(lvl.depth, e.target.value)}
                    >
                      <option value="">All {lvl.label}s</option>
                      {lvl.nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 italic">No locations configured.</p>
            )}
          </div>

          {/* Section: Department & Priority */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Department & Priority</span>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Department</label>
                <select
                  className={inputClass}
                  value={filters.department_id}
                  onChange={(e) => onChange({ department_id: e.target.value })}
                >
                  <option value="">All departments</option>
                  {facets?.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Priority</label>
                <select
                  className={inputClass}
                  value={filters.priority_id}
                  onChange={(e) => onChange({ priority_id: e.target.value })}
                >
                  <option value="">All priorities</option>
                  {facets?.priorities.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.is_active ? "" : " (retired)"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Status & Assignment */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
              <span>Status & Assignment</span>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Status Group</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChange({ group: "" })}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                      filters.group === ""
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    All
                  </button>
                  {(Object.entries(GROUP_LABELS) as [StatusGroup, string][]).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => onChange({ group: k })}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all truncate cursor-pointer ${
                        filters.group === k
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Assignment</label>
                <select
                  className={inputClass}
                  value={filters.assigned}
                  onChange={(e) => onChange({ assigned: e.target.value as ComplaintFilters["assigned"] })}
                >
                  <option value="">Anyone</option>
                  <option value="me">Assigned to me</option>
                  {canAssign && <option value="unassigned">Unassigned</option>}
                </select>
              </div>
            </div>
          </div>

          {/* Section: SLA & Escalation */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>SLA & Escalation</span>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">SLA Target State</label>
                <select
                  className={inputClass}
                  value={filters.sla}
                  onChange={(e) => onChange({ sla: e.target.value as ComplaintFilters["sla"] })}
                >
                  <option value="">Any SLA state</option>
                  <option value="breached">Target missed (Breached)</option>
                  <option value="at_risk">Due soon (At risk)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Escalation Status</label>
                <select
                  className={inputClass}
                  value={filters.escalated}
                  onChange={(e) => onChange({ escalated: e.target.value as ComplaintFilters["escalated"] })}
                >
                  <option value="">Escalated or not</option>
                  <option value="me">Escalated to me</option>
                  <option value="any">All escalated</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200/80 bg-slate-50 flex items-center gap-3">
          <button
            type="button"
            onClick={onReset}
            disabled={activeCount === 0}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 px-4 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:pointer-events-none rounded-xl transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset all
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 px-4 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/25 rounded-xl transition-colors cursor-pointer"
          >
            <Check className="w-4 h-4" />
            Apply ({totalCount ?? 0})
          </button>
        </div>
      </div>
    </>
  );
}
