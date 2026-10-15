"use client";

import React, { useMemo } from "react";
import { MapPin, X } from "lucide-react";
import { LocationNode } from "@/lib/api";

export function findNodePath(nodes: LocationNode[], targetId: number, currentPath: LocationNode[] = []): LocationNode[] | null {
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

export interface LocationHierarchyFilterProps {
  tree?: LocationNode[] | null;
  value?: number | null | undefined;
  onChange: (id: number | undefined) => void;
  layout?: "horizontal" | "vertical" | "grid";
  compact?: boolean;
  showBreadcrumb?: boolean;
  placeholderPrefix?: string;
  className?: string;
  selectClassName?: string;
}

export function LocationHierarchyFilter({
  tree,
  value,
  onChange,
  layout = "horizontal",
  compact = false,
  showBreadcrumb = true,
  placeholderPrefix = "All",
  className = "",
  selectClassName,
}: LocationHierarchyFilterProps) {
  const safeTree = useMemo(() => tree || [], [tree]);

  // Find the selected location path (Country -> State -> District -> City -> Area)
  const activeLocationPath = useMemo(() => {
    if (!value || !safeTree.length) return null;
    return findNodePath(safeTree, Number(value));
  }, [safeTree, value]);

  // Build the dynamic hierarchy levels for the cascading selects
  const locationLevels = useMemo(() => {
    if (!safeTree.length) return [];
    const levels: {
      depth: number;
      label: string;
      nodes: LocationNode[];
      selectedId: number | null;
    }[] = [];

    let currentNodes: LocationNode[] = safeTree;
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
  }, [safeTree, activeLocationPath]);

  // Handle selection at a specific location depth
  const handleLocationChange = (depth: number, newIdStr: string) => {
    if (!newIdStr) {
      // User picked "All" at this level -> fallback to parent node's ID or undefined if top level
      if (depth === 0) {
        onChange(undefined);
      } else {
        const parentNode = activeLocationPath?.[depth - 1];
        onChange(parentNode ? parentNode.id : undefined);
      }
    } else {
      onChange(Number(newIdStr));
    }
  };

  const defaultSelectClass = compact
    ? "h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
    : "w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-xl text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500";

  const resolvedSelectClass = selectClassName || defaultSelectClass;

  if (!safeTree.length) {
    return <div className={`text-xs text-slate-400 italic ${className}`}>No locations configured</div>;
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Active Breadcrumb (if any location is selected) */}
      {showBreadcrumb && activeLocationPath && activeLocationPath.length > 0 && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 text-blue-800 border border-blue-200 text-xs font-semibold self-start shadow-2xs">
          <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="truncate max-w-xs md:max-w-md">{activeLocationPath.map((n) => n.name).join(" › ")}</span>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="p-0.5 hover:bg-blue-200/60 rounded-md text-blue-600 hover:text-blue-900 transition-colors cursor-pointer"
            title="Clear location filter"
            aria-label="Clear location filter"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Cascading Dropdowns */}
      <div
        className={
          layout === "horizontal"
            ? "flex flex-wrap items-center gap-2"
            : layout === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5"
              : "flex flex-col gap-2"
        }
      >
        {locationLevels.map((lvl) => (
          <div key={lvl.depth} className={layout === "grid" ? "space-y-1" : "flex items-center gap-1.5"}>
            {layout === "grid" && (
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{lvl.label}</label>
            )}
            <select
              className={resolvedSelectClass}
              value={lvl.selectedId ? String(lvl.selectedId) : ""}
              onChange={(e) => handleLocationChange(lvl.depth, e.target.value)}
              aria-label={lvl.label}
            >
              <option value="">
                {placeholderPrefix} {lvl.label}s
              </option>
              {lvl.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
