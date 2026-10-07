"use client";

import React, { useMemo, useState } from "react";
import { api, EndUserRow } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { useApiData, useDebounced } from "@/lib/hooks";
import { coversDepartment, treeInScope } from "@/lib/scope";
import { useSession } from "@/lib/session";
import { validateName, validatePhone } from "@/lib/validate";
import { LocationPicker } from "./LocationPicker";
import { ErrorBanner, Field, inputClass, Modal, primaryButtonClass, secondaryButtonClass, textareaClass } from "./ui";

type Reporter = { kind: "registered"; endUser: EndUserRow | null } | { kind: "contact"; name: string; phone: string };

function EndUserSearch({ selected, onSelect }: { selected: EndUserRow | null; onSelect: (e: EndUserRow | null) => void }) {
  const { ui } = useConfig();
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const { data } = useApiData(
    () =>
      term.length >= ui.lookup_min_chars
        ? api.endUsers.list({ search: term, page_size: ui.lookup_results })
        : Promise.resolve(null),
    [term, ui.lookup_min_chars, ui.lookup_results],
  );
  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-blue-100 bg-blue-50/50 text-xs">
        <span>
          <span className="font-semibold text-slate-800">{selected.name}</span>
          <span className="text-slate-500">
            {" "}
            · {selected.mobile} · {selected.email}
          </span>
        </span>
        <button type="button" className="text-blue-600 font-semibold cursor-pointer" onClick={() => onSelect(null)}>
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <input
        className={inputClass}
        placeholder="Search by name, mobile, email or user ID"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Find the end user"
      />
      {data && (
        <ul className="rounded-lg border border-slate-100 divide-y divide-slate-50 max-h-44 overflow-y-auto">
          {data.items.length === 0 && <li className="px-3 py-2 text-[11px] text-slate-400">No end user matches.</li>}
          {data.items.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer"
                onClick={() => onSelect(e)}
              >
                <span className="font-semibold text-slate-800">{e.name}</span>
                <span className="text-slate-500">
                  {" "}
                  · {e.mobile} · {e.location?.label ?? "no location"}
                </span>
              </button>
            </li>
          ))}
          {data.total > data.items.length && (
            <li className="px-3 py-2 text-[11px] text-slate-400">
              {data.total - data.items.length} more match; type more of the name, mobile, email or user ID.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Staff registering a complaint for someone (walk-in, phone call). */
export function RegisterComplaintDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (message: string) => void }) {
  const { me, can } = useSession();
  const { limits, phone } = useConfig();
  const { data: options, error: loadError } = useApiData(() => api.complaints.classificationOptions(), []);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  // null = the category's default priority
  const [priorityId, setPriorityId] = useState<number | null>(null);
  const [priorityReason, setPriorityReason] = useState("");
  const [locationId, setLocationId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [details, setDetails] = useState("");
  const [reporter, setReporter] = useState<Reporter>(
    can("end_user.view") ? { kind: "registered", endUser: null } : { kind: "contact", name: "", phone: "" },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporterNameError, setReporterNameError] = useState<string | null>(null);
  const [reporterPhoneError, setReporterPhoneError] = useState<string | null>(null);

  const departments = useMemo(() => (options?.departments ?? []).filter((d) => coversDepartment(me, d.id)), [options, me]);
  const department = departments.find((d) => d.id === departmentId) ?? null;
  const category = department?.categories.find((c) => c.id === categoryId) ?? null;
  // Setting another priority than the category's is a reclassification: it needs the permission and a reason.
  const canSetPriority = can("complaint.reclassify");
  const priorityChanged = priorityId !== null && category !== null && priorityId !== category.default_priority.id;
  const tree = useMemo(() => treeInScope(options?.locations ?? [], me, departmentId), [options, me, departmentId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate reporter contact fields
    if (reporter.kind === "contact") {
      const nErr = validateName(reporter.name);
      const pErr = reporter.phone.trim() ? validatePhone(reporter.phone) : null;
      setReporterNameError(nErr);
      setReporterPhoneError(pErr);
      if (nErr || pErr) return;
    }
    const effectiveLocationId =
      reporter.kind === "registered" && reporter.endUser?.location ? reporter.endUser.location.id : locationId;
    if (!department || !category) {
      setError("Choose the department and category.");
      return;
    }
    if (reporter.kind === "contact" && effectiveLocationId === null) {
      setError("Choose the location.");
      return;
    }
    if (reporter.kind === "registered" && !reporter.endUser) {
      setError("Choose the end user, or enter the reporter's name instead.");
      return;
    }
    if (reporter.kind === "registered" && reporter.endUser && !reporter.endUser.location) {
      setError("This employee has no location assigned to their profile. Please assign a location to their profile first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.complaints.quickCreate({
        title,
        description,
        additional_details: details.trim() || null,
        department_id: department.id,
        category_id: category.id,
        location_id: effectiveLocationId,
        priority_id: priorityChanged ? priorityId : null,
        priority_reason: priorityChanged ? priorityReason : null,
        end_user_id: reporter.kind === "registered" ? reporter.endUser!.id : null,
        end_user_name: reporter.kind === "contact" ? reporter.name : null,
        end_user_phone: reporter.kind === "contact" && reporter.phone.trim() ? reporter.phone : null,
      });
      onCreated(
        result.assignee
          ? `${result.id} registered and assigned to ${result.assignee}.`
          : `${result.id} registered; it waits in the department queue until someone takes it.`,
      );
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Register a complaint"
      description="For someone who reported it in person or by phone. It must fall inside your scope."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-3">
        <ErrorBanner message={error ?? loadError} />
        <Field label="Title">
          <input
            required
            maxLength={limits.title}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Department">
            <select
              required
              className={inputClass}
              value={departmentId ?? ""}
              onChange={(e) => {
                setDepartmentId(e.target.value ? Number(e.target.value) : null);
                setCategoryId(null);
                setLocationId(null);
              }}
            >
              <option value="">Choose…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select
              required
              className={inputClass}
              disabled={!department}
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Choose…</option>
              {department?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Priority"
            hint={canSetPriority ? undefined : "Set by the category; staff who can reclassify may change it later"}
          >
            <select
              className={inputClass}
              disabled={!canSetPriority}
              value={priorityId ?? ""}
              onChange={(e) => setPriorityId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{category ? `Default (${category.default_priority.name})` : "Category default"}</option>
              {options?.priorities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {reporter.kind === "registered" && reporter.endUser ? (
          <Field label="Location">
            <div className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs">
              <span className="font-semibold text-slate-800">
                {reporter.endUser.location?.label ?? "No location assigned to this employee"}
              </span>
              <span className="text-[11px] text-slate-400 ml-auto">(Assigned to employee)</span>
            </div>
          </Field>
        ) : reporter.kind === "registered" ? (
          <Field label="Location" hint="Location will be automatically assigned from the selected employee">
            <div className="p-2.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 text-xs text-slate-400">
              Select an employee below to automatically use their assigned location.
            </div>
          </Field>
        ) : (
          <Field label="Location">
            {department ? (
              <LocationPicker value={locationId} onChange={setLocationId} />
            ) : (
              <p className="text-[11px] text-slate-400">Choose the department first.</p>
            )}
          </Field>
        )}
        {priorityChanged && (
          <Field label={`Why ${options?.priorities.find((p) => p.id === priorityId)?.name ?? "this"} priority? (internal)`}>
            <input
              required
              maxLength={limits.note}
              value={priorityReason}
              onChange={(e) => setPriorityReason(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}
        <Field label="Description">
          <textarea
            required
            rows={3}
            maxLength={limits.description}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={textareaClass}
          />
        </Field>
        <Field label="Additional details (optional)">
          <input
            maxLength={limits.additional_details}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className={inputClass}
          />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-slate-600 mb-1">Reported by</legend>
          {can("end_user.view") && (
            <div className="flex gap-4 text-xs text-slate-700">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={reporter.kind === "registered"}
                  onChange={() => setReporter({ kind: "registered", endUser: null })}
                />
                A registered end user
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={reporter.kind === "contact"}
                  onChange={() => setReporter({ kind: "contact", name: "", phone: "" })}
                />
                Someone else
              </label>
            </div>
          )}
          {reporter.kind === "registered" ? (
            <EndUserSearch
              selected={reporter.endUser}
              onSelect={(endUser) => {
                setReporter({ kind: "registered", endUser });
                if (endUser?.location?.id) {
                  setLocationId(endUser.location.id);
                }
              }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Name" error={reporterNameError}>
                <input
                  required
                  maxLength={limits.person_name}
                  value={reporter.name}
                  className={reporterNameError ? `${inputClass} !border-red-400` : inputClass}
                  onChange={(e) => {
                    setReporter({ ...reporter, name: e.target.value });
                    setReporterNameError(validateName(e.target.value));
                  }}
                />
              </Field>
              <Field
                label="Mobile (optional)"
                error={reporterPhoneError}
                hint={phone.number_length
                  ? `${phone.number_length} digits${phone.country_code ? `, optionally with ${phone.country_code}` : ""}`
                  : undefined}
              >
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={reporter.phone}
                  className={reporterPhoneError ? `${inputClass} !border-red-400` : inputClass}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setReporter({ ...reporter, phone: val });
                    setReporterPhoneError(val ? validatePhone(val) : null);
                  }}
                />
              </Field>
            </div>
          )}
        </fieldset>

        <div className="pt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !options} className={primaryButtonClass}>
            {busy ? "Registering…" : "Register complaint"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
