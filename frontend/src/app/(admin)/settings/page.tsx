"use client";

import React, { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { api, RejectionReason, SettingsForm, SettingsResponse, resolveFileUrl } from "@/lib/api";
import { useConfig, useDocumentTitle, useReloadConfig } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { useAction, useApiData } from "@/lib/hooks";
import { RequirePermission } from "@/components/RequirePermission";
import {
  Card,
  ErrorBanner,
  Field,
  iconButtonClass,
  inputClass,
  Notice,
  PageHeader,
  primaryButtonClass,
  secondaryButtonClass,
  Spinner,
  StatusPill,
} from "@/components/ui";
import { RewardSettingsEditor } from "./RewardSettingsEditor";
function LogoUpload({ initialLogoUrl, onUpload }: { initialLogoUrl: string | null; onUpload: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Section title="Organisation Logo" description="This logo replaces the default 'MC' badge in the sidebar.">
      <div className="col-span-full flex items-center gap-5">
        <div className="w-16 h-16 shrink-0 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
          {initialLogoUrl ? (
            <img src={resolveFileUrl(initialLogoUrl)!} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            <span className="text-slate-400 text-xs font-semibold">None</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <input
            type="file"
            accept="image/*"
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            disabled={uploading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 2 * 1024 * 1024) {
                setError("File is larger than 2MB");
                return;
              }
              setUploading(true);
              setError(null);
              try {
                await api.settings.uploadLogo(file);
                onUpload();
              } catch (err: any) {
                // eslint-disable-line @typescript-eslint/no-explicit-any
                setError(err.message);
              } finally {
                setUploading(false);
              }
            }}
          />
          {error && <p className="text-xs text-rose-500">{error}</p>}
          {uploading && <p className="text-xs text-slate-500">Uploading...</p>}
        </div>
      </div>
    </Section>
  );
}

function toForm(s: SettingsResponse): SettingsForm {
  return {
    organisation_name: s.organisation_name,
    logo_url: s.logo_url,
    product_name: s.product_name,
    support_email: s.support_email,
    support_phone: s.support_phone,
    support_hours: s.support_hours,
    timezone: s.timezone,
    complaint_id_prefix: s.complaint_id_prefix,
    complaint_next_number: s.complaint_next_number,
    reopen_window_days: s.reopen_window_days,
    max_reopens: s.max_reopens,
    max_attachments_per_complaint: s.max_attachments_per_complaint,
    max_attachment_mb: s.max_attachment_mb,
    allowed_attachment_types: s.allowed_attachment_types,
    phone_country_code: s.phone_country_code,
    phone_number_length: s.phone_number_length,
    phone_expected_prefixes: s.phone_expected_prefixes,
    // A channel switched off on the server can't stay enabled.
    sms_notifications_enabled: s.sms_notifications_enabled && s.available_channels.includes("sms"),
    email_notifications_enabled: s.email_notifications_enabled && s.available_channels.includes("email"),
  };
}

type TextKey = {
  [K in keyof SettingsForm]: SettingsForm[K] extends string | null ? K : never;
}[keyof SettingsForm];
type NumberKey = {
  [K in keyof SettingsForm]: SettingsForm[K] extends number | null ? K : never;
}[keyof SettingsForm];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
    </Card>
  );
}

function SettingsEditor({ initial, onSaved }: { initial: SettingsResponse; onSaved: () => void }) {
  const { limits } = useConfig();
  const [form, setForm] = useState<SettingsForm>(() => toForm(initial));
  const { busy, error, run } = useAction();

  const text = (key: TextKey, label: string, hint?: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} hint={hint}>
      <input
        className={inputClass}
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value || null })}
        {...extra}
      />
    </Field>
  );
  const number = (key: NumberKey, label: string, hint?: string, min = 0) => (
    <Field label={label} hint={hint}>
      <input
        type="number"
        min={min}
        className={inputClass}
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value === "" ? null : Number(e.target.value) })}
      />
    </Field>
  );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          // The next number moves on as complaints arrive; send it only when it was changed here.
          const nextNumberChanged = form.complaint_next_number !== initial.complaint_next_number;
          await api.settings.save({ ...form, complaint_next_number: nextNumberChanged ? form.complaint_next_number : null });
          onSaved();
        });
      }}
    >
      <LogoUpload initialLogoUrl={initial.logo_url} onUpload={onSaved} />

      <Section title="Organisation" description="Shown in both apps. Contact details are left out wherever they are empty.">
        {text("organisation_name", "Organisation name", undefined, { maxLength: limits.organisation_name })}
        {text("product_name", "Product name", "What people call this system", { maxLength: limits.product_name })}
        <Field label="Time zone" hint="Days in reports and times on screen follow it">
          <select
            className={inputClass}
            value={form.timezone ?? ""}
            onChange={(e) => setForm({ ...form, timezone: e.target.value || null })}
          >
            <option value="">Not set</option>
            {initial.timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>
        {text("support_email", "Support email", undefined, { type: "email", maxLength: limits.support_email })}
        {text("support_phone", "Support phone", undefined, { maxLength: limits.support_phone })}
        {text("support_hours", "Support hours", "For example: weekdays 9:00-17:00", { maxLength: limits.support_hours })}
      </Section>

      <Section
        title="Complaints"
        description="IDs look like PREFIX-NUMBER. The next number can only move forward past numbers already used."
      >
        {text(
          "complaint_id_prefix",
          "ID prefix",
          `Up to ${limits.complaint_id_prefix} capital letters or digits, starting with a letter`,
          {
            maxLength: limits.complaint_id_prefix,
          },
        )}
        {number("complaint_next_number", "Next number", undefined, 1)}
        <div />
        {number("reopen_window_days", "Reopen window (days)", "How long after resolution an end user may reopen")}
        {number("max_reopens", "Maximum reopens", "Per complaint")}
      </Section>

      <Section title="Attachments">
        {number("max_attachments_per_complaint", "Files per complaint", "Including files on replies")}
        {number("max_attachment_mb", "Maximum file size (MB)", undefined, 1)}
        <fieldset className="sm:col-span-2 lg:col-span-3">
          <legend className="text-xs font-medium text-slate-600 mb-1">Allowed file types</legend>
          <div className="flex flex-wrap gap-3">
            {initial.supported_attachment_types.map((type) => (
              <label key={type} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.allowed_attachment_types.includes(type)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      allowed_attachment_types: e.target.checked
                        ? [...form.allowed_attachment_types, type]
                        : form.allowed_attachment_types.filter((t) => t !== type),
                    })
                  }
                />
                .{type}
              </label>
            ))}
          </div>
        </fieldset>
      </Section>

      <Section
        title="Mobile numbers"
        description="How mobile numbers are entered, checked and stored everywhere (sign-in, imports, forms)."
      >
        {text("phone_country_code", "Country code", "For example +91 or +1", { maxLength: limits.phone_country_code })}
        {number("phone_number_length", "Digits after the country code", undefined, 4)}
        {text(
          "phone_expected_prefixes",
          "Expected first digits (optional)",
          "Imports warn about numbers starting with another digit",
          {
            maxLength: limits.phone_expected_prefixes,
            inputMode: "numeric",
          },
        )}
      </Section>

      <Card className="p-5 space-y-2">
        <h2 className="text-sm font-bold text-slate-800">Messages to end users</h2>
        <p className="text-xs text-slate-500">
          Complaint updates always appear in the portal. They can also go out by SMS and email; each end user can opt out in their
          profile.
        </p>
        {(["sms", "email"] as const).map((channel) => {
          const key = channel === "sms" ? "sms_notifications_enabled" : "email_notifications_enabled";
          const available = initial.available_channels.includes(channel);
          return (
            <label key={channel} className={`flex items-center gap-2 text-xs ${available ? "text-slate-700" : "text-slate-400"}`}>
              <input
                type="checkbox"
                disabled={!available}
                checked={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
              />
              {channel === "sms" ? "Send SMS" : "Send email"}
              {!available && <span>(switched off on the server)</span>}
            </label>
          );
        })}
      </Card>

      <ErrorBanner message={error} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        {initial.updated_at && (
          <span className="text-[11px] text-slate-400">Last saved {formatDateTime(initial.updated_at)}</span>
        )}
        <button type="submit" className={primaryButtonClass} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}

function RejectionReasons() {
  const { limits } = useConfig();
  const { data: reasons, error, reload } = useApiData(() => api.settings.reasons(), []);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const action = useAction();

  const move = (list: RejectionReason[], index: number, delta: number) => {
    const ids = list.map((r) => r.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    action.run(async () => {
      await api.settings.orderReasons(ids);
      reload();
    });
  };

  return (
    <Card className="p-5 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-800">Rejection reasons</h2>
        <p className="text-xs text-slate-500 mt-1">
          Staff choose one when they reject a complaint or ask for it to be rejected. Retired reasons stay on old records.
        </p>
      </div>
      <ErrorBanner message={error ?? action.error} />
      {!reasons ? (
        !error && <Spinner />
      ) : (
        <ul className="divide-y divide-slate-50 border border-slate-100 rounded-xl">
          {reasons.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              {renaming?.id === r.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    action.run(async () => {
                      await api.settings.updateReason(r.id, { name: renaming.name });
                      setRenaming(null);
                      reload();
                    });
                  }}
                >
                  <input
                    required
                    maxLength={limits.rejection_reason_name}
                    className={inputClass}
                    aria-label="Reason"
                    value={renaming.name}
                    onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                  />
                  <button type="submit" className={primaryButtonClass} disabled={action.busy}>
                    Save
                  </button>
                  <button type="button" className={secondaryButtonClass} onClick={() => setRenaming(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span className={`flex-1 min-w-0 ${r.is_active ? "text-slate-800" : "text-slate-400 line-through"}`}>
                    {r.name}
                  </span>
                  <StatusPill active={r.is_active} />
                  <button
                    className={iconButtonClass}
                    disabled={action.busy || i === 0}
                    aria-label={`Move ${r.name} up`}
                    onClick={() => move(reasons, i, -1)}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className={iconButtonClass}
                    disabled={action.busy || i === reasons.length - 1}
                    aria-label={`Move ${r.name} down`}
                    onClick={() => move(reasons, i, 1)}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className={iconButtonClass}
                    aria-label={`Rename ${r.name}`}
                    onClick={() => setRenaming({ id: r.id, name: r.name })}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="w-16 text-right text-[11px] font-semibold text-slate-500 hover:text-blue-600 cursor-pointer"
                    disabled={action.busy}
                    onClick={() =>
                      action.run(async () => {
                        await api.settings.updateReason(r.id, { is_active: !r.is_active });
                        reload();
                      })
                    }
                  >
                    {r.is_active ? "Retire" : "Restore"}
                  </button>
                </>
              )}
            </li>
          ))}
          {reasons.length === 0 && (
            <li className="px-3 py-4 text-xs text-slate-400">
              No reasons yet. Complaints can&apos;t be rejected until at least one exists.
            </li>
          )}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          action.run(async () => {
            await api.settings.addReason(name);
            setName("");
            reload();
          });
        }}
      >
        <input
          required
          maxLength={limits.rejection_reason_name}
          className={inputClass}
          placeholder="New reason"
          aria-label="New reason"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className={secondaryButtonClass} disabled={action.busy}>
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </form>
    </Card>
  );
}

function SettingsPageContent() {
  useDocumentTitle("Settings");
  const { data, error, reload } = useApiData(() => api.settings.get(), []);
  const { data: status, reload: reloadStatus } = useApiData(() => api.settings.status(), []);
  const reloadConfig = useReloadConfig();
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Organisation-wide settings. Nothing here has a built-in value: what is not set is reported and left out."
      />
      {status && status.problems.length > 0 && (
        <ErrorBanner message={`Still to configure: ${status.problems.map((p) => p.message).join("; ")}.`} />
      )}
      <ErrorBanner message={error} />
      <Notice message={notice} />
      {!data ? (
        !error && <Spinner />
      ) : (
        <SettingsEditor
          key={data.updated_at ?? "never"}
          initial={data}
          onSaved={() => {
            setNotice("Settings saved. Others who are signed in see new branding and limits the next time the app loads.");
            reload();
            reloadStatus();
            reloadConfig();
          }}
        />
      )}
      <RejectionReasons />
      <RewardSettingsEditor />
    </>
  );
}

export default function SettingsPage() {
  return (
    <RequirePermission anyOf={["settings.manage"]}>
      <SettingsPageContent />
    </RequirePermission>
  );
}
