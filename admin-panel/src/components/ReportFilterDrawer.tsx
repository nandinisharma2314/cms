import React, { useEffect, useMemo } from "react";
import { MapPin, SlidersHorizontal, X } from "lucide-react";
import { Department, LocationNode, Priority } from "@/lib/api";
import { inputClass } from "@/components/ui";

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

export interface ReportFilters {
  date_from?: string;
  date_to?: string;
  department_id?: string;
  priority_id?: string;
  location_id?: string;
}

export interface ReportFacets {
  departments: Department[];
  priorities: Priority[];
  locations: LocationNode[];
}

export interface ReportFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  filters: ReportFilters;
  onChange: (patch: Partial<ReportFilters>) => void;
  facets?: ReportFacets | null;
}

export function ReportFilterDrawer({ open, onClose, filters, onChange, facets }: ReportFilterDrawerProps) {
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

  const tree = useMemo(() => facets?.locations ?? [], [facets?.locations]);

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
        aria-label="Filter Reports"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-blue-100/80 text-blue-600">
              <SlidersHorizontal className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Filter Reports</h2>
              <p className="text-[11px] text-slate-500 font-medium">Refine analytics by location and more</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            aria-label="Close filters"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-6">
            {/* Section: Location Selection */}
            <div>
              <div className="flex items-center gap-2 font-bold text-slate-900 mb-2">
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
            <p className="text-[11px] text-slate-500 mt-[-10px]">
              Filter by entire state/city or narrow down to a specific ward or area.
            </p>

            {/* Active Selected Location Breadcrumb */}
            {activeLocationPath && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl border border-blue-200 bg-blue-50/80 text-blue-900 text-xs mt-1">
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
              <div className="space-y-2.5 mt-1">
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
              <p className="text-[11px] text-slate-400 italic mt-1">No locations configured.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-white mt-auto">
          <button
            onClick={onClose}
            className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl transition-colors cursor-pointer"
          >
            Show Results
          </button>
        </div>
      </div>
    </>
  );
}
