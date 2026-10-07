"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building, Pencil, Plus, Trash2 } from "lucide-react";
import { api, Category, Department, Priority } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { useAction, useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { RequirePermission } from "@/components/RequirePermission";
import {
  Card,
  ErrorBanner,
  Field,
  iconButtonClass,
  inputClass,
  Modal,
  Notice,
  PageHeader,
  primaryButtonClass,
  PriorityBadge,
  secondaryButtonClass,
  StatusPill,
} from "@/components/ui";

/** Active priorities; `current` (a category's existing default) is listed too if it has been retired since. */
function PrioritySelect({
  priorities,
  value,
  onChange,
  current,
  label = "Default priority",
}: {
  priorities: Priority[];
  value: number | null;
  onChange: (id: number) => void;
  current?: { id: number; name: string };
  label?: string;
}) {
  return (
    <select
      required
      className={inputClass}
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      <option value="" disabled>
        Priority…
      </option>
      {current && !priorities.some((p) => p.id === current.id) && <option value={current.id}>{current.name} (retired)</option>}
      {priorities.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

function DepartmentForm({
  editing,
  priorities,
  onClose,
  onSaved,
}: {
  editing: Department | null;
  priorities: Priority[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { limits } = useConfig();
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [categories, setCategories] = useState<{ name: string; default_priority_id: number | null }[]>([
    { name: "", default_priority_id: null },
  ]);
  const { busy, error, run } = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (editing) {
        await api.departments.update(editing.id, { name, code, description });
        onSaved(`${name} saved.`);
      } else {
        const filled = categories.filter((c) => c.name.trim());
        if (filled.length === 0 || filled.some((c) => c.default_priority_id === null)) {
          throw new Error("Add at least one category, each with a default priority.");
        }
        await api.departments.create({
          name,
          code,
          description: description.trim() || null,
          categories: filled.map((c) => ({ name: c.name, default_priority_id: c.default_priority_id! })),
        });
        onSaved(`${name} created.`);
      }
    });
  };

  return (
    <Modal title={editing ? `Edit ${editing.name}` : "Add a department"} onClose={onClose} wide={!editing}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Field label="Name">
              <input
                required
                maxLength={limits.department_name}
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Code" hint={`Up to ${limits.department_code} letters, digits, - or _`}>
            <input
              required
              maxLength={limits.department_code}
              className={inputClass}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </Field>
        </div>
        <Field label="Description (optional)">
          <input
            maxLength={limits.department_description}
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        {!editing && (
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-slate-600 mb-1">
              Complaint categories (end users choose one; its priority applies to new complaints)
            </legend>
            {categories.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={inputClass}
                  placeholder="Category name"
                  aria-label={`Category ${i + 1} name`}
                  maxLength={limits.category_name}
                  value={c.name}
                  onChange={(e) => setCategories(categories.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <div className="w-44 shrink-0">
                  <PrioritySelect
                    priorities={priorities}
                    value={c.default_priority_id}
                    onChange={(id) => setCategories(categories.map((x, j) => (j === i ? { ...x, default_priority_id: id } : x)))}
                  />
                </div>
                <button
                  type="button"
                  className={`${iconButtonClass} hover:text-rose-600 hover:bg-rose-50`}
                  aria-label="Remove category"
                  disabled={categories.length === 1}
                  onClick={() => setCategories(categories.filter((_, j) => j !== i))}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
              onClick={() => setCategories([...categories, { name: "", default_priority_id: null }])}
            >
              <Plus className="w-3.5 h-3.5" /> Add category
            </button>
          </fieldset>
        )}
        <div className="pt-2 flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CategoryDialog({
  department,
  category,
  priorities,
  onClose,
  onSaved,
}: {
  department: Department;
  category: Category | null;
  priorities: Priority[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { limits } = useConfig();
  const [name, setName] = useState(category?.name ?? "");
  const [priorityId, setPriorityId] = useState<number | null>(category?.default_priority.id ?? null);
  const { busy, error, run } = useAction();

  return (
    <Modal
      title={category ? `Edit ${category.name}` : `Add a category to ${department.name}`}
      description="A new default priority applies to complaints filed from now on; existing complaints keep theirs."
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (priorityId === null) return;
          run(async () => {
            if (category) {
              const changes: { name?: string; default_priority_id?: number } = {};
              if (name.trim() !== category.name) changes.name = name;
              if (priorityId !== category.default_priority.id) changes.default_priority_id = priorityId;
              if (Object.keys(changes).length) await api.departments.updateCategory(department.id, category.id, changes);
            } else {
              await api.departments.addCategory(department.id, name, priorityId);
            }
            onSaved();
          });
        }}
      >
        <ErrorBanner message={error} />
        <Field label="Name">
          <input
            required
            maxLength={limits.category_name}
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Default priority">
          <PrioritySelect
            priorities={priorities}
            value={priorityId}
            onChange={setPriorityId}
            current={category?.default_priority}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? "Saving…" : "Save"}
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
  onEditCategory,
  onChanged,
}: {
  department: Department;
  canUpdate: boolean;
  onEdit: () => void;
  onEditCategory: (category: Category | null) => void;
  onChanged: () => void;
}) {
  const { error, run } = useAction();

  const toggleDepartment = () => {
    const verb = department.is_active ? "Deactivate" : "Reactivate";
    const consequence = department.is_active ? " End users can no longer file complaints for it; open ones continue." : "";
    if (!confirm(`${verb} ${department.name}?${consequence}`)) return;
    run(async () => {
      await api.departments.update(department.id, { is_active: !department.is_active });
      onChanged();
    });
  };

  const toggleCategory = (c: Category) =>
    run(async () => {
      await api.departments.updateCategory(department.id, c.id, { is_active: !c.is_active });
      onChanged();
    });

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <Building className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 truncate">{department.name}</h2>
            <div className="text-[11px] text-slate-400">
              <span className="font-mono">{department.code}</span>
              {department.open_complaints !== undefined && ` · ${department.open_complaints.toLocaleString()} open complaints`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <StatusPill active={department.is_active} />
          {canUpdate && (
            <button className={iconButtonClass} aria-label={`Edit ${department.name}`} title="Edit" onClick={onEdit}>
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {department.description && <p className="text-xs text-slate-500">{department.description}</p>}
      <ul className="divide-y divide-slate-50 border border-slate-100 rounded-xl">
        {department.categories.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-xs">
            <span className={`flex-1 min-w-0 truncate ${c.is_active ? "text-slate-700" : "text-slate-400 line-through"}`}>
              {c.name}
            </span>
            <PriorityBadge priority={c.default_priority} />
            {canUpdate && (
              <>
                <button className={iconButtonClass} aria-label={`Edit ${c.name}`} title="Edit" onClick={() => onEditCategory(c)}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  className="text-[11px] font-semibold text-slate-500 hover:text-blue-600 cursor-pointer w-16 text-right"
                  onClick={() => toggleCategory(c)}
                >
                  {c.is_active ? "Retire" : "Restore"}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {canUpdate && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
            onClick={() => onEditCategory(null)}
          >
            <Plus className="w-3.5 h-3.5" /> Add category
          </button>
          <button
            className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 cursor-pointer"
            onClick={toggleDepartment}
          >
            {department.is_active ? "Deactivate department" : "Reactivate department"}
          </button>
        </div>
      )}
      <ErrorBanner message={error} />
    </Card>
  );
}

function DepartmentsList() {
  useDocumentTitle("Departments");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useSession();
  const [editing, setEditing] = useState<Department | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{ department: Department; category: Category | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The "Add department" quick action links here with ?new=1
  const [creating, setCreating] = useState(() => searchParams.get("new") === "1" && can("department.create"));
  const { data: departmentList, error, reload } = useApiData(() => api.departments.list(), []);
  const { data: priorityList, error: priorityError } = useApiData(() => api.priorities.list(), []);
  const departments = departmentList ?? [];
  const priorities = priorityList ?? [];

  useEffect(() => {
    if (searchParams.get("new")) router.replace("/departments");
  }, [searchParams, router]);

  return (
    <>
      <PageHeader
        title="Departments"
        description="Departments and the complaint categories end users choose from. Each category sets the priority of new complaints."
        actions={
          can("department.create") && (
            <button className={primaryButtonClass} onClick={() => setCreating(true)} disabled={priorities.length === 0}>
              <Plus className="w-3.5 h-3.5" /> Add department
            </button>
          )
        }
      />
      <ErrorBanner message={error ?? priorityError} />
      {can("department.create") && priorityList?.length === 0 && (
        <ErrorBanner message="Create priorities first (Priorities & SLA): every category needs a default priority." />
      )}
      <Notice message={notice} />
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
        {departments.map((d) => (
          <DepartmentCard
            key={d.id}
            department={d}
            canUpdate={can("department.update")}
            onEdit={() => setEditing(d)}
            onEditCategory={(category) => setCategoryDialog({ department: d, category })}
            onChanged={reload}
          />
        ))}
      </div>
      {departmentList?.length === 0 && <p className="text-xs text-slate-400">No departments yet.</p>}

      {(creating || editing) && (
        <DepartmentForm
          editing={editing}
          priorities={priorities}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(message) => {
            setCreating(false);
            setEditing(null);
            setNotice(message);
            reload();
          }}
        />
      )}
      {categoryDialog && (
        <CategoryDialog
          department={categoryDialog.department}
          category={categoryDialog.category}
          priorities={priorities}
          onClose={() => setCategoryDialog(null)}
          onSaved={() => {
            setCategoryDialog(null);
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
