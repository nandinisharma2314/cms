"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, Pencil, Power, UserPlus, Search } from "lucide-react";
import Link from "next/link";
import { api, EndUserRow } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { channelNames, formatDateTime } from "@/lib/format";
import { useAction, useApiData, useDebounced } from "@/lib/hooks";
import { validateName, validatePhone } from "@/lib/validate";

import { useSession } from "@/lib/session";
import { CsvImportPanel } from "@/components/CsvImportPanel";
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

function EndUserForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: EndUserRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { phone, limits, otp } = useConfig();
  const signInWith = channelNames(otp.channels);
  const [externalId, setExternalId] = useState(editing?.external_id ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [mobile, setMobile] = useState(editing?.mobile ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [aadhar, setAadhar] = useState(editing?.aadhar ?? "");
  const [panCard, setPanCard] = useState(editing?.pan_card ?? "");
  const [locationId, setLocationId] = useState<number | null>(editing?.location?.id ?? null);
  const [joinDate, setJoinDate] = useState(
    editing?.join_date ?? (editing?.created_at ? editing.created_at.split("T")[0] : new Date().toISOString().split("T")[0]),
  );
  const [endDate, setEndDate] = useState(editing?.end_date ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [aadharError, setAadharError] = useState<string | null>(null);
  const [panError, setPanError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  // End users are placed by location only; any department scope covers them.
  const identityChanged = editing !== null && (mobile !== editing.mobile || email !== editing.email);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const nErr = validateName(name);
    const mErr = validatePhone(mobile);
    const aErr = aadhar.trim() && aadhar.trim().length !== 12 ? "Aadhar must be exactly 12 digits." : null;
    const pErr = panCard.trim() && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panCard.trim()) ? "Invalid PAN format." : null;
    const dErr = !joinDate
      ? "Join date is required."
      : endDate && endDate < joinDate
      ? "End date cannot be earlier than join date."
      : null;
    setNameError(nErr);
    setMobileError(mErr);
    setAadharError(aErr);
    setPanError(pErr);
    setDateError(dErr);
    if (nErr || mErr || aErr || pErr || dErr) return;
    run(async () => {
      if (locationId === null) {
        throw new Error("Please choose an assigned workplace location for this employee.");
      }
      if (editing) {
        const changes: Parameters<typeof api.endUsers.update>[1] = {};
        if (externalId.trim() !== (editing.external_id ?? "")) changes.external_id = externalId;
        if (name !== editing.name) changes.name = name;
        if (mobile !== editing.mobile) changes.mobile = mobile;
        if (email !== editing.email) changes.email = email;
        if (aadhar !== editing.aadhar) changes.aadhar = aadhar;
        if (panCard !== editing.pan_card) changes.pan_card = panCard;
        if (joinDate !== (editing.join_date ?? "")) changes.join_date = joinDate;
        if (endDate !== (editing.end_date ?? "")) {
          if (endDate.trim()) changes.end_date = endDate.trim();
          else changes.clear_end_date = true;
        }
        if (locationId !== (editing.location?.id ?? null)) {
          changes.location_id = locationId;
        }
        if (Object.keys(changes).length) await api.endUsers.update(editing.id, changes);
        onSaved(identityChanged ? `${name} updated. They were signed out and told about the change.` : `${name} updated.`);
      } else {
        await api.endUsers.create({
          external_id: externalId.trim() || null,
          name,
          mobile,
          email,
          aadhar,
          pan_card: panCard,
          location_id: locationId,
          join_date: joinDate,
          end_date: endDate.trim() || null,
        });
        onSaved(`${name} added. They can now sign in to the portal with their ${signInWith}.`);
      }
    });
  };

  return (
    <Modal title={editing ? `Edit ${editing.name}` : "Add an end user"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" error={nameError}>
            <input
              required
              maxLength={limits.person_name}
              className={nameError ? `${inputClass} !border-red-400` : inputClass}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(validateName(e.target.value));
              }}
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
            error={mobileError}
            hint={
              phone.number_length
                ? `${phone.number_length} digits${phone.country_code ? `, optionally with ${phone.country_code}` : ""}`
                : undefined
            }
          >
            <input
              required
              type="tel"
              inputMode="numeric"
              maxLength={10}
              className={mobileError ? `${inputClass} !border-red-400` : inputClass}
              value={mobile}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                setMobile(val);
                setMobileError(validatePhone(val));
              }}
            />
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
          <Field label="Aadhar" error={aadharError}>
            <input
              required
              className={aadharError ? `${inputClass} !border-red-400` : inputClass}
              placeholder="e.g., 123456789012"
              maxLength={12}
              value={aadhar}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 12);
                setAadhar(val);
                setAadharError(val && val.length !== 12 ? "Aadhar must be exactly 12 digits." : null);
              }}
            />
          </Field>
          <Field label="PAN Card" error={panError}>
            <input
              required
              className={panError ? `${inputClass} !border-red-400` : inputClass}
              placeholder="e.g., ABCDE1234F"
              maxLength={10}
              value={panCard}
              onChange={(e) => {
                const val = e.target.value
                  .replace(/[^A-Za-z0-9]/g, "")
                  .toUpperCase()
                  .slice(0, 10);
                setPanCard(val);
                setPanError(val && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(val) ? "Invalid PAN format." : null);
              }}
            />
          </Field>
        </div>
        {identityChanged && (
          <p className="text-[11px] text-amber-700">
            Mobile and email are how this person signs in. Changing them signs them out everywhere and sends them a notice.
          </p>
        )}
        {/* Tenure & Portal Access Period */}
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-600" />
              <h4 className="text-xs font-semibold text-slate-800">Tenure & Portal Access Period</h4>
            </div>
            {editing?.tenure_status && (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  editing.tenure_status === "active"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    : editing.tenure_status === "expired"
                    ? "bg-rose-100 text-rose-800 border border-rose-200"
                    : "bg-amber-100 text-amber-800 border border-amber-200"
                }`}
              >
                Tenure {editing.tenure_status}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Join Date (Required)"
              hint="Tenure start date. User can sign in to the portal on or after this date."
              error={dateError}
            >
              <input
                type="date"
                required
                className={inputClass}
                value={joinDate}
                onChange={(e) => {
                  setJoinDate(e.target.value);
                  setDateError(null);
                }}
              />
            </Field>
            <Field
              label="End Date (Optional)"
              hint="Access auto-expires after this date without manual admin action. Leave blank for indefinite tenure."
            >
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className={inputClass}
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDateError(null);
                  }}
                />
                {endDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setEndDate("");
                      setDateError(null);
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2.5 py-2 rounded-lg border border-slate-200 bg-white shrink-0"
                    title="Clear end date to make tenure permanent"
                  >
                    Clear
                  </button>
                )}
              </div>
            </Field>
          </div>
        </div>

        <Field label="Assigned Location">
          <LocationPicker value={locationId} onChange={setLocationId} />
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

export function EndUsersList() {
  useDocumentTitle("End users");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useSession();
  const { ui, otp } = useConfig();
  const [search, setSearch] = useState("");
  const pageParam = searchParams.get("page");
  const page = pageParam ? parseInt(pageParam, 10) : 1;
  const setPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (p === 1) params.delete("page");
    else params.set("page", p.toString());
    router.replace(`?${params.toString()}`, { scroll: false });
  };
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
    const levels = await api.locations.levels();
    return { levels };
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
    <div className="flex flex-col h-full">
      <div className="shrink-0">
        <PageHeader
          title="End users"
          description={`People who sign in to the end-user portal with a one-time code sent to their ${channelNames(otp.channels)}.`}
          actions={
            <>
              <div className="relative group">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-sky-500 transition-colors" />
                <input
                  type="search"
                  className={`${inputClass} pl-9 pr-4 py-2 w-56 focus:w-72 transition-all bg-white shadow-sm border-slate-200`}
                  placeholder="Search users..."
                  aria-label="Search end users"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
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
        <ErrorBanner message={actionError ?? loadError ?? referenceError} />
        <Notice message={notice} />
      </div>

      <Card className="mt-4 overflow-x-auto overflow-y-auto flex-1 min-h-0 mb-4 relative">
        <table className="w-full min-w-215 text-left text-xs relative">
          <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <tr className="border-b border-slate-100 text-slate-400 uppercase text-[11px] tracking-wider">
              <th className="px-4 py-5 font-semibold">Name</th>
              <th className="px-4 py-5 font-semibold">Mobile</th>
              <th className="px-4 py-5 font-semibold">Email</th>
              <th className="px-4 py-5 font-semibold">Location</th>
              <th className="px-4 py-5 font-semibold">Tenure</th>
              <th className="px-4 py-5 font-semibold">Status</th>
              <th className="px-4 py-5 font-semibold">Last sign-in</th>
              <th className="px-5 py-5">
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
                  <td className="px-4 py-5 font-bold text-slate-800">
                    <Link href={`/users/end-user/${row.id}`} className="hover:text-sky-700 hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-5 text-slate-600">{row.mobile}</td>
                  <td className="px-4 py-5 text-slate-600">{row.email}</td>
                  <td className="px-4 py-5 text-slate-600">{row.location?.label ?? "—"}</td>
                  <td className="px-4 py-5 text-slate-600">
                    <div className="space-y-1">
                      {row.tenure_status === "expired" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          Expired
                        </span>
                      ) : row.tenure_status === "pending" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Upcoming
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      )}
                      <div className="text-[10px] text-slate-500 leading-tight">
                        <div>From: <span className="font-mono font-medium text-slate-700">{row.join_date || "—"}</span></div>
                        <div>To: <span className="font-mono font-medium text-slate-700">{row.end_date || "Permanent"}</span></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-5 space-y-1">
                    <StatusPill active={row.is_active} />
                    {row.tenure_status === "expired" && (
                      <span className="block w-fit px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                        Tenure Expired
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-5 text-slate-500 whitespace-nowrap">{formatDateTime(row.last_login_at)}</td>
                  <td className="px-5 py-5">
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
      {data && (
        <div className="shrink-0 mt-2 mb-4">
          <Pagination page={page} pageSize={data.page_size} total={data.total} noun="end users" onPage={setPage} />
        </div>
      )}

      {form && reference && (
        <EndUserForm
          editing={form.editing}

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
          description="Rows are matched by mobile + email and updated; others are created. Locations must already exist."
          onClose={() => setImportOpen(false)}
          wide
        >
          <CsvImportPanel
            columns={["name", "mobile", "email", "aadhar", "pan_card", ...reference.levels.map((l) => l.key)]}
            templateName="end-users-template.csv"
            onImport={api.endUsers.importCsv}
            onDone={reload}
          />
        </Modal>
      )}
    </div>
  );
}
