/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useRef, useState } from "react";
import {
  Bell,
  Calendar,
  Camera,
  CheckCircle,
  CreditCard,
  HelpCircle,
  Info,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Trash2,
  User,
} from "lucide-react";
import { api, ApiError, OtpChallenge, OtpChannel, Profile, resolveAvatarUrl } from "@/lib/portalApi";
import { useConfig, useDocumentTitle } from "@/lib/portalConfig";
import { initials, today } from "@/lib/portalFormat";
import { useEndUser } from "@/lib/portalSession";
import { validatePhone } from "@/lib/validate";
import { SupportContacts } from "@/components/portal/Brand/SupportContacts";
import { Dialog } from "@/components/portal/ui/Dialog";

type Tab = "personal" | "contact" | "notifications" | "help";

const fieldClass =
  "w-full rounded-none border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";

function IconField({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
      {children}
    </div>
  );
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-bold text-slate-800">
      {children}
    </label>
  );
}

/** Changing the sign-in mobile or email: the new one is confirmed with a code first. */
function ContactChangeDialog({
  channel,
  onClose,
  onChanged,
}: {
  channel: OtpChannel;
  onClose: () => void;
  onChanged: (profile: Profile) => void;
}) {
  const { phone, otp } = useConfig();
  const [value, setValue] = useState("");
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false); // true when backend says number already exists
  const [busy, setBusy] = useState(false);
  const label = channel === "sms" ? "mobile number" : "email address";

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      // 409 = the number/email already belongs to another account in this system
      if (err instanceof ApiError && err.status === 409) {
        setDuplicate(true);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Change your ${label}`} icon={<ShieldCheck className="h-5 w-5 text-blue-600" />} onClose={onClose}>
      {/* ── Duplicate-number warning popup ─────────────────────────────── */}
      {duplicate && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Number already in use"
          className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-white/90 backdrop-blur-sm p-6"
        >
          <div className="flex flex-col items-center gap-4 text-center max-w-xs">
            {/* Warning icon circle */}
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-9 w-9 text-amber-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <div>
              <h3 className="text-[17px] font-bold text-slate-800">Number already in use</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
                <strong className="text-slate-700">{value}</strong> is already registered to another account in this system.
                Please use a different {label}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDuplicate(false);
                setValue("");
              }}
              className="w-full rounded-2xl bg-amber-500 py-2.5 text-[14px] font-bold text-white hover:bg-amber-600 active:scale-[0.98] transition-all"
            >
              Try a different {label}
            </button>
          </div>
        </div>
      )}
      {/* ── Normal error (non-409) ──────────────────────────────────────── */}
      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
          {error}
        </p>
      )}
      {!challenge ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (channel === "sms") {
              const phoneErr = validatePhone(value.trim());
              if (phoneErr) {
                setError(phoneErr);
                return;
              }
            }
            run(async () => setChallenge(await api.profile.requestContactChange(channel, value.trim())));
          }}
        >
          <p className="text-[14px] text-slate-600">
            We&apos;ll send a code to the new {label} to make sure it&apos;s yours. You sign in with it from then on.
          </p>
          <label className="block text-[13px] font-semibold text-slate-700">
            New {label}
            {channel === "sms" ? (
              <span className="mt-1 flex items-center rounded-xl border border-slate-200 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 overflow-hidden">
                {/* +91 prefix badge */}
                <span className="flex shrink-0 items-center gap-1.5 border-r border-slate-200 bg-slate-50 px-3 py-3 text-[15px] font-bold text-slate-600 select-none">
                  +91
                </span>
                <input
                  required
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  placeholder="Mobile number"
                  value={value}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setValue(val);
                    setDuplicate(false);
                    setError(null);
                  }}
                  className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
                />
              </span>
            ) : (
              <input
                required
                type="email"
                autoComplete="email"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setDuplicate(false);
                  setError(null);
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-[15px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            )}
            {channel === "sms" && phone.number_length && (
              <span className="mt-1 block text-[12px] font-normal text-slate-500">{phone.number_length} digits after +91</span>
            )}
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-blue-600 py-3 text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => onChanged(await api.profile.verifyContactChange(challenge.challenge_id, code.trim())));
          }}
        >
          <p className="text-[14px] text-slate-600">
            Enter the {otp.length}-digit code we sent to <strong className="text-slate-900">{challenge.sent_to}</strong>. Other
            devices signed in to your account will be signed out.
          </p>
          {challenge.dev_otp && (
            <button
              type="button"
              onClick={() => setCode(challenge.dev_otp!)}
              className="rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 font-mono text-[12px] font-bold text-amber-800"
            >
              Development code {challenge.dev_otp} (tap to fill)
            </button>
          )}
          <input
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={otp.length}
            aria-label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center font-mono text-[22px] tracking-[0.4em] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-blue-600 py-3 text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Checking…" : "Confirm"}
          </button>
        </form>
      )}
    </Dialog>
  );
}

export default function ProfilePage() {
  useDocumentTitle("My profile");
  const { profile, setProfile, can, logout } = useEndUser();
  const { limits, notifications, otp } = useConfig();
  const canEdit = can("portal.profile.update");
  const [tab, setTab] = useState<Tab>("personal");
  const [name, setName] = useState(profile.name);
  const [dob, setDob] = useState(profile.dob ?? "");

  const [address, setAddress] = useState(profile.address ?? "");
  const [notifySms, setNotifySms] = useState(profile.notify_sms);
  const [notifyEmail, setNotifyEmail] = useState(profile.notify_email);
  const [changing, setChanging] = useState<OtpChannel | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("File size exceeds 5MB limit.");
      return;
    }
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const updated = await api.profile.uploadAvatar(file);
      setProfile(updated);
    } catch (err) {
      setAvatarError((err as Error).message);
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAvatarDelete = async () => {
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const updated = await api.profile.deleteAvatar();
      setProfile(updated);
    } catch (err) {
      setAvatarError((err as Error).message);
    } finally {
      setAvatarUploading(false);
    }
  };

  const changes = (): Parameters<typeof api.profile.update>[0] => {
    const data: Parameters<typeof api.profile.update>[0] = {};
    if (tab === "personal") {
      if (dob !== (profile.dob ?? "")) {
        if (dob) data.dob = dob;
        else data.clear_dob = true;
      }
    } else if (tab === "notifications") {
      if (notifySms !== profile.notify_sms) data.notify_sms = notifySms;
      if (notifyEmail !== profile.notify_email) data.notify_email = notifyEmail;
    }
    return data;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = changes();
    if (Object.keys(data).length === 0) {
      setMessage({ ok: true, text: "Nothing to save." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.profile.update(data);
      setProfile(updated);
      setMessage({ ok: true, text: "Saved." });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "personal", label: "Personal", icon: <User size={16} /> },
    { id: "contact", label: "Contact", icon: <Phone size={16} /> },
    ...(notifications.sms || notifications.email
      ? [{ id: "notifications" as Tab, label: "Notifications", icon: <Bell size={16} /> }]
      : []),
    { id: "help", label: "Help", icon: <HelpCircle size={16} /> },
  ];

  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto bg-white p-0 md:px-6 md:pb-6 lg:px-8 lg:pb-8">
      <div className="flex w-full max-w-5xl flex-col overflow-hidden bg-white md:rounded-b-3xl md:border-x md:border-b md:border-slate-100 md:shadow-sm mb-2 md:mb-20">
        <div className="flex shrink-0 flex-col border-b border-slate-100">
          <div className="h-16 bg-linear-to-r from-sky-100 via-blue-50 to-indigo-50 md:h-28" aria-hidden="true" />
          <div className="relative z-10 -mt-7 flex flex-col items-center gap-2 px-4 pb-3 sm:flex-row sm:items-end sm:gap-6 sm:px-8 md:-mt-12 md:pb-4">
            <div className="relative group">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-white bg-blue-50 text-xl font-extrabold text-blue-700 shadow-sm md:h-24 md:w-24 md:text-3xl overflow-hidden relative">
                {avatarUploading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                ) : profile.avatar_url ? (
                  <img
                    src={resolveAvatarUrl(profile.avatar_url)!}
                    alt={profile.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials(profile.name)
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <div className="absolute -bottom-1 -right-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  title="Upload profile picture"
                  aria-label="Upload profile picture"
                  className="flex h-6 w-6 md:h-7 md:w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Camera className="h-3 w-3 md:h-3.5 md:w-3.5" />
                </button>
                {profile.avatar_url && (
                  <button
                    type="button"
                    onClick={handleAvatarDelete}
                    disabled={avatarUploading}
                    title="Remove profile picture"
                    aria-label="Remove profile picture"
                    className="flex h-6 w-6 md:h-7 md:w-7 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3 md:h-3.5 md:w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex w-full flex-1 flex-col items-center justify-between gap-2 sm:flex-row sm:items-end">
              <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
                <h1 className="text-xl font-extrabold leading-tight text-slate-800 md:text-2xl">{profile.name}</h1>
                {avatarError && <p className="mt-1 text-xs font-semibold text-rose-600">{avatarError}</p>}
                <p className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-slate-500 sm:justify-start md:gap-3 md:text-sm">
                  <span className="flex items-center gap-1">
                    <Phone size={12} className="text-slate-400" aria-hidden="true" /> {profile.mobile}
                  </span>
                  <span className="flex items-center gap-1">
                    <Mail size={12} className="text-slate-400" aria-hidden="true" /> {profile.email}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="hidden shrink-0 items-center gap-2 rounded-xl bg-red-50 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-100 md:flex"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </div>
          <div className="border-t border-slate-100 bg-slate-50/50 px-0 sm:px-8">
            <div className="flex items-center gap-1 relative overflow-x-auto px-2 md:gap-2 md:px-0" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => {
                    setTab(t.id);
                    setMessage(null);
                  }}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-xs font-bold transition-all md:px-4 md:py-3.5 md:text-sm ${
                    tab === t.id
                      ? "border-blue-600 bg-white text-blue-700"
                      : "border-transparent text-slate-500 hover:bg-slate-100/50 hover:text-slate-800"
                  }`}
                >
                  <span className={tab === t.id ? "text-blue-600" : "text-slate-400"}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col">
          <form onSubmit={save} className="flex h-full flex-col">
            <div className="flex flex-1 flex-col gap-4 px-4 py-4 sm:px-8 md:gap-5 md:py-6">
              {message && (
                <p
                  role={message.ok ? "status" : "alert"}
                  className={`flex items-center gap-2.5 rounded-xl border p-3.5 text-sm font-bold ${
                    message.ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {message.ok ? <CheckCircle size={18} /> : <Info size={18} />}
                  {message.text}
                </p>
              )}
              {!canEdit && tab !== "help" && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm font-semibold text-amber-800">
                  Your account can&apos;t change these details. Contact support if something needs updating.
                </p>
              )}

              {tab === "personal" && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="name">Full name</Label>
                    <IconField icon={<User size={16} />}>
                      <input
                        id="name"
                        required
                        maxLength={limits.person_name}
                        disabled={true}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={fieldClass}
                      />
                    </IconField>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="dob">Date of birth (optional)</Label>
                    <IconField icon={<Calendar size={16} />}>
                      <input
                        id="dob"
                        type="date"
                        max={today()}
                        disabled={true}
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className={fieldClass}
                      />
                    </IconField>
                  </div>

                  {/* Aadhaar Card */}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="aadhaar">Aadhaar card number</Label>
                    <IconField icon={<CreditCard size={16} />}>
                      <input id="aadhaar" disabled value={profile.aadhaar_number ?? "—"} className={fieldClass} readOnly />
                    </IconField>
                  </div>

                  {/* PAN Card */}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pan">PAN card number</Label>
                    <IconField icon={<CreditCard size={16} />}>
                      <input id="pan" disabled value={profile.pan_number ?? "—"} className={fieldClass} readOnly />
                    </IconField>
                  </div>
                </div>
              )}

              {tab === "contact" && (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
                    {(["sms", "email"] as OtpChannel[]).map((channel) => (
                      <div key={channel} className="flex flex-col gap-1.5">
                        <span className="text-xs font-bold text-slate-800">
                          {channel === "sms" ? "Mobile number" : "Email address"}
                        </span>
                        <div className="flex items-center gap-2 rounded-none border border-slate-200 bg-slate-50 py-2.5 pl-4 pr-2">
                          {channel === "sms" ? (
                            <Phone size={16} className="text-slate-400" />
                          ) : (
                            <Mail size={16} className="text-slate-400" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                            {channel === "sms" ? profile.mobile : profile.email}
                          </span>
                          {canEdit && otp.channels.includes(channel) && (
                            <button
                              type="button"
                              onClick={() => setChanging(channel)}
                              className="shrink-0 rounded-none bg-white px-3 py-1.5 text-xs font-bold text-blue-600 shadow-sm hover:bg-blue-50"
                            >
                              Change
                            </button>
                          )}
                        </div>
                        {canEdit && !otp.channels.includes(channel) && (
                          <p className="px-1 text-[11px] text-slate-500">
                            It can&apos;t be confirmed with a code here; ask support to change it.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Address — one box per location level */}
                  {profile.location && profile.location.path_names.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-bold text-slate-800">Address</span>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                        {profile.location.path_names.map((part: string, i: number) => {
                          const total = profile.location!.path_names.length;
                          const levelLabels = ["Country", "State", "District", "City", "Area", "Locality", "Sub-locality"];
                          const label =
                            i === total - 1
                              ? profile.location!.type_name || levelLabels[i] || `Level ${i + 1}`
                              : levelLabels[i] || `Level ${i + 1}`;
                          return (
                            <div key={i} className="flex flex-col gap-1">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
                              <div className="flex items-center gap-2 rounded-none border border-slate-200 bg-slate-50 px-3 py-2.5">
                                <MapPin size={13} className="shrink-0 text-slate-400" />
                                <span className="text-sm font-semibold text-slate-700 truncate">{part}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="address">Address</Label>
                      <div className="relative">
                        <MapPin size={16} className="pointer-events-none absolute left-4 top-3.5 text-slate-400" />
                        <textarea
                          id="address"
                          rows={3}
                          maxLength={limits.address}
                          disabled={true}
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          className={`${fieldClass} resize-none`}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {tab === "notifications" && (
                <div className="flex flex-col gap-3">
                  <p className="text-[13px] text-slate-500">Updates always appear here in the app. You can also get them by:</p>
                  {notifications.sms && (
                    <label className="flex items-center justify-between gap-4 rounded-none border border-slate-200 bg-slate-50 p-4">
                      <span>
                        <span className="block text-sm font-bold text-slate-800">Text message</span>
                        <span className="mt-0.5 block text-xs text-slate-500">To {profile.mobile}</span>
                      </span>
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={notifySms}
                        onChange={(e) => setNotifySms(e.target.checked)}
                        className="h-5 w-5 accent-blue-600"
                      />
                    </label>
                  )}
                  {notifications.email && (
                    <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <span>
                        <span className="block text-sm font-bold text-slate-800">Email</span>
                        <span className="mt-0.5 block text-xs text-slate-500">To {profile.email}</span>
                      </span>
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={notifyEmail}
                        onChange={(e) => setNotifyEmail(e.target.checked)}
                        className="h-5 w-5 accent-blue-600"
                      />
                    </label>
                  )}
                </div>
              )}

              {tab === "help" && (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-8 text-center">
                  <span className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                    <HelpCircle size={28} />
                  </span>
                  <h3 className="text-lg font-bold text-slate-800">Need help?</h3>
                  <SupportContacts className="text-left" />
                  <p className="max-w-md text-sm text-slate-500">
                    For a problem with a complaint, reply on the complaint itself: the department sees your message there.
                  </p>
                </div>
              )}
            </div>

            {tab !== "help" && tab !== "personal" && (
              <div className="mt-auto flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-white px-4 py-3 sm:px-8 md:bg-slate-50/50 md:py-5">
                <button
                  type="button"
                  onClick={logout}
                  className="flex flex-1 items-center justify-center gap-2 rounded-none border border-red-200 bg-red-50 px-6 py-2.5 text-sm font-bold text-red-600 hover:bg-red-100 md:hidden"
                >
                  <LogOut size={16} /> Sign out
                </button>
                <button
                  type="submit"
                  disabled={saving || !canEdit}
                  className="flex flex-1 items-center justify-center gap-2 rounded-none bg-[#0F62FE] px-8 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-60 md:flex-none"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            )}
            {tab === "personal" && (
              <div className="mt-auto flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-white px-4 py-3 sm:px-8 md:bg-slate-50/50 md:py-5">
                <button
                  type="button"
                  onClick={logout}
                  className="flex flex-1 items-center justify-center gap-2 rounded-none border border-red-200 bg-red-50 px-6 py-2.5 text-sm font-bold text-red-600 hover:bg-red-100 md:hidden"
                >
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      {changing && (
        <ContactChangeDialog
          channel={changing}
          onClose={() => setChanging(null)}
          onChanged={(updated) => {
            setChanging(null);
            setProfile(updated);
            setMessage({ ok: true, text: `Your ${changing === "sms" ? "mobile number" : "email address"} was changed.` });
          }}
        />
      )}
    </div>
  );
}
