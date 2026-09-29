"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, Pencil, Power, UserPlus } from "lucide-react";
import { api, EndUserRow, LocationNode } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { channelNames, formatDateTime } from "@/lib/format";
import { useAction, useApiData, useDebounced } from "@/lib/hooks";
import { treeInScope } from "@/lib/scope";
import { useSession } from "@/lib/session";
import { CsvImportPanel } from "@/components/CsvImportPanel";
import { LocationPicker } from "@/components/LocationPicker";
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
  Pagination,
  primaryButtonClass,
  secondaryButtonClass,
  StatusPill,
  TableMessage,
} from "@/components/ui";

function EndUserForm({
  editing,
  tree,
  onClose,
  onSaved,
}: {
  editing: EndUserRow | null;
  tree: LocationNode[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { me } = useSession();
  const { phone, limits, otp } = useConfig();
  const signInWith = channelNames(otp.channels);
  const [externalId, setExternalId] = useState(editing?.external_id ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [mobile, setMobile] = useState(editing?.mobile ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [locationId, setLocationId] = useState<number | null>(editing?.location?.id ?? null);
  const { busy, error, run } = useAction();
  // End users are placed by location only; any department scope covers them.
  const scopedTree = useMemo(() => treeInScope(tree, me, null), [tree, me]);
  const identityChanged = editing !== null && (mobile !== editing.mobile || email !== editing.email);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (editing) {
        const changes: Parameters<typeof api.endUsers.update>[1] = {};
        if (externalId.trim() !== (editing.external_id ?? "")) changes.external_id = externalId;
        if (name !== editing.name) changes.name = name;
        if (mobile !== editing.mobile) changes.mobile = mobile;
        if (email !== editing.email) changes.email = email;
        if (locationId !== (editing.location?.id ?? null)) {
          if (locationId === null) changes.clear_location = true;
          else changes.location_id = locationId;
        }
        if (Object.keys(changes).length) await api.endUsers.update(editing.id, changes);
        onSaved(identityChanged ? `${name} updated. They were signed out and told about the change.` : `${name} updated.`);
      } else {
        await api.endUsers.create({ external_id: externalId.trim() || null, name, mobile, email, location_id: locationId });
        onSaved(`${name} added. They can now sign in to the portal with their ${signInWith}.`);
      }
    });
  };

  return (
    <Modal title={editing ? `Edit ${editing.name}` : "Add an end user"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name">
            <input
              required
              maxLength={limits.person_name}
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="User ID (optional)" hint="Your own reference, e.g. from another system">
            <input
              maxLength={limits.external_id}
              className={inputClass}
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
            />
          </Field>
          <Field
            label="Mobile"
            hint={
              phone.number_length
                ? `${phone.number_length} digits${phone.country_code ? `, optionally with ${phone.country_code}` : ""}`
                : undefined
            }
          >
            <input required type="tel" className={inputClass} value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              maxLength={limits.email}
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>
        {identityChanged && (
          <p className="text-[11px] text-amber-700">
            Mobile and email are how this person signs in. Changing them signs them out everywhere and sends them a notice.
          </p>
        )}
        <Field label="Location (optional)">
          <LocationPicker tree={scopedTree} value={locationId} onChange={setLocationId} allowAny anyLabel="No location" />
        </Field>
        <div className="pt-2 flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add end user"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EndUsersList() {
  useDocumentTitle("End users");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useSession();
  const { ui, otp } = useConfig();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<{ editing: EndUserRow | null } | null>(null);
  // The "Import end users" quick action links here with ?import=1
  const [importOpen, setImportOpen] = useState(() => searchParams.get("import") === "1" && can("end_user.import"));
  const term = useDebounced(search.trim());
  const { error: actionError, run } = useAction();
  const canEdit = can("end_user.create") || can("end_user.update");
  const needsLevels = canEdit || can("end_user.import");

  const {
    data,
    error: loadError,
    loading,
    reload,
  } = useApiData(
    () => api.endUsers.list({ search: term || undefined, page, page_size: ui.default_page_size }),
    [term, page, ui.default_page_size],
  );
  const { data: reference, error: referenceError } = useApiData(async () => {
    if (!needsLevels) return null;
    const [levels, tree] = await Promise.all([api.locations.levels(), api.locations.tree()]);
    return { levels, tree };
  }, [needsLevels]);

  useEffect(() => {
    if (searchParams.get("import")) router.replace("/end-users");
  }, [searchParams, router]);

  const toggleActive = (row: EndUserRow) => {
    const text = row.is_active
      ? `Deactivate ${row.name}? They are signed out and can no longer sign in.`
      : `Reactivate ${row.name}?`;
    if (confirm(text))
      run(async () => {
        await api.endUsers.update(row.id, { is_active: !row.is_active });
        setNotice(`${row.name} ${row.is_active ? "deactivated" : "reactivated"}.`);
        reload();
      });
  };

  return (
    <>
      <PageHeader
        title="End users"
        description={`People who sign in to the end-user portal with a one-time code sent to their ${channelNames(otp.channels)}.`}
        actions={
          <>
            <button className={secondaryButtonClass} onClick={() => run(() => api.endUsers.exportCsv(term || undefined))}>
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            {can("end_user.import") && (
              <button className={secondaryButtonClass} onClick={() => setImportOpen(true)} disabled={!reference}>
                <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
              </button>
            )}
            {can("end_user.create") && (
              <button className={primaryButtonClass} onClick={() => setForm({ editing: null })} disabled={!reference}>
                <UserPlus className="w-3.5 h-3.5" /> Add end user
              </button>
            )}
          </>
        }
      />
      <input
        type="search"
        className={`${inputClass} sm:max-w-xs`}
        placeholder="Search name, mobile, email or user ID"
        aria-label="Search end users"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      <ErrorBanner message={actionError ?? loadError ?? referenceError} />
      <Notice message={notice} />

      <Card className="relative overflow-x-auto">
        <table className="w-full min-w-215 text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400 uppercase text-[11px] tracking-wider">
              <th className="px-5 py-3 font-semibold">User ID</th>
              <th className="px-3 py-3 font-semibold">Name</th>
              <th className="px-3 py-3 font-semibold">Mobile</th>
              <th className="px-3 py-3 font-semibold">Email</th>
              <th className="px-3 py-3 font-semibold">Location</th>
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
              <TableMessage colSpan={8}>{term ? "Nobody matches." : "No end users in your scope yet."}</TableMessage>
            ) : (
              data.items.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-mono text-[11px] text-slate-500">{row.external_id ?? "—"}</td>
                  <td className="px-3 py-3 font-bold text-slate-800">{row.name}</td>
                  <td className="px-3 py-3 text-slate-600">{row.mobile}</td>
                  <td className="px-3 py-3 text-slate-600">{row.email}</td>
                  <td className="px-3 py-3 text-slate-600">{row.location?.label ?? "—"}</td>
                  <td className="px-3 py-3">
                    <StatusPill active={row.is_active} />
                  </td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(row.last_login_at)}</td>
                  <td className="px-5 py-3">
                    {can("end_user.update") && (
                      <div className="flex justify-end gap-1">
                        <button
                          className={iconButtonClass}
                          aria-label={`Edit ${row.name}`}
                          title="Edit"
                          onClick={() => setForm({ editing: row })}
                          disabled={!reference}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          className={`${iconButtonClass} hover:text-rose-600 hover:bg-rose-50`}
                          aria-label={`${row.is_active ? "Deactivate" : "Reactivate"} ${row.name}`}
                          title={row.is_active ? "Deactivate" : "Reactivate"}
                          onClick={() => toggleActive(row)}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
      {data && <Pagination page={page} pageSize={data.page_size} total={data.total} noun="end users" onPage={setPage} />}

      {form && reference && (
        <EndUserForm
          editing={form.editing}
          tree={reference.tree}
          onClose={() => setForm(null)}
          onSaved={(message) => {
            setForm(null);
            setNotice(message);
            reload();
          }}
        />
      )}
      {importOpen && reference && (
        <Modal
          title="Import end users"
          description="Rows are matched by user_id (or mobile + email) and updated; others are created. Locations must already exist."
          onClose={() => setImportOpen(false)}
          wide
        >
          <CsvImportPanel
            columns={["user_id", "name", "mobile", "email", ...reference.levels.map((l) => l.key)]}
            templateName="end-users-template.csv"
            onImport={api.endUsers.importCsv}
            onDone={reload}
          />
        </Modal>
      )}
    </>
  );
}

export default function EndUsersPage() {
  return (
    <RequirePermission anyOf={["end_user.view"]}>
      <Suspense>
        <EndUsersList />
      </Suspense>
    </RequirePermission>
  );
}
