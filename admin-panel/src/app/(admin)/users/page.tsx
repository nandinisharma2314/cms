"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Power, UserPlus } from "lucide-react";
import { api, Department, LocationNode, RoleDetail, ScopeInput, StaffUser } from "@/lib/api";
import { useApiData, useDebounced } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { RequirePermission } from "@/components/RequirePermission";
import { ScopeEditor, scopeLabel } from "@/components/ScopeEditor";
import {
  Card, ErrorBanner, Field, formatDateTime, inputClass, Modal, PageHeader, primaryButtonClass,
  secondaryButtonClass, StatusPill,
} from "@/components/ui";

interface FormState {
  name: string;
  email: string;
  mobile: string;
  role_id: number | null;
  password: string;
  reports_to_id: number | null;
  scopes: ScopeInput[];
  is_available: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  mobile: "",
  role_id: null,
  password: "",
  reports_to_id: null,
  scopes: [{ department_id: null, location_id: null }],
  is_available: true,
};

function UserForm({
  editing,
  roles,
  departments,
  tree,
  onClose,
  onSaved,
}: {
  editing: StaffUser | null;
  roles: RoleDetail[];
  departments: Department[];
  tree: LocationNode[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const assignable = roles.filter((r) => r.assignable);
  const [form, setForm] = useState<FormState>(() =>
    editing
      ? {
          name: editing.name,
          email: editing.email,
          mobile: editing.mobile ?? "",
          role_id: editing.role.id,
          password: "",
          reports_to_id: editing.reports_to?.id ?? null,
          scopes: editing.scopes.map((s) => ({
            department_id: s.department?.id ?? null,
            location_id: s.location?.id ?? null,
          })),
          is_available: editing.is_available,
        }
      : { ...EMPTY_FORM, role_id: assignable[assignable.length - 1]?.id ?? null },
  );
  const [managers, setManagers] = useState<{ id: number; name: string; role: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (form.role_id === null) return;
    api.users.reportsToOptions(form.role_id).then(setManagers).catch(() => setManagers([]));
  }, [form.role_id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.role_id === null) {
      setError("Choose a role.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.users.update(editing.id, {
          name: form.name,
          email: form.email,
          mobile: form.mobile,
          role_id: form.role_id,
          ...(form.reports_to_id === null ? { clear_reports_to: true } : { reports_to_id: form.reports_to_id }),
          scopes: form.scopes,
          is_available: form.is_available,
        });
        onSaved(`${form.name} updated.`);
      } else {
        await api.users.create({
          name: form.name,
          email: form.email,
          mobile: form.mobile || undefined,
          role_id: form.role_id,
          password: form.password,
          reports_to_id: form.reports_to_id,
          scopes: form.scopes,
        });
        onSaved(`${form.name} created.`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `Edit ${editing.name}` : "Add Staff User"}
      description="Users can only be given a role below yours, and scopes inside your own."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-3">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full Name">
            <input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Official Email">
            <input
              required
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Mobile (optional)">
            <input className={inputClass} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          </Field>
          <Field label="Role">
            <select
              required
              className={inputClass}
              value={form.role_id ?? ""}
              onChange={(e) => setForm({ ...form, role_id: Number(e.target.value), reports_to_id: null })}
            >
              {assignable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          {!editing && (
            <Field label="Initial Password" hint="At least 8 characters. Share it with the user securely.">
              <input
                required
                minLength={8}
                className={inputClass}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
          )}
          <Field label="Reports To" hint="Used for escalation. Must hold a role above this one.">
            <select
              className={inputClass}
              value={form.reports_to_id ?? ""}
              onChange={(e) => setForm({ ...form, reports_to_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">{editing || managers.length === 0 ? "Nobody" : "Default (you, if directly above)"}</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.role}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {editing && (
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={form.is_available}
              onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
            />
            Available for new complaints (untick while on leave; automatic routing skips them)
          </label>
        )}
        <div>
          <p className="text-xs text-slate-600 font-medium mb-1">Scopes (department × location this user covers)</p>
          <ScopeEditor
            scopes={form.scopes}
            onChange={(scopes) => setForm({ ...form, scopes })}
            departments={departments}
            tree={tree}
          />
        </div>
        <div className="pt-2 flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButtonClass} disabled={saving}>
            {saving ? "Saving..." : editing ? "Save Changes" : "Create User"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UsersList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useSession();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  // "Add Staff User" quick action links here with ?new=1
  const [creating, setCreating] = useState(() => searchParams.get("new") === "1" && can("user.create"));
  const debouncedSearch = useDebounced(search.trim());

  const { data: users = [], error: loadError, loading, reload } = useApiData(
    () => api.users.list({ search: debouncedSearch || undefined, role_id: roleFilter ?? undefined }),
    [debouncedSearch, roleFilter],
  );
  const canViewRoles = can("role.view");
  const canEdit = can("user.create") || can("user.update");
  const { data: roles = [] } = useApiData<RoleDetail[]>(
    () => (canViewRoles ? api.roles.list() : Promise.resolve([])),
    [canViewRoles],
  );
  const { data: reference } = useApiData<{ departments: Department[]; tree: LocationNode[] }>(
    async () => {
      if (!canEdit) return { departments: [], tree: [] };
      const [departments, tree] = await Promise.all([api.departments.list(), api.locations.tree()]);
      return { departments: departments.filter((d) => d.is_active), tree };
    },
    [canEdit],
  );
  const error = actionError ?? loadError;

  useEffect(() => {
    if (searchParams.get("new")) router.replace("/users");
  }, [searchParams, router]);

  const toggleActive = async (user: StaffUser) => {
    const verb = user.is_active ? "Deactivate" : "Reactivate";
    if (!confirm(`${verb} ${user.name}?${user.is_active ? " They will be signed out immediately." : ""}`)) return;
    try {
      await api.users.setActive(user.id, !user.is_active);
      setNotice(`${user.name} ${user.is_active ? "deactivated" : "reactivated"}.`);
      setActionError(null);
      reload();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title="Staff Users"
        description="Officers below you in the role hierarchy whose scope sits inside yours."
        actions={
          can("user.create") && (
            <button className={primaryButtonClass} onClick={() => setCreating(true)}>
              <UserPlus className="w-3.5 h-3.5" /> Add Staff User
            </button>
          )
        }
      />
      <div className="flex flex-wrap gap-3">
        <input
          className={`${inputClass} max-w-xs`}
          placeholder="Search name, email or mobile"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {roles.length > 0 && (
          <select
            className={`${inputClass} max-w-[200px]`}
            value={roleFilter ?? ""}
            onChange={(e) => setRoleFilter(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">All roles</option>
            {roles
              .filter((r) => r.assignable)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        )}
      </div>
      <ErrorBanner message={error} />
      {notice && <p className="text-xs text-emerald-700">{notice}</p>}

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400 uppercase text-[11px] tracking-wider">
              <th className="px-5 py-3 font-semibold">User</th>
              <th className="px-3 py-3 font-semibold">Role</th>
              <th className="px-3 py-3 font-semibold">Scope</th>
              <th className="px-3 py-3 font-semibold">Reports To</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Last Login</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  No staff users under you yet.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/70 align-top">
                  <td className="px-5 py-3">
                    <div className="font-bold text-slate-800">{u.name}</div>
                    <div className="text-[11px] text-slate-400">{u.email}</div>
                    {u.mobile && <div className="text-[11px] text-slate-400">{u.mobile}</div>}
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded text-[10px]">
                      {u.role.name}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {u.scopes.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      u.scopes.map((s, i) => <div key={i}>{scopeLabel(s)}</div>)
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{u.reports_to?.name ?? "—"}</td>
                  <td className="px-3 py-3">
                    <StatusPill active={u.is_active} />
                    {u.is_active && !u.is_available && (
                      <span className="ml-1 inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                        On leave
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(u.last_login_at)}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      {can("user.update") && u.can_manage && (
                        <button
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                          title="Edit"
                          onClick={() => setEditing(u)}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {can("user.deactivate") && u.can_manage && (
                        <button
                          className={`p-1.5 rounded-lg cursor-pointer ${
                            u.is_active
                              ? "text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                          }`}
                          title={u.is_active ? "Deactivate" : "Reactivate"}
                          onClick={() => toggleActive(u)}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {(creating || editing) && (
        <UserForm
          editing={editing}
          roles={roles}
          departments={reference?.departments ?? []}
          tree={reference?.tree ?? []}
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
    </>
  );
}

export default function UsersPage() {
  return (
    <RequirePermission anyOf={["user.view"]}>
      <Suspense>
        <UsersList />
      </Suspense>
    </RequirePermission>
  );
}
