"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound } from "lucide-react";
import { api, PublicConfig } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { useSession } from "@/lib/session";
import { BrandMark } from "./BrandMark";
import { Card, ErrorBanner, Field, inputClass, primaryButtonClass, secondaryButtonClass } from "./ui";

type PasswordRules = PublicConfig["password"];

/** The API's rules (from /public/config), so the form can say what is missing before sending. */
export function passwordProblems(password: string, rules: PasswordRules): string[] {
  const problems: string[] = [];
  if (password.length < rules.min_length) problems.push(`at least ${rules.min_length} characters`);
  if (new TextEncoder().encode(password).length > rules.max_bytes) problems.push(`at most ${rules.max_bytes} bytes`);
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < rules.character_classes) problems.push(`${rules.character_classes} of: lowercase, uppercase, digit, symbol`);
  return problems;
}

export function passwordHint(rules: PasswordRules): string {
  return `${rules.min_length}+ characters with ${rules.character_classes} of: lowercase, uppercase, digit, symbol.`;
}

export function ChangePasswordForm() {
  useDocumentTitle("Change password");
  const router = useRouter();
  const { me, setMe, logout } = useSession();
  const { password: rules } = useConfig();
  const forced = me.must_change_password;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const problems = next ? passwordProblems(next, rules) : [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problems.length) {
      setError(`The new password needs ${problems.join(", ")}.`);
      return;
    }
    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setMe(await api.auth.changePassword(current, next));
      router.replace("/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5">
        <div className="flex justify-center">
          <BrandMark theme="light" />
        </div>
        <Card className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900">{forced ? "Choose your own password" : "Change password"}</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {forced
                  ? "Your password was set by someone else. Replace it before you continue."
                  : "You stay signed in here; every other session is signed out."}
              </p>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <ErrorBanner message={error} />
            <Field label={forced ? "Temporary password" : "Current password"}>
              <input
                required
                type="password"
                autoComplete="current-password"
                className={inputClass}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>
            <Field label="New password" hint={problems.length ? `Still needs ${problems.join(", ")}.` : passwordHint(rules)}>
              <input
                required
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                aria-invalid={problems.length > 0}
              />
            </Field>
            <Field label="Repeat the new password">
              <input
                required
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <div className="flex items-center justify-between gap-2 pt-1">
              {forced ? (
                <button type="button" className={secondaryButtonClass} onClick={logout}>
                  Sign out
                </button>
              ) : (
                <Link href="/" className={secondaryButtonClass}>
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </Link>
              )}
              <button type="submit" className={primaryButtonClass} disabled={busy}>
                {busy ? "Saving…" : "Save password"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
