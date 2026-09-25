"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Department, LocationNode, ScopeInput, UserScope } from "@/lib/api";
import { LocationPicker } from "./LocationPicker";
import { inputClass } from "./ui";

export function scopeLabel(scope: UserScope): string {
  const department = scope.department?.name ?? "All departments";
  const location = scope.location?.label ?? "All locations";
  return `${department} · ${location}`;
}

/** Edits a user's list of (department, location) scopes. */
export function ScopeEditor({
  scopes,
  onChange,
  departments,
  tree,
}: {
  scopes: ScopeInput[];
  onChange: (scopes: ScopeInput[]) => void;
  departments: Department[];
  tree: LocationNode[];
}) {
  const update = (index: number, patch: Partial<ScopeInput>) =>
    onChange(scopes.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-2">
      {scopes.map((scope, index) => (
        <div key={index} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
          <div className="flex items-center gap-2">
            <select
              className={inputClass}
              value={scope.department_id ?? ""}
              onChange={(e) => update(index, { department_id: e.target.value ? Number(e.target.value) : null })}
              aria-label="Department"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onChange(scopes.filter((_, i) => i !== index))}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
              title="Remove scope"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <LocationPicker
            tree={tree}
            value={scope.location_id}
            onChange={(location_id) => update(index, { location_id })}
            allowAny
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...scopes, { department_id: null, location_id: null }])}
        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" /> Add scope
      </button>
    </div>
  );
}
