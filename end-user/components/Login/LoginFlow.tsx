"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BellRing, KeyRound, ListChecks, UserRound } from "lucide-react";
import { AccountChoice, api, OtpChallenge, OtpChannel } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { BrandMark } from "@/components/Brand/BrandMark";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MailEnvelopeIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from "./AuthIcons";
import { NeedHelpModal } from "./NeedHelpModal";
import { SkylineIllustration } from "./SkylineIllustration";
import emailIllustration from "@/assets/login/email.jpg";
import heroPhoto from "@/assets/login/hero.jpg";
import smsIllustration from "@/assets/login/sms.jpg";

type Step = "welcome" | "identify" | "otp" | "choose" | "verifying";

const ILLUSTRATION = { sms: smsIllustration, email: emailIllustration } as const;

/** The pale wave along the bottom of the phone screens. */
function Waves() {
  return (
    <div className="pointer-events-none absolute bottom-0 left-0 z-0 w-full overflow-hidden md:hidden" aria-hidden="true">
      <svg viewBox="0 0 375 140" className="block h-auto w-full" preserveAspectRatio="none">
        <path fill="#e0f2fe" d="M0,80 Q90,10 190,60 T375,40 L375,140 L0,140 Z" />
        <path fill="#bae6fd" opacity="0.4" d="M0,110 Q140,50 250,100 T375,80 L375,140 L0,140 Z" />
      </svg>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back"
      className="flex h-10.5 w-10.5 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-transform active:scale-95"
    >
      <ChevronLeftIcon size={20} color="#0f172a" />
    </button>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh w-full flex-col items-center bg-[#f4f7f9] md:min-h-0 md:bg-transparent">
      <Waves />
      <div className="relative z-10 flex w-full max-w-100 flex-1 flex-col px-6 pb-6 pt-6">{children}</div>
    </div>
  );
}

function Heading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 text-center">
      <h1 className="text-[24px] font-bold tracking-tight text-[#0f172a]">{title}</h1>
      {children && <p className="mx-auto mt-2 max-w-[300px] text-[15px] leading-relaxed text-[#475569]">{children}</p>}
    </div>
  );
}

function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="fixed left-1/2 top-6 z-100 flex w-[90%] max-w-[380px] -translate-x-1/2 items-start justify-between gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 shadow-lg"
    >
      <span className="text-[14px] font-semibold">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded-full p-1 text-red-400 hover:bg-red-100 hover:text-red-600"
      >
        ×
      </button>
    </div>
  );
}

/** The brand column shown next to the sign-in steps on larger screens. */
function Showcase() {
  return (
    <aside className="hidden flex-col justify-between gap-6 border-r border-blue-100/80 bg-linear-to-b from-[#f2f8fe] to-[#e2f1fd] p-9 md:flex">
      <div className="space-y-5">
        <BrandMark size="lg" />
        <div>
          <h2 className="text-[26px] font-extrabold leading-tight tracking-tight text-[#0b1a3f]">
            Report an issue.
            <br />
            <span className="text-blue-600">Follow it to the end.</span>
          </h2>
          <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-slate-600">
            Register a complaint in a few steps, see who is working on it, and get told the moment something changes.
          </p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <SkylineIllustration idPrefix="desk_" />
      </div>
      <ul className="flex flex-wrap gap-2 text-[12px] font-semibold text-slate-700">
        <li className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 shadow-sm">
          <KeyRound className="h-3.5 w-3.5 text-blue-600" /> One-time code, no password
        </li>
        <li className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 shadow-sm">
          <BellRing className="h-3.5 w-3.5 text-emerald-600" /> Updates as they happen
        </li>
        <li className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 shadow-sm">
          <ListChecks className="h-3.5 w-3.5 text-violet-600" /> Every complaint in one place
        </li>
      </ul>
    </aside>
  );
}

export function LoginFlow() {
  useDocumentTitle("Sign in");
  const router = useRouter();
  const { phone, otp, product_name } = useConfig();
  const [step, setStep] = useState<Step>("welcome");
  const [channel, setChannel] = useState<OtpChannel>(otp.channels[0]);
  const [identifier, setIdentifier] = useState("");
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [digits, setDigits] = useState<string[]>(() => Array(otp.length).fill(""));
  const [choice, setChoice] = useState<AccountChoice | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  // Already signed in on this device? Go straight to the dashboard.
  useEffect(() => {
    let active = true;
    api.auth.restore().then((ok) => active && ok && router.replace("/dashboard"));
    return () => {
      active = false;
    };
  }, [router]);

  // Tick while a resend countdown is running.
  useEffect(() => {
    if (step !== "otp" || now >= resendAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step, now, resendAt]);

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const otherChannel = otp.channels.find((c) => c !== channel);

  const choose = (next: OtpChannel) => {
    setChannel(next);
    setIdentifier("");
    setError("");
    setStep("identify");
  };

  const sendCode = async () => {
    setBusy(true);
    setError("");
    try {
      const sent = await api.auth.requestOtp(channel, identifier.trim());
      setChallenge(sent);
      setDigits(Array(otp.length).fill(""));
      setResendAt(Date.now() + sent.resend_after_seconds * 1000);
      setNow(Date.now());
      setStep("otp");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Fills the boxes from `index` on with a pasted or autofilled code. */
  const spreadDigits = (index: number, typed: string) => {
    const next = [...digits];
    typed
      .slice(0, otp.length - index)
      .split("")
      .forEach((digit, offset) => (next[index + offset] = digit));
    setDigits(next);
    boxes.current[Math.min(index + typed.length, otp.length - 1)]?.focus();
  };

  const typeDigit = (index: number, value: string) => {
    const typed = value.replace(/\D/g, "");
    // The whole code at once (e.g. the phone's one-time-code autofill) fills every box.
    if (typed.length >= otp.length) return spreadDigits(0, typed);
    // Typing over a filled box gives two characters: keep the new one.
    const next = [...digits];
    next[index] = typed.slice(-1);
    setDigits(next);
    if (next[index] && index < otp.length - 1) boxes.current[index + 1]?.focus();
  };

  const pasteDigits = (index: number, e: React.ClipboardEvent) => {
    e.preventDefault();
    const typed = e.clipboardData.getData("text").replace(/\D/g, "");
    if (typed) spreadDigits(typed.length >= otp.length ? 0 : index, typed);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    const code = digits.join("");
    if (code.length < otp.length) {
      setError(`Enter all ${otp.length} digits of the code.`);
      return;
    }
    setError("");
    setStep("verifying");
    try {
      const result = await api.auth.verifyOtp(challenge.challenge_id, code);
      if ("selection_token" in result) {
        setChoice(result);
        setStep("choose");
      } else {
        router.replace("/dashboard");
      }
    } catch (err) {
      setError((err as Error).message);
      setStep("otp");
    }
  };

  const pickAccount = async (endUserId: number) => {
    if (!choice) return;
    setError("");
    setStep("verifying");
    try {
      await api.auth.selectAccount(choice.selection_token, endUserId);
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
      setStep("choose");
    }
  };

  const phoneHint = phone.number_length
    ? `${phone.number_length} digits${phone.country_code ? `, with or without ${phone.country_code}` : ""}`
    : null;

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-linear-to-br from-[#f0f8ff] via-[#eaf4fd] to-[#f3f8fe] md:p-8">
      {error && <ErrorToast message={error} onDismiss={() => setError("")} />}

      <div className="grid min-h-dvh w-full overflow-hidden bg-white md:min-h-147.5 md:max-w-245 md:grid-cols-[1.05fr_1fr] md:rounded-3xl md:border md:border-blue-50 md:shadow-[0_24px_70px_-10px_rgba(15,60,110,0.12)]">
        <Showcase />

        <main className="relative flex flex-col md:justify-center">
          {step === "welcome" && (
            <div className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-[#f0f9ff] md:min-h-0 md:bg-white">
              {/* Phone: the photo fills the top, the sign-in card sits below it */}
              <div className="pointer-events-none absolute left-0 top-0 z-0 h-[70vh] w-full md:hidden">
                {/* Lazy, so screens that hide it never load it; high priority where it shows. */}
                <Image src={heroPhoto} alt="" fill sizes="100vw" fetchPriority="high" className="object-cover object-bottom" />
              </div>
              <div className="relative z-10 px-6 pt-6 md:hidden">
                <BrandMark />
              </div>
              <div className="flex-1 md:hidden" />
              <div className="relative z-20 mt-auto flex w-full shrink-0 flex-col items-center rounded-t-[32px] bg-white px-6 pb-16 pt-10 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] md:mt-0 md:rounded-none md:pb-10 md:shadow-none">
                <div className="w-full max-w-100">
                  <h1 className="text-[20px] font-bold text-[#0f172a]">Sign in{product_name ? ` to ${product_name}` : ""}</h1>
                  <p className="mb-6 mt-1 text-[14px] text-slate-500">We&apos;ll send you a one-time code.</p>
                  <div className="flex flex-col gap-4">
                    {otp.channels.includes("sms") && (
                      <button
                        type="button"
                        onClick={() => choose("sms")}
                        className="flex h-16 w-full items-center justify-between rounded-full border border-[#bae6fd] bg-white p-2 pr-5 transition-transform hover:bg-[#f0f9ff] active:scale-[0.98]"
                      >
                        <span className="flex items-center gap-3 overflow-hidden pl-1">
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e0f2fe]">
                            <SmartphoneIcon size={20} color="#0284c7" />
                          </span>
                          <span className="truncate text-[14px] font-semibold text-[#0f172a]">Continue with mobile number</span>
                        </span>
                        <ChevronRightIcon size={18} color="#0284c7" />
                      </button>
                    )}
                    {otp.channels.includes("email") && (
                      <button
                        type="button"
                        onClick={() => choose("email")}
                        className="flex h-16 w-full items-center justify-between rounded-full border border-[#e9d5ff] bg-white p-2 pr-5 transition-transform hover:bg-[#faf5ff] active:scale-[0.98]"
                      >
                        <span className="flex items-center gap-3 overflow-hidden pl-1">
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f3e8ff]">
                            <MailEnvelopeIcon size={20} color="#9333ea" />
                          </span>
                          <span className="truncate text-[14px] font-semibold text-[#0f172a]">Continue with email address</span>
                        </span>
                        <ChevronRightIcon size={18} color="#9333ea" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setHelpOpen(true)}
                    className="mt-6 text-[14px] font-semibold text-blue-600 hover:underline"
                  >
                    Can&apos;t sign in?
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "identify" && (
            <Screen>
              <div className="mb-2 flex w-full justify-start">
                <BackButton onClick={() => setStep("welcome")} />
              </div>
              <div className="-mt-2 mb-2 flex justify-center">
                <Image
                  src={ILLUSTRATION[channel]}
                  alt=""
                  sizes="180px"
                  loading="eager"
                  className="h-45 w-45 object-cover mix-blend-multiply mask-[radial-gradient(circle,black_50%,transparent_70%)]"
                />
              </div>
              <Heading title={channel === "sms" ? "Sign in with your mobile" : "Sign in with your email"}>
                {channel === "sms"
                  ? "Enter the mobile number you are registered with. We'll text you a code."
                  : "Enter the email address you are registered with. We'll email you a code."}
              </Heading>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendCode();
                }}
              >
                <label className="block">
                  <span className="sr-only">{channel === "sms" ? "Mobile number" : "Email address"}</span>
                  <span className="flex h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
                    {channel === "sms" ? (
                      <>
                        <SmartphoneIcon size={18} color="#64748b" />
                        {phone.country_code && (
                          <span className="text-[15px] font-semibold text-slate-700">{phone.country_code}</span>
                        )}
                      </>
                    ) : (
                      <MailEnvelopeIcon size={18} color="#64748b" />
                    )}
                    <input
                      required
                      autoFocus
                      type={channel === "sms" ? "tel" : "email"}
                      inputMode={channel === "sms" ? "tel" : "email"}
                      autoComplete={channel === "sms" ? "tel-national" : "email"}
                      value={identifier}
                      onChange={(e) => {
                        if (channel === "sms") {
                          const val = e.target.value.replace(/\D/g, "");
                          if (val.length <= 10) setIdentifier(val);
                        } else {
                          setIdentifier(e.target.value);
                        }
                      }}
                      maxLength={channel === "sms" ? 10 : undefined}
                      placeholder={channel === "sms" ? "Mobile number" : "Email address"}
                      className="min-w-0 flex-1 bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400"
                    />
                  </span>
                  {channel === "sms" && phoneHint && (
                    <span className="mt-1.5 block px-1 text-[12px] text-slate-500">{phoneHint}</span>
                  )}
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#1877f2] text-[16px] font-semibold text-white shadow-sm transition-all hover:bg-[#166fe5] active:scale-[0.98] disabled:opacity-70"
                >
                  {busy ? "Sending…" : "Send code"}
                  <ArrowRightIcon size={18} color="#ffffff" />
                </button>
              </form>
              {otherChannel && (
                <>
                  <div className="my-5 flex w-full items-center">
                    <div className="h-px flex-1 bg-[#cbd5e1]" />
                    <span className="px-4 text-[14px] font-bold text-[#0f172a]">or</span>
                    <div className="h-px flex-1 bg-[#cbd5e1]" />
                  </div>
                  <button
                    type="button"
                    onClick={() => choose(otherChannel)}
                    className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-[15px] font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    {otherChannel === "email" ? (
                      <MailEnvelopeIcon size={18} color="#059669" />
                    ) : (
                      <SmartphoneIcon size={18} color="#3b82f6" />
                    )}
                    {otherChannel === "email" ? "Get the code by email instead" : "Get the code by SMS instead"}
                  </button>
                </>
              )}
            </Screen>
          )}

          {step === "otp" && challenge && (
            <Screen>
              <div className="mb-6 flex w-full justify-start">
                <BackButton onClick={() => setStep("identify")} />
              </div>
              <div className="-mt-6 mb-2 flex justify-center">
                <Image
                  src={ILLUSTRATION[challenge.channel]}
                  alt=""
                  sizes="160px"
                  loading="eager"
                  className="h-40 w-40 object-cover mix-blend-multiply mask-[radial-gradient(circle,black_50%,transparent_70%)]"
                />
              </div>
              <Heading title="Enter the code">
                If an account is registered with it, we sent a {otp.length}-digit code to{" "}
                <strong className="text-slate-900">{challenge.sent_to}</strong>.
              </Heading>
              {challenge.dev_otp && (
                <button
                  type="button"
                  onClick={() => setDigits(challenge.dev_otp!.split("").slice(0, otp.length))}
                  className="mx-auto -mt-3 mb-5 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 font-mono text-[12px] font-bold text-amber-800"
                >
                  Development code {challenge.dev_otp} (tap to fill)
                </button>
              )}
              <form onSubmit={verify} className="flex flex-1 flex-col">
                <div className="mb-8 flex w-full items-center justify-center gap-1.5 sm:gap-2" role="group" aria-label="One-time code">
                  {digits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        boxes.current[index] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      maxLength={otp.length}
                      aria-label={`Digit ${index + 1}`}
                      value={digit}
                      onChange={(e) => typeDigit(index, e.target.value)}
                      onPaste={(e) => pasteDigits(index, e)}
                      onKeyDown={(e) => e.key === "Backspace" && !digits[index] && index > 0 && boxes.current[index - 1]?.focus()}
                      className="h-12 sm:h-14 min-w-0 max-w-[48px] sm:max-w-[56px] flex-1 rounded-xl border border-[#bae6fd] bg-white p-0 text-center text-[20px] sm:text-[22px] font-bold text-[#0f172a] shadow-sm outline-none transition-all focus:border-[#1877f2] focus:ring-2 focus:ring-[#1877f2]/20"
                    />
                  ))}
                </div>
                <p className="mb-8 text-center text-[14px] text-[#475569]" aria-live="polite">
                  Didn&apos;t get it?{" "}
                  {secondsLeft > 0 ? (
                    <span className="text-slate-500">You can ask again in {secondsLeft} s.</span>
                  ) : (
                    <button type="button" onClick={sendCode} disabled={busy} className="font-bold text-[#1877f2] hover:underline">
                      Send a new code
                    </button>
                  )}
                </p>
                <button
                  type="submit"
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#1877f2] text-[16px] font-semibold text-white shadow-sm transition-all hover:bg-[#166fe5] active:scale-[0.98]"
                >
                  Verify and sign in <ArrowRightIcon size={18} color="#ffffff" />
                </button>
                <div className="flex-1" />
                <p className="mt-6 flex items-center justify-center gap-2 pb-2 text-[13px] font-medium text-[#475569]">
                  <ShieldCheckIcon size={18} color="#2563eb" /> The code works once and expires in{" "}
                  {Math.round(challenge.expires_in_seconds / 60)} minutes.
                </p>
              </form>
            </Screen>
          )}

          {step === "choose" && choice && (
            <Screen>
              <Heading title="Who is signing in?">
                This {channel === "sms" ? "number" : "email address"} is registered to more than one person.
              </Heading>
              <ul className="flex flex-col gap-3">
                {choice.accounts.map((account) => (
                  <li key={account.id}>
                    <button
                      type="button"
                      onClick={() => pickAccount(account.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-blue-300 hover:bg-blue-50/40"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                        <UserRound className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold text-[#0f172a]">{account.name}</span>
                        {account.location && (
                          <span className="block truncate text-[13px] text-slate-500">{account.location}</span>
                        )}
                      </span>
                      <ChevronRightIcon size={18} color="#94a3b8" />
                    </button>
                  </li>
                ))}
              </ul>
            </Screen>
          )}

          {step === "verifying" && (
            <Screen>
              <div className="flex flex-1 flex-col items-center justify-center pt-8" role="status">
                <svg className="mb-10 h-27.5 w-27.5 animate-spin" viewBox="0 0 100 100" aria-hidden="true">
                  <defs>
                    <linearGradient id="spin-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#1877f2" />
                      <stop offset="100%" stopColor="#bae6fd" />
                    </linearGradient>
                  </defs>
                  <circle cx="50" cy="50" r="42" stroke="#e0f2fe" strokeWidth="10" fill="none" />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke="url(#spin-grad)"
                    strokeWidth="10"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray="160 264"
                  />
                </svg>
                <h1 className="mb-3 text-center text-[24px] font-bold tracking-tight text-[#1e293b]">Signing you in…</h1>
                <p className="max-w-65 text-center text-[16px] font-medium leading-relaxed text-[#3b82f6]">
                  This only takes a moment.
                </p>
              </div>
            </Screen>
          )}
        </main>
      </div>

      {helpOpen && <NeedHelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
