"use client";

import React, { useMemo } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { LocationNode } from "@/lib/portalApi";

/** Path of nodes from the top of the tree down to `id` ([] when not found). */
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
 * One select per level of the location tree (whatever levels the organisation
 * uses). The value is the deepest chosen place; `complete` is true once a
 * place without further levels below it is chosen.
 */
export function LocationSelect({
  tree,
  value,
  onChange,
}: {
  tree: LocationNode[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const path = useMemo(() => findPath(tree, value), [tree, value]);
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

  if (tree.length === 0) return <p className="text-[13px] text-slate-500">No places are set up yet.</p>;
  return (
    <div className="flex flex-col gap-2.5">
      {levels.map((level, depth) => {
        const levelName = level.options[0].type_name;
        const id = `location-level-${depth}`;
        return (
          <div
            key={depth}
            className="relative flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-1 pr-3 shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100"
          >
            <span className="rounded-lg bg-blue-50 p-1.5 text-blue-500">
              <MapPin size={18} aria-hidden="true" />
            </span>
            <span className="flex-1 pointer-events-none">
              <span className="block text-[11px] font-bold text-slate-500">
                {levelName} <span className="text-red-500">*</span>
              </span>
              <span className="block truncate text-sm font-semibold text-slate-900">
                {level.selected ? level.selected.name : `Choose ${levelName.toLowerCase()}`}
              </span>
            </span>
            <ChevronDown size={16} className="text-slate-400 pointer-events-none" aria-hidden="true" />
            <select
              id={id}
              value={level.selected?.id ?? ""}
              onChange={(e) => onChange(e.target.value ? Number(e.target.value) : (level.parent?.id ?? null))}
              className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 outline-none"
              aria-label={levelName}
            >
              <option value="" disabled>
                Choose {levelName.toLowerCase()}
              </option>
              {level.options.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

/** Whether `id` is a place with no further levels below it. */
export function isLeaf(tree: LocationNode[], id: number | null): boolean {
  const path = findPath(tree, id);
  return path.length > 0 && path[path.length - 1].children.length === 0;
}
