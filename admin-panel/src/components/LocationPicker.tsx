"use client";

import React, { useEffect, useState, useMemo } from "react";
import { LocationNode, api } from "@/lib/api";
import { inputClass } from "./ui";

const nodeCache = new Map<number | null, LocationNode[]>();

async function fetchNodes(parentId: number | null): Promise<LocationNode[]> {
  if (nodeCache.has(parentId)) return nodeCache.get(parentId)!;
  try {
    const nodes = await api.locations.nodes(parentId);
    nodeCache.set(parentId, nodes);
    return nodes;
  } catch {
    return [];
  }
}

/** Path of nodes from the root to `id`, or [] when not found. */
export function findPath(nodes: LocationNode[], id: number | null): LocationNode[] {
  if (id === null) return [];
  for (const node of nodes) {
    if (node.id === id) return [node];
    const below = findPath(node.children || [], id);
    if (below.length) return [node, ...below];
  }
  return [];
}

/**
 * Cascading selects (country, state, district, ...) over the location tree.
 * The value is the deepest selected node; with `allowAny`, stopping at any
 * level (including none, meaning "all locations") is allowed.
 */
export function LocationPicker({
  tree, // Deprecated prop
  value,
  onChange,
  allowAny = false,
  anyLabel = "All locations",
  disabled = false,
  isSelectable,
  isVisible,
}: {
  tree?: LocationNode[];
  value: number | null;
  onChange: (id: number | null) => void;
  allowAny?: boolean;
  anyLabel?: string;
  disabled?: boolean;
  isSelectable?: (node: LocationNode | null) => boolean;
  isVisible?: (node: LocationNode) => boolean;
}) {
  const [levels, setLevels] = useState<{ options: LocationNode[]; selected: LocationNode | null; parent: LocationNode | null }[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      // 1. Resolve the path
      let pathNodes: LocationNode[] = [];
      if (value) {
        try {
          pathNodes = await api.locations.path(value);
        } catch {
          pathNodes = [];
        }
      }

      // 2. Fetch options for each dropdown
      const parentIds = [null, ...pathNodes.map((n) => n.id)];
      const optionsArrays = await Promise.all(parentIds.map((id) => fetchNodes(id)));
      
      if (!active) return;

      // 3. Build levels
      let autoSelectId: number | null = null;

      const newLevels = optionsArrays.map((options, i) => {
        const parent = i === 0 ? null : pathNodes[i - 1];
        const selected = i < pathNodes.length ? pathNodes[i] : null;
        
        const visibleCount = options.filter(node => isVisible ? isVisible(node) : true).length;
        if (!selected && visibleCount === 1 && autoSelectId === null) {
          autoSelectId = options.filter(node => isVisible ? isVisible(node) : true)[0].id;
        }
        
        return { options, selected, parent };
      });

      // Remove the last level if it's empty (leaf node selected)
      if (newLevels.length > 0 && newLevels[newLevels.length - 1].options.length === 0) {
        newLevels.pop();
      }
      
      setLevels(newLevels);

      if (autoSelectId !== null && autoSelectId !== value) {
        onChange(autoSelectId);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [value]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {levels.map((level, depth) => {
        const levelName = level.options[0]?.type_name ?? "Location";
        return (
          <select
            key={depth}
            className={inputClass}
            disabled={disabled}
            value={level.selected?.id ?? ""}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              onChange(id ?? level.parent?.id ?? null);
            }}
            aria-label={levelName}
          >
            <option value="" disabled={!allowAny && depth === 0}>
              {depth === 0 && allowAny
                ? anyLabel
                : depth === 0
                  ? `Select ${levelName.toLowerCase()}`
                  : allowAny
                    ? `All of ${level.parent?.name}`
                    : `Select ${levelName.toLowerCase()}`}
            </option>
            {level.options
              .filter((node) => (isVisible ? isVisible(node) : true))
              .map((node) => {
              const selectable = isSelectable ? isSelectable(node) : true;
              return (
                <option key={node.id} value={node.id} disabled={!selectable}>
                  {node.name} {!selectable ? "(Outside your scope)" : ""}
                </option>
              );
            })}
          </select>
        );
      })}
    </div>
  );
}
