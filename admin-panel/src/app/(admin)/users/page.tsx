"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Power, UserPlus } from "lucide-react";
import { api, Department, LocationNode, RoleRef, ScopeInput, StaffUser } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { useApiData, useDebounced } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { passwordHint, passwordProblems } from "@/components/ChangePasswordForm";
import { RequirePermission } from "@/components/RequirePermission";
import { ScopeEditor, scopeLabel } from "@/components/ScopeEditor";
import {
  Card,
  ErrorBanner,
  Field,
  iconButtonClass,
  inputClass,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  primaryButtonClass,
  secondaryButtonClass,
  StatusPill,
  TableMessage,
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

function toForm(user: StaffUser): FormState {
  return {
    name: user.name,
    email: user.email,
    mobile: user.mobile ?? "",
    role_id: user.role.id,
    password: "",
    reports_to_id: user.reports_to?.id ?? null,
    scopes: user.scopes.map((s) => ({ department_id: s.department?.id ?? null, location_id: s.location?.id ?? null })),
    is_available: user.is_available,
  };
}

const sameScopes = (a: ScopeInput[], b: ScopeInput[]) => JSON.stringify(a) === JSON.stringify(b);

function UserForm({
  editing,
  roles,
  departments,
  tree,
  onClose,
  onSaved,
}: {
  editing: StaffUser | null;
  roles: RoleRef[];
  departments: Department[];
  tree: LocationNode[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { password: rules, phone, limits } = useConfig();
  const initial = useMemo<FormState>(
    () =>
      editing
        ? toForm(editing)
        : { name: "", email: "", mobile: "", role_id: null, password: "", reports_to_id: null, scopes: [], is_available: true },
    [editing],
  );
  const [form, setForm] = useState<FormState>(initial);
  const [managers, setManagers] = useState<{ id: number; name: string; role: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const problems = !editing && form.password ? passwordProblems(form.password, rules) : [];

  useEffect(() => {
    if (form.role_id === null) return;
    let active = true;
    api.users.reportsToOptions(form.role_id).then(
      (list) => active && setManagers(list),
      (err: Error) => active && setError(err.message),
    );
    return () => {
      active = false;
    };
  }, [form.role_id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.role_id === null) {
      setError("Choose a role.");
      return;
    }
    if (problems.length) {
      setError(`The password needs ${problems.join(", ")}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        // Send only what changed, so a stale form can't overwrite someone else's edit of another field.
        const changes: Parameters<typeof api.users.update>[1] = {};
        if (form.name !== initial.name) changes.name = form.name;
        if (form.email !== initial.email) changes.email = form.email;
        if (form.mobile.trim() !== initial.mobile) {
          if (form.mobile.trim()) changes.mobile = form.mobile;
          else changes.clear_mobile = true;
        }
        if (form.role_id !== initial.role_id) changes.role_id = form.role_id;
        if (form.reports_to_id !== initial.reports_to_id) {
          if (form.reports_to_id === null) changes.clear_reports_to = true;
          else changes.reports_to_id = form.reports_to_id;
        }
        if (!sameScopes(form.scopes, initial.scopes)) changes.scopes = form.scopes;
        if (form.is_available !== initial.is_available) changes.is_available = form.is_available;
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        await api.users.update(editing.id, changes);
        onSaved(`${form.name} updated.`);
      } else {
        await api.users.create({
          name: form.name,
          email: form.email,
          mobile: form.mobile.trim() || null,
          role_id: form.role_id,
          password: form.password,
          reports_to_id: form.reports_to_id,
          scopes: form.scopes,
        });
        onSaved(`${form.name} created. They must choose their own password when they first sign in.`);
      }
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `Edit ${editing.name}` : "Add a staff user"}
      description="You can give a role below yours, and scopes inside your own."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-3">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full name">
            <input
              required
              maxLength={limits.staff_name}
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              maxLength={limits.email}
              className={inputClass}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field
            label="Mobile (optional)"
            hint={
              phone.number_length
                ? `${phone.number_length} digits${phone.country_code ? `, optionally with ${phone.country_code}` : ""}`
                : undefined
            }
          >
            <input
              type="tel"
              className={inputClass}
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <select
              required
              className={inputClass}
              value={form.role_id ?? ""}
              onChange={(e) => setForm({ ...form, role_id: e.target.value ? Number(e.target.value) : null, reports_to_id: null })}
            >
              <option value="">Choose…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          {!editing && (
            <Field
              label="Initial password"
              hint={
                problems.length
                  ? `Still needs ${problems.join(", ")}.`
                  : `${passwordHint(rules)} They replace it at first sign-in.`
              }
            >
              <input
                required
                autoComplete="new-password"
                className={inputClass}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                aria-invalid={problems.length > 0}
              />
            </Field>
          )}
          <Field label="Reports to" hint="Missed targets escalate along this line.">
            <select
              className={inputClass}
              value={form.reports_to_id ?? ""}
              disabled={form.role_id === null}
              onChange={(e) => setForm({ ...form, reports_to_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Nobody</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role})
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
            Available for new complaints (automatic routing skips them while this is off)
          </label>
        )}
        <div>
          <p className="text-xs text-slate-600 font-medium mb-1">Scopes: the departments and locations this person covers</p>
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
            {saving ? "Saving…" : editing ? "Save changes" : "Create user"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UsersList() {
  useDocumentTitle("Staff users");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useSession();
  const { ui } = useConfig();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  // The "Add staff user" quick action links here with ?new=1
  const [creating, setCreating] = useState(() => searchParams.get("new") === "1" && can("user.create"));
  const term = useDebounced(search.trim());
  const canEdit = can("user.create") || can("user.update");

  const {
    data,
    error: loadError,
    loading,
    reload,
  } = useApiData(
    () => api.users.list({ search: term || undefined, role_id: roleFilter ?? undefined, page, page_size: ui.default_page_size }),
    [term, roleFilter, page, ui.default_page_size],
  );
  const { data: roles = [] } = useApiData<RoleRef[]>(
    () => (canEdit ? api.users.assignableRoles() : Promise.resolve([])),
    [canEdit],
  );
  const { data: reference, error: referenceError } = useApiData<{
    departments: Department[];
    tree: LocationNode[];
  } | null>(async () => {
    if (!canEdit) return null;
    const [departments, tree] = await Promise.all([api.departments.list(), api.locations.tree()]);
    return { departments, tree };
  }, [canEdit]);

  useEffect(() => {
    if (searchParams.get("new")) router.replace("/users");
  }, [searchParams, router]);

  const toggleActive = async (user: StaffUser) => {
    const verb = user.is_active ? "Deactivate" : "Reactivate";
    const consequence = user.is_active ? " They are signed out at once, and their open complaints go to someone else." : "";
    if (!confirm(`${verb} ${user.name}?${consequence}`)) return;
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
    <div className="flex flex-col h-[calc(100vh-130px)] -mt-2">
      <div className="shrink-0">
        <PageHeader
          title="Staff users"
          description="People below you in the role hierarchy whose scope sits inside yours."
          actions={
            can("user.create") && (
              <button className={primaryButtonClass} onClick={() => setCreating(true)}>
                <UserPlus className="w-3.5 h-3.5" /> Add staff user
              </button>
            )
          }
        />
      </div>
      <div className="flex flex-wrap gap-3 shrink-0 mt-7">
        <input
          type="search"
          className={`${inputClass} sm:max-w-xs`}
          placeholder="Search name, email or mobile"
          aria-label="Search staff"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {roles.length > 0 && (
          <select
            className={`${inputClass} sm:max-w-50`}
            aria-label="Role"
            value={roleFilter ?? ""}
            onChange={(e) => {
              setRoleFilter(e.target.value ? Number(e.target.value) : null);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="shrink-0 mt-2">
        <ErrorBanner message={actionError ?? loadError ?? referenceError} />
        <Notice message={notice} />
      </div>

      <Card className="mt-4 overflow-x-auto overflow-y-auto flex-1 min-h-0 mb-4 relative">
        <table className="w-full min-w-215 text-left text-xs relative">
          <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <tr className="border-b border-slate-100 text-slate-400 uppercase text-[11px] tracking-wider">
              <th className="px-5 py-3 font-semibold">User</th>
              <th className="px-3 py-3 font-semibold">Role</th>
              <th className="px-3 py-3 font-semibold">Scope</th>
              <th className="px-3 py-3 font-semibold">Reports to</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Last sign-in</th>
              <th className="px-5 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <TableMessage colSpan={7}>Loading…</TableMessage>
            ) : !data ? (
              <TableMessage colSpan={7}>The list could not be loaded (see the message above).</TableMessage>
            ) : data.items.length === 0 ? (
              <TableMessage colSpan={7}>{term || roleFilter ? "Nobody matches." : "No staff users under you yet."}</TableMessage>
            ) : (
              data.items.map((u) => (
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
                      <span className="text-slate-400">Entire system</span>
                    ) : (
                      u.scopes.map((s, i) => <div key={i}>{scopeLabel(s)}</div>)
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{u.reports_to?.name ?? "—"}</td>
                  <td className="px-3 py-3 space-y-1">
                    <StatusPill active={u.is_active} />
                    {u.is_active && !u.is_available && (
                      <span className="block w-fit px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                        Unavailable
                      </span>
                    )}
                    {u.must_change_password && (
                      <span className="block w-fit px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-100">
                        Password not yet chosen
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(u.last_login_at)}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      {can("user.update") && u.can_manage && (
                        <button
                          className={iconButtonClass}
                          aria-label={`Edit ${u.name}`}
                          title="Edit"
                          onClick={() => setEditing(u)}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {can("user.deactivate") && u.can_manage && (
                        <button
                          className={`${iconButtonClass} ${u.is_active ? "hover:text-rose-600 hover:bg-rose-50" : "hover:text-emerald-600 hover:bg-emerald-50"}`}
                          aria-label={`${u.is_active ? "Deactivate" : "Reactivate"} ${u.name}`}
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
      {data && <Pagination page={page} pageSize={data.page_size} total={data.total} noun="staff users" onPage={setPage} />}

      {(creating || editing) && reference && (
        <UserForm
          editing={editing}
          roles={roles}
          departments={reference.departments}
          tree={reference.tree}
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
    </div>
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
