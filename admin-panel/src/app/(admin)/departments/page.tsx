"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building, Pencil, Plus } from "lucide-react";
import { api, Department } from "@/lib/api";
import { useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { RequirePermission } from "@/components/RequirePermission";
import {
  Card, ErrorBanner, Field, inputClass, Modal, PageHeader, primaryButtonClass, secondaryButtonClass, StatusPill,
} from "@/components/ui";

function DepartmentForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: Department | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [categories, setCategories] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.departments.update(editing.id, { name, code, description, is_active: isActive });
      } else {
        await api.departments.create({
          name,
          code,
          description,
          categories: categories.split(",").map((c) => c.trim()).filter(Boolean),
        });
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? `Edit ${editing.name}` : "Add Department"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Name">
              <input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Field label="Code" hint="e.g. ELEC">
            <input required className={inputClass} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
        </div>
        <Field label="Description">
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {editing ? (
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active (inactive departments are hidden from the end user portal)
          </label>
        ) : (
          <Field label="Complaint categories" hint="Comma separated, e.g. Street Light, Power Cut, Other">
            <input className={inputClass} value={categories} onChange={(e) => setCategories(e.target.value)} />
          </Field>
        )}
        <div className="pt-2 flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButtonClass} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DepartmentCard({
  department,
  canUpdate,
  onEdit,
  onChanged,
}: {
  department: Department;
  canUpdate: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [newCategory, setNewCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<Department>): Promise<boolean> => {
    setError(null);
    try {
      await action();
      onChanged();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Building className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">{department.name}</div>
            <div className="text-[11px] text-slate-400 font-mono">{department.code}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <StatusPill active={department.is_active} />
          {canUpdate && (
            <button className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg cursor-pointer" title="Edit" onClick={onEdit}>
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {department.description && <p className="text-xs text-slate-500">{department.description}</p>}
      <div className="flex flex-wrap gap-1.5">
        {department.categories.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={!canUpdate}
            title={canUpdate ? (c.is_active ? "Click to deactivate" : "Click to reactivate") : undefined}
            onClick={() => run(() => api.departments.updateCategory(department.id, c.id, { is_active: !c.is_active }))}
            className={`px-2 py-0.5 rounded-md text-[11px] border ${
              c.is_active
                ? "bg-slate-50 border-slate-200 text-slate-700"
                : "bg-white border-dashed border-slate-200 text-slate-400 line-through"
            } ${canUpdate ? "cursor-pointer hover:border-blue-300" : ""}`}
          >
            {c.name}
          </button>
        ))}
        {department.categories.length === 0 && <span className="text-[11px] text-slate-400">No categories</span>}
      </div>
      {canUpdate && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newCategory.trim()) return;
            run(() => api.departments.addCategory(department.id, newCategory.trim())).then((ok) => ok && setNewCategory(""));
          }}
        >
          <input
            className={inputClass}
            placeholder="New category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <button type="submit" className={secondaryButtonClass}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </form>
      )}
      <ErrorBanner message={error} />
    </Card>
  );
}

function DepartmentsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useSession();
  const [editing, setEditing] = useState<Department | null>(null);
  // "Add Department" quick action links here with ?new=1
  const [creating, setCreating] = useState(() => searchParams.get("new") === "1" && can("department.create"));
  const { data: departments = [], error, reload } = useApiData(() => api.departments.list(), []);

  useEffect(() => {
    if (searchParams.get("new")) router.replace("/departments");
  }, [searchParams, router]);

  return (
    <>
      <PageHeader
        title="Departments"
        description="Departments and the complaint categories end users can choose from."
        actions={
          can("department.create") && (
            <button className={primaryButtonClass} onClick={() => setCreating(true)}>
              <Plus className="w-3.5 h-3.5" /> Add Department
            </button>
          )
        }
      />
      <ErrorBanner message={error} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {departments.map((d) => (
          <DepartmentCard
            key={d.id}
            department={d}
            canUpdate={can("department.update")}
            onEdit={() => setEditing(d)}
            onChanged={reload}
          />
        ))}
      </div>
      {(creating || editing) && (
        <DepartmentForm
          editing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

export default function DepartmentsPage() {
  return (
    <RequirePermission anyOf={["department.view"]}>
      <Suspense>
        <DepartmentsList />
      </Suspense>
    </RequirePermission>
  );
}
