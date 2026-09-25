"use client";

import React, { useMemo } from "react";
import { LocationNode } from "@/lib/api";
import { inputClass } from "./ui";

/** Path of nodes from the root to `id`, or [] when not found. */
export function findPath(nodes: LocationNode[], id: number | null): LocationNode[] {
  if (id === null) return [];
  for (const node of nodes) {
    if (node.id === id) return [node];
    const below = findPath(node.children, id);
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
  tree,
  value,
  onChange,
  allowAny = false,
  anyLabel = "All locations",
  disabled = false,
}: {
  tree: LocationNode[];
  value: number | null;
  onChange: (id: number | null) => void;
  allowAny?: boolean;
  anyLabel?: string;
  disabled?: boolean;
}) {
  const path = useMemo(() => findPath(tree, value), [tree, value]);

  // One select per level: the selected node's siblings, plus one for its children.
  const levels: { options: LocationNode[]; selected: LocationNode | null; parent: LocationNode | null }[] = [];
  let options = tree;
  let parent: LocationNode | null = null;
  for (let depth = 0; options.length > 0; depth++) {
    const selected: LocationNode | null = path[depth] ?? null;
    levels.push({ options, selected, parent });
    if (!selected) break;
    parent = selected;
    options = selected.children;
  }

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
            {level.options.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
        );
      })}
    </div>
  );
}
