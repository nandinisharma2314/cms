"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, HelpCircle, Lock, Mail, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { BrandMark } from "./BrandMark";
import { useAction } from "@/lib/hooks";
import { ErrorBanner, Field, inputClass, Modal, primaryButtonClass, secondaryButtonClass, textareaClass } from "./ui";

const darkInput =
  "w-full h-11 bg-[#0e172e] border border-[#233566] rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all";

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function SupportLine() {
  const { support } = useConfig();
  const parts = [support.phone, support.email].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p className="mt-6 text-center text-xs text-slate-400">
      Need help signing in? Contact <strong className="text-slate-200">{parts.join(" · ")}</strong>
      {support.hours && <span className="block text-[11px] text-slate-500 mt-0.5">{support.hours}</span>}
    </p>
  );
}

function ResetRequestDialog({ onClose }: { onClose: () => void }) {
  const { limits } = useConfig();
  const [identifier, setIdentifier] = useState("");
  const [reason, setReason] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  return (
    <Modal
      title={ticket ? "Request sent" : "Ask for a password reset"}
      description={
        ticket
          ? undefined
          : "Someone above you checks who you are and gives you a temporary password, which you change when you sign in."
      }
      onClose={onClose}
    >
      {ticket ? (
        <div className="text-center space-y-3 py-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="text-xs text-slate-600">
            Your request <span className="font-mono font-bold text-slate-900">{ticket}</span> is waiting for review. Quote this
            reference if you contact your manager.
          </p>
          <button type="button" onClick={onClose} className={`${primaryButtonClass} w-full justify-center`}>
            Back to sign in
          </button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => setTicket((await api.auth.raiseResetQuery(identifier.trim(), reason.trim())).ticket_id));
          }}
        >
          <ErrorBanner message={error} />
          <Field label="Email or mobile number of your account">
            <input
              required
              maxLength={limits.reset_identifier}
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Why do you need a reset?">
            <textarea
              required
              rows={3}
              maxLength={limits.reset_reason}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={textareaClass}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={primaryButtonClass}>
              {busy ? "Sending…" : "Send request"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function AdminLogin() {
  useDocumentTitle("Sign in");
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  // Already signed in (a valid session cookie)? Go straight in.
  useEffect(() => {
    let active = true;
    api.auth.restore().then((ok) => active && ok && router.replace(next));
    return () => {
      active = false;
    };
  }, [router, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await api.auth.login(identifier.trim(), password);
      router.replace(me.must_change_password ? "/change-password" : next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-[#0d162c] px-4 py-10 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-linear-to-b from-blue-600/20 via-sky-500/10 to-transparent blur-[120px] rounded-full" />
        <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] bg-teal-500/10 blur-[140px] rounded-full" />
      </div>

      <main className="relative z-10 w-full max-w-md flex flex-col items-center">
        <div className="flex flex-col items-center text-center mb-8">
          <BrandMark theme="dark" />
          <h1 className="mt-5 text-lg font-bold text-white">Staff sign in</h1>
          <p className="text-slate-400 text-xs mt-1">For administrators and staff who handle complaints.</p>
        </div>

        <div className="w-full bg-[#131e3a]/90 backdrop-blur-xl border border-[#233566] rounded-3xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          {error && (
            <div
              role="alert"
              className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="block text-xs font-medium text-slate-300 mb-1.5">Email or mobile number</span>
              <span className="relative block">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className={`${darkInput} pl-10 pr-4`}
                />
              </span>
            </label>

            <label className="block">
              <span className="block text-xs font-medium text-slate-300 mb-1.5">Password</span>
              <span className="relative block">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${darkInput} pl-10 pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="w-4 h-4 text-sky-400" /> : <Eye className="w-4 h-4" />}
                </button>
              </span>
            </label>

            <button
              type="submit"
              disabled={busy}
              className="w-full mt-2 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {busy ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#1e2d54] flex items-center justify-between gap-3 text-[11px]">
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-1.5 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Forgot your password?
            </button>
            <span className="flex items-center gap-1.5 text-slate-500">
              <UserCheck className="w-3.5 h-3.5" /> Staff only
            </span>
          </div>
        </div>

        <SupportLine />
      </main>

      {resetOpen && <ResetRequestDialog onClose={() => setResetOpen(false)} />}
    </div>
  );
}
