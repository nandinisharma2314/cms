"use client";

import React, { useMemo, useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { api, PermissionDef, RoleDetail } from "@/lib/api";
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
  secondaryButtonClass,
  tabClass,
} from "@/components/ui";

function groupPermissions(permissions: PermissionDef[]): [string, PermissionDef[]][] {
  const groups = new Map<string, PermissionDef[]>();
  for (const p of permissions) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
  return Array.from(groups.entries());
}

function NewRoleDialog({
  roles,
  onClose,
  onCreated,
}: {
  roles: RoleDetail[];
  onClose: () => void;
  onCreated: (role: RoleDetail) => void;
}) {
  const { me, can } = useSession();
  const { limits } = useConfig();
  const parents = roles.filter((r) => r.id === me.role.id || r.assignable);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<number>(parents[parents.length - 1]?.id ?? me.role.id);
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const { busy, error, run } = useAction();

  return (
    <Modal
      title="New role"
      description="The new role sits under its parent. Anyone above it can create and manage its users."
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            // Only permissions you hold can be granted, so copying skips the rest.
            const source = roles.find((r) => r.id === copyFrom);
            const permissions = source ? source.permissions.filter((p) => can(p)) : [];
            onCreated(
              await api.roles.create({ key, name, description: description.trim() || null, parent_id: parentId, permissions }),
            );
          });
        }}
      >
        <ErrorBanner message={error} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input
              required
              maxLength={limits.role_name}
              className={inputClass}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                // A suggestion for the key (lowercase letters, digits and _, starting with a letter).
                setKey(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "_")
                    .replace(/^[^a-z]+/, "")
                    .slice(0, limits.role_key)
                    .replace(/_+$/, ""),
                );
              }}
            />
          </Field>
          <Field label="Key" hint="Stable identifier; cannot change later">
            <input
              required
              maxLength={limits.role_key}
              className={inputClass}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Description">
          <input
            maxLength={limits.role_description}
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Reports to (parent role)">
          <select className={inputClass} value={parentId} onChange={(e) => setParentId(Number(e.target.value))}>
            {parents.map((r) => (
              <option key={r.id} value={r.id}>
                {"— ".repeat(r.depth)}
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start with the permissions of" hint="Optional; you can change them after creating the role.">
          <select
            className={inputClass}
            value={copyFrom ?? ""}
            onChange={(e) => setCopyFrom(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">No permissions</option>
            {roles
              .filter((r) => !r.is_root && r.audience === "staff")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? "Creating…" : "Create role"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RoleDetailPanel({
  role,
  roles,
  permissions,
  onSaved,
  onDeleted,
}: {
  role: RoleDetail;
  roles: RoleDetail[];
  permissions: PermissionDef[];
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { me, can } = useSession();
  const { limits } = useConfig();
  const [draft, setDraft] = useState<Set<string>>(() => new Set(role.permissions));
  const [draftParent, setDraftParent] = useState<number | null>(role.parent_id);
  const [draftName, setDraftName] = useState(role.name);
  const [draftDescription, setDraftDescription] = useState(role.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The End User role only takes portal permissions; staff roles never do.
  const endUserRole = role.audience === "end_user";
  const grouped = useMemo(
    () => groupPermissions(permissions.filter((p) => p.audience === role.audience)),
    [permissions, role.audience],
  );
  const parentOptions = roles.filter((r) => r.id !== role.id && (r.id === me.role.id || r.assignable));
  const nameChanged = draftName.trim() !== role.name;
  const descriptionChanged = draftDescription.trim() !== (role.description ?? "");
  const dirty =
    nameChanged ||
    descriptionChanged ||
    draftParent !== role.parent_id ||
    draft.size !== role.permissions.length ||
    role.permissions.some((p) => !draft.has(p));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.roles.update(role.id, {
        permissions: Array.from(draft),
        ...(nameChanged ? { name: draftName } : {}),
        ...(descriptionChanged ? { description: draftDescription } : {}),
        ...(draftParent !== null && draftParent !== role.parent_id ? { parent_id: draftParent } : {}),
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete the ${role.name} role?`)) return;
    try {
      await api.roles.remove(role.id);
      onDeleted();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" /> {role.name}
            <span className="font-mono text-[10px] text-slate-400">{role.key}</span>
          </h2>
          {role.description && <p className="text-xs text-slate-500 mt-1">{role.description}</p>}
          {endUserRole && (
            <p className="text-[11px] text-slate-400 mt-1">
              Every end user holds this role. It sits outside the staff hierarchy and can&apos;t be given to staff.
            </p>
          )}
          {!role.editable && (
            <p className="text-[11px] text-amber-600 mt-1">
              {role.is_root
                ? "The Super Admin always holds every permission."
                : can("role.manage")
                  ? "Read only: you can only edit roles below your own."
                  : "Read only: your role can view roles but not change them."}
            </p>
          )}
        </div>
        {role.editable && !role.is_system && (
          <button
            className={`${iconButtonClass} hover:text-rose-600 hover:bg-rose-50`}
            title="Delete role"
            aria-label={`Delete the ${role.name} role`}
            onClick={remove}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {role.editable && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name">
            <input
              required
              maxLength={limits.role_name}
              className={inputClass}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
          </Field>
          <Field label="Description">
            <input
              maxLength={limits.role_description}
              className={inputClass}
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
            />
          </Field>
        </div>
      )}

      {role.editable && !endUserRole && (
        <Field label="Parent role" hint="Move a role to insert or remove a level in the hierarchy.">
          <select
            className={`${inputClass} max-w-xs`}
            value={draftParent ?? ""}
            onChange={(e) => setDraftParent(Number(e.target.value))}
          >
            {parentOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {"— ".repeat(r.depth)}
                {r.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {grouped.map(([group, list]) => (
          <div key={group} className="p-3 rounded-xl border border-slate-100 bg-slate-50/50">
            <p className="text-[11px] font-bold text-slate-700 mb-2">{group}</p>
            <div className="space-y-1.5">
              {list.map((p) => {
                // Only permissions you hold yourself can be granted. Staff never hold
                // portal permissions, so anyone who manages roles may grant those.
                const grantable = role.editable && (endUserRole || can(p.key));
                return (
                  <label key={p.key} className={`flex items-start gap-2 text-xs ${grantable ? "cursor-pointer" : "opacity-60"}`}>
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      disabled={!grantable}
                      checked={draft.has(p.key)}
                      onChange={(e) => {
                        const next = new Set(draft);
                        if (e.target.checked) next.add(p.key);
                        else next.delete(p.key);
                        setDraft(next);
                      }}
                    />
                    <span>
                      <span className="font-mono text-[11px] text-slate-800">{p.key}</span>
                      <span className="block text-[11px] text-slate-500">{p.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {role.editable && (
        <div className="flex justify-end">
          <button className={primaryButtonClass} disabled={!dirty || saving || !draftName.trim()} onClick={save}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </>
  );
}

/** Every role against every permission, read-only; edit a role to change it. */
function PermissionMatrix({ roles, permissions }: { roles: RoleDetail[]; permissions: PermissionDef[] }) {
  const grouped = groupPermissions(permissions);
  return (
    <Card className="relative overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="sticky left-0 bg-white px-4 py-3 text-left font-semibold text-slate-400 uppercase text-[11px]">
              Permission
            </th>
            {roles.map((r) => (
              <th key={r.id} className="px-3 py-3 font-semibold text-slate-700 whitespace-nowrap">
                {r.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grouped.map(([group, list]) => (
            <React.Fragment key={group}>
              <tr className="bg-slate-50">
                <td colSpan={roles.length + 1} className="sticky left-0 px-4 py-1.5 text-[11px] font-bold text-slate-600">
                  {group}
                </td>
              </tr>
              {list.map((p) => (
                <tr key={p.key} className="border-b border-slate-50">
                  <td className="sticky left-0 bg-white px-4 py-1.5" title={p.description}>
                    <span className="font-mono text-[11px] text-slate-800">{p.key}</span>
                  </td>
                  {roles.map((r) => (
                    <td key={r.id} className="px-3 py-1.5 text-center">
                      {r.permissions.includes(p.key) ? (
                        <span className="text-emerald-600 font-bold" aria-label="granted">
                          ✓
                        </span>
                      ) : (
                        <span className="text-slate-200" aria-label="not granted">
                          ·
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function RolesEditor() {
  useDocumentTitle("Roles & permissions");
  const { can, me } = useSession();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<"edit" | "matrix">("edit");
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, error, reload } = useApiData(async () => {
    const [roles, permissions] = await Promise.all([api.roles.list(), api.roles.permissions()]);
    return { roles, permissions };
  }, []);

  const rawRoles = data?.roles ?? [];
  const visibleStaffRoles = me.is_super_admin
    ? rawRoles.filter((r) => r.audience === "staff")
    : rawRoles.filter((r) => r.audience === "staff" && (r.id === me.role.id || r.assignable));

  const minDepth = visibleStaffRoles.length > 0 ? Math.min(...visibleStaffRoles.map((r) => r.depth)) : 0;
  const staffRoles = visibleStaffRoles.map((r) => ({ ...r, depth: r.depth - minDepth }));

  const endUserRoles = rawRoles.filter((r) => r.audience === "end_user");
  const roles = [...staffRoles, ...endUserRoles];

  const selected = roles.find((r) => r.id === selectedId) ?? staffRoles.find((r) => r.editable) ?? roles[0] ?? null;

  const select = (id: number | null) => {
    setSelectedId(id);
    setNotice(null);
  };

  const renderRole = (r: RoleDetail, unit: string) => (
    <button
      key={r.id}
      onClick={() => select(r.id)}
      className={`w-full flex items-center justify-between py-2 pr-3 rounded-lg text-left text-xs cursor-pointer ${
        r.id === selected?.id ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-700"
      }`}
      style={{ paddingLeft: 12 + r.depth * 16 }}
    >
      <span className="font-semibold">
        {r.depth > 0 && <span className="text-slate-300 mr-1">└</span>}
        {r.name}
      </span>
      <span className="text-[10px] text-slate-400">
        {r.user_count} {unit}
      </span>
    </button>
  );

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="Permissions say what a role can do; each user's department/location scopes say where."
        actions={
          can("role.manage") && (
            <button className={primaryButtonClass} onClick={() => setCreating(true)}>
              <Plus className="w-3.5 h-3.5" /> New role
            </button>
          )
        }
      />
      <ErrorBanner message={error} />
      <Notice message={notice} />
      <div className="flex gap-2">
        {(["edit", "matrix"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={tabClass(mode === m)}>
            {m === "edit" ? "Hierarchy & editing" : "Permission matrix"}
          </button>
        ))}
      </div>
      {mode === "matrix" && data && (
        <>
          <PermissionMatrix roles={staffRoles} permissions={data.permissions.filter((p) => p.audience === "staff")} />
          <PermissionMatrix roles={endUserRoles} permissions={data.permissions.filter((p) => p.audience === "end_user")} />
        </>
      )}
      <div className={`grid grid-cols-1 lg:grid-cols-12 gap-5 ${mode === "matrix" ? "hidden" : ""}`}>
        <Card className="lg:col-span-4 p-3 self-start">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Hierarchy</p>
          {staffRoles.map((r) => renderRole(r, "users"))}
          {endUserRoles.length > 0 && (
            <>
              <p className="px-2 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">End user portal</p>
              {endUserRoles.map((r) => renderRole(r, "end users"))}
            </>
          )}
        </Card>

        <Card className="lg:col-span-8 p-5 space-y-4">
          {!data ? (
            <p className="text-xs text-slate-400">{error ? "The roles could not be loaded." : "Loading…"}</p>
          ) : !selected ? (
            <p className="text-xs text-slate-400">Select a role.</p>
          ) : (
            <RoleDetailPanel
              // remount (resetting the draft) when the saved role changes
              key={JSON.stringify([selected.id, selected.name, selected.description, selected.parent_id, selected.permissions])}
              role={selected}
              roles={roles}
              permissions={data.permissions}
              onSaved={() => {
                setNotice(`${selected.name} saved. Users with this role get the change on their next request.`);
                reload();
              }}
              onDeleted={() => {
                select(null);
                reload();
              }}
            />
          )}
        </Card>
      </div>

      {creating && (
        <NewRoleDialog
          roles={roles}
          onClose={() => setCreating(false)}
          onCreated={(role) => {
            setCreating(false);
            select(role.id);
            reload();
          }}
        />
      )}
    </>
  );
}

export default function RolesPage() {
  return (
    <RequirePermission anyOf={["role.view"]}>
      <RolesEditor />
    </RequirePermission>
  );
}
