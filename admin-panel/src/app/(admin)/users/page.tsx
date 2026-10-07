"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil, Power, Shield, UserPlus } from "lucide-react";
import Link from "next/link";
import { EndUsersList } from "./EndUsersList";
import {
  api,
  CustomPermissionInput,
  Department,
  LocationNode,
  PermissionDef,
  RoleDetail,
  RoleRef,
  ScopeInput,
  StaffUser,
  Me,
  UserScope,
} from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { useApiData, useDebounced } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { passwordHint, passwordProblems } from "@/components/ChangePasswordForm";
import { RequirePermission } from "@/components/RequirePermission";
import { validateName, validatePhone } from "@/lib/validate";
import { ScopeEditor, scopeLabel } from "@/components/ScopeEditor";
import { LocationPicker } from "@/components/LocationPicker";
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
  primary_department_id: number | null;
  primary_location_id: number | null;
  scopes: ScopeInput[];
  is_available: boolean;
  custom_permissions: Record<string, boolean>; // key -> boolean (true=granted, false=revoked)
}

function toForm(user: StaffUser): FormState {
  const customPerms: Record<string, boolean> = {};
  user.custom_permissions?.forEach((cp) => {
    customPerms[cp.key] = cp.is_granted;
  });
  return {
    name: user.name,
    email: user.email,
    mobile: user.mobile ?? "",
    role_id: user.role.id,
    password: "",
    reports_to_id: user.reports_to?.id ?? null,
    primary_department_id: user.primary_department?.id ?? null,
    primary_location_id: user.primary_location?.id ?? null,
    scopes: user.scopes.map((s) => ({ department_id: s.department?.id ?? null, location_id: s.location?.id ?? null })),
    is_available: user.is_available,
    custom_permissions: customPerms,
  };
}

const sameScopes = (a: ScopeInput[], b: ScopeInput[]) => JSON.stringify(a) === JSON.stringify(b);

function UserForm({
  me,
  editing,
  roles,
  departments,
  onClose,
  onSaved,
}: {
  me: Me;
  editing: StaffUser | null;
  roles: RoleRef[];
  departments: Department[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { password: rules, phone, limits } = useConfig();
  const initial = useMemo<FormState>(
    () =>
      editing
        ? toForm(editing)
        : {
            name: "",
            email: "",
            mobile: "",
            role_id: null,
            password: "",
            reports_to_id: null,
            primary_department_id: null,
            primary_location_id: null,
            scopes: [],
            is_available: true,
            custom_permissions: {},
          },
    [editing],
  );
  const [form, setForm] = useState<FormState>(initial);
  const [managers, setManagers] = useState<{ id: number; name: string; role: string }[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionDef[]>([]);
  const [rolesDetails, setRolesDetails] = useState<RoleDetail[]>([]);
  const [showPermissions, setShowPermissions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const problems = !editing && form.password ? passwordProblems(form.password, rules) : [];


  const assignableDepartments = useMemo(() => {
    if (me.is_super_admin) return departments;
    return departments.filter(d => me.scopes.some(s => s.department === null || s.department.id === d.id));
  }, [departments, me]);

  useEffect(() => {
    Promise.all([api.roles.permissions(), api.roles.list()]).then(
      ([perms, rDetails]) => {
        setAllPermissions(perms.filter((p) => p.audience === "staff"));
        setRolesDetails(rDetails);
      },
      () => undefined,
    );
  }, []);

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

  const selectedRole = useMemo(() => rolesDetails.find((r) => r.id === form.role_id), [rolesDetails, form.role_id]);
  const roleDefaultKeys = useMemo(() => new Set(selectedRole?.permissions || []), [selectedRole]);

  // Group all permissions
  const permissionsByGroup = useMemo(() => {
    const groups: Record<string, PermissionDef[]> = {};
    for (const p of allPermissions) {
      if (!groups[p.group]) groups[p.group] = [];
      groups[p.group].push(p);
    }
    return groups;
  }, [allPermissions]);

  const togglePermission = (key: string) => {
    const isCurrentlyGranted = form.custom_permissions[key] !== undefined ? form.custom_permissions[key] : roleDefaultKeys.has(key);
    setForm({
      ...form,
      custom_permissions: {
        ...form.custom_permissions,
        [key]: !isCurrentlyGranted,
      },
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nErr = validateName(form.name);
    const mErr = form.mobile.trim() ? validatePhone(form.mobile) : null;
    setNameError(nErr);
    setMobileError(mErr);
    if (nErr || mErr) return;
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

    // Calculate explicit permission overrides
    const customPermsInput: CustomPermissionInput[] = [];
    Object.entries(form.custom_permissions).forEach(([key, isGranted]) => {
      const inRole = roleDefaultKeys.has(key);
      if ((isGranted && !inRole) || (!isGranted && inRole)) {
        customPermsInput.push({ permission_key: key, is_granted: isGranted });
      }
    });

    try {
      if (editing) {
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
        if (form.primary_department_id !== initial.primary_department_id) {
          if (form.primary_department_id === null) changes.clear_primary_department = true;
          else changes.primary_department_id = form.primary_department_id;
        }
        if (form.primary_location_id !== initial.primary_location_id) {
          if (form.primary_location_id === null) changes.clear_primary_location = true;
          else changes.primary_location_id = form.primary_location_id;
        }
        if (JSON.stringify(form.custom_permissions) !== JSON.stringify(initial.custom_permissions)) {
          changes.custom_permissions = customPermsInput;
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
          primary_department_id: form.primary_department_id,
          primary_location_id: form.primary_location_id,
          scopes: form.scopes,
          custom_permissions: customPermsInput,
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
      description="Assign their role, permissions, working workplace (department & location), and reporting superior."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full name" error={nameError}>
            <input
              required
              maxLength={limits.staff_name}
              className={nameError ? `${inputClass} !border-red-400` : inputClass}
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                setNameError(validateName(e.target.value));
              }}
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
            error={mobileError}
            hint={phone.number_length
              ? `${phone.number_length} digits${phone.country_code ? `, optionally with ${phone.country_code}` : ""}`
              : undefined}
          >
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              className={mobileError ? `${inputClass} !border-red-400` : inputClass}
              value={form.mobile}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                setForm({ ...form, mobile: val });
                setMobileError(val ? validatePhone(val) : null);
              }}
            />
          </Field>
          <Field label="Role">
            <select
              required
              className={inputClass}
              value={form.role_id ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  role_id: e.target.value ? Number(e.target.value) : null,
                  reports_to_id: null,
                  custom_permissions: {},
                })
              }
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

          <Field label="Reports to (Superior)" hint="Direct manager/supervisor who oversees this staff member.">
            <select
              className={inputClass}
              value={form.reports_to_id ?? ""}
              disabled={form.role_id === null}
              onChange={(e) => setForm({ ...form, reports_to_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Nobody (Top Level)</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Primary Workplace Assignment */}
        <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-600" />
            <h4 className="text-xs font-semibold text-slate-800">Primary Workplace (Where they will work)</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Primary Department" hint="Primary unit where staff handles tickets">
              <select
                className={inputClass}
                value={form.primary_department_id ?? ""}
                onChange={(e) =>
                  setForm({ ...form, primary_department_id: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="" disabled={!me.is_super_admin && !me.scopes.some(s => s.department === null)}>None / Floating across all</option>
                {assignableDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Primary Location / Office" hint="Assigned base workplace/site">
              <LocationPicker
                value={form.primary_location_id}
                onChange={(id: number | null) => setForm({ ...form, primary_location_id: id })}
                allowAny={me.is_super_admin || me.scopes.some(s => s.location === null)}
                anyLabel="None / Global across all locations"
                isSelectable={(node) => {
                  if (me.is_super_admin) return true;
                  if (!node) return me.scopes.some(s => s.location === null);
                  return me.scopes.some(s => s.location === null || node.path_ids.includes(s.location.id));
                }}
              />
            </Field>
          </div>
        </div>

        {/* Role Permissions Preview & Custom Overrides */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
          <button
            type="button"
            className="w-full flex items-center justify-between text-left text-xs font-semibold text-slate-800 focus:outline-none"
            onClick={() => setShowPermissions(!showPermissions)}
          >
            <span className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-sky-600" />
              Role Permissions & Custom Overrides
              {form.role_id && (
                <span className="text-[11px] font-normal text-slate-500">
                  ({Object.keys(form.custom_permissions).length} custom override{Object.keys(form.custom_permissions).length === 1 ? "" : "s"})
                </span>
              )}
            </span>
            {showPermissions ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {showPermissions && (
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <p className="text-[11px] text-slate-500">
                Permissions granted by the chosen role are checked by default. You can check additional permissions or uncheck role defaults to customize access for this specific user.
              </p>
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {Object.entries(permissionsByGroup).map(([group, perms]) => (
                  <div key={group} className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-700 bg-slate-50 px-2 py-1 rounded">
                      {group}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-2">
                      {perms.map((p) => {
                        const inRole = roleDefaultKeys.has(p.key);
                        const isGranted = form.custom_permissions[p.key] !== undefined ? form.custom_permissions[p.key] : inRole;
                        const isOverride = (isGranted && !inRole) || (!isGranted && inRole);

                        return (
                          <label key={p.key} className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isGranted}
                              onChange={() => togglePermission(p.key)}
                              className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium text-slate-800">{p.description}</span>
                                {isOverride ? (
                                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${isGranted ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                                    {isGranted ? "+Custom Grant" : "-Revoked"}
                                  </span>
                                ) : inRole ? (
                                  <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                    Role Default
                                  </span>
                                ) : null}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">{p.key}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
          <p className="text-xs text-slate-600 font-medium mb-1">Additional Coverage Scopes (Optional)</p>
          <p className="text-[11px] text-slate-400 mb-2">
            Leave blank to use the primary department and location configured above.
          </p>
          <ScopeEditor
            scopes={form.scopes}
            onChange={(scopes) => setForm({ ...form, scopes })}
            departments={assignableDepartments}
            allowAllDepartments={me.is_super_admin || me.scopes.some((s) => s.department === null)}
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
  const { me, can } = useSession();
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
  } | null>(async () => {
    if (!canEdit) return null;
    const departments = await api.departments.list();
    return { departments };
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
    <div className="flex flex-col h-full">
      <div className="shrink-0">
        <PageHeader
          title="Staff users"
          description="People below you in the role hierarchy whose scope sits inside yours."
        />
      </div>
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 mt-2 sm:mt-7 w-full">
        <input
          type="search"
          className={`${inputClass} flex-[2] min-w-0 sm:max-w-xs !px-1.5 sm:!px-3 !text-[10px] sm:!text-sm`}
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
            className={`${inputClass} flex-1 min-w-0 sm:flex-none sm:w-auto sm:max-w-50 !px-1 sm:!px-3 !text-[10px] sm:!text-sm`}
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
        {can("user.create") && (
          <button className={`${primaryButtonClass} shrink-0 ml-auto !px-2.5 sm:!px-4 h-10`} onClick={() => setCreating(true)}>
            <UserPlus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Add staff user</span>
          </button>
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
              <th className="px-3 py-3 font-semibold">Workplace</th>
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
              <TableMessage colSpan={8}>Loading…</TableMessage>
            ) : !data ? (
              <TableMessage colSpan={8}>The list could not be loaded (see the message above).</TableMessage>
            ) : data.items.length === 0 ? (
              <TableMessage colSpan={8}>{term || roleFilter ? "Nobody matches." : "No staff users under you yet."}</TableMessage>
            ) : (
              data.items.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/70 align-top">
                  <td className="px-5 py-3">
                    <Link href={`/users/staff/${u.id}`} className="font-bold text-sky-700 hover:underline">
                      {u.name}
                    </Link>
                    <div className="text-[11px] text-slate-400">{u.email}</div>
                    {u.mobile && <div className="text-[11px] text-slate-400">{u.mobile}</div>}
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded text-[10px]">
                      {u.role.name}
                    </span>
                    {u.custom_permissions && u.custom_permissions.length > 0 && (
                      <div className="mt-1">
                        <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          {u.custom_permissions.length} Custom Perms
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {u.primary_department || u.primary_location ? (
                      <div>
                        {u.primary_department && <div className="font-medium text-slate-800">{u.primary_department.name}</div>}
                        {u.primary_location && (
                          <div className="text-[11px] text-slate-500">
                            {u.primary_location.label || u.primary_location.name}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
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
          me={me}
          editing={editing}
          roles={roles}
          departments={reference.departments}
          
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
  const [activeTab, setActiveTab] = useState<"staff" | "end-users">("staff");

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] -mt-5 sm:-mt-2">
      <div className="flex gap-4 border-b border-slate-200 mb-4 px-2">
        <button
          className={`py-2 px-1 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "staff"
              ? "border-sky-500 text-sky-700"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          }`}
          onClick={() => setActiveTab("staff")}
        >
          Staff Users
        </button>
        <button
          className={`py-2 px-1 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "end-users"
              ? "border-sky-500 text-sky-700"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          }`}
          onClick={() => setActiveTab("end-users")}
        >
          End Users
        </button>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {activeTab === "staff" ? (
          <RequirePermission anyOf={["user.view"]}>
            <Suspense>
              <UsersList />
            </Suspense>
          </RequirePermission>
        ) : (
          <RequirePermission anyOf={["end_user.view"]}>
            <Suspense>
              <EndUsersList />
            </Suspense>
          </RequirePermission>
        )}
      </div>
    </div>
  );
}
