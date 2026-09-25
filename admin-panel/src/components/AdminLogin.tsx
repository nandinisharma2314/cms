"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CivicLogo } from "./CivicLogo";
import {
  ShieldCheck,
  Mail,
  Lock,
  Phone,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  HelpCircle,
  X,
  CheckCircle2,
  FileText,
  UserCheck,
} from "lucide-react";

import { loginApi, raiseResetQueryApi } from "@/lib/api";

interface ResetRequest {
  emailOrId: string;
  reason: string;
  department: string;
}

export function AdminLogin() {
  const router = useRouter();

  // Auth Method Switcher
  const [authMethod, setAuthMethod] = useState<"email" | "mobile">("email");

  // Form Inputs - Clean empty state (no hardcoded credentials)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Super Admin Password Reset Query Modal
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetQuery, setResetQuery] = useState<ResetRequest>({
    emailOrId: "",
    department: "Administration",
    reason: "",
  });
  const [resetSubmitted, setResetSubmitted] = useState(false);
  const [resetTicketId, setResetTicketId] = useState("");

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    const payload =
      authMethod === "email"
        ? { email: email.trim(), password }
        : { mobile: mobile.trim(), password };

    const res = await loginApi(payload);
    setIsLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || "Authentication failed. Please verify credentials.");
      return;
    }

    // Success -> Redirect to dashboard
    router.push("/");
  };

  const handleSendResetQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await raiseResetQueryApi({
      email_or_id: resetQuery.emailOrId,
      department: resetQuery.department,
      reason: resetQuery.reason,
    });

    if (res.success && res.ticket_id) {
      setResetTicketId(res.ticket_id);
      setResetSubmitted(true);
    } else {
      setErrorMessage(res.error || "Failed to submit reset query");
    }
  };

  const closeResetModal = () => {
    setIsResetModalOpen(false);
    setResetSubmitted(false);
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-[#0d162c] px-4 py-12 overflow-hidden selection:bg-blue-600 selection:text-white">
      {/* Background Decorative Ambient Gradients */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-b from-blue-600/20 via-sky-500/10 to-transparent blur-[120px] rounded-full"></div>
        <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] bg-teal-500/10 blur-[140px] rounded-full"></div>
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)`,
            backgroundSize: "32px 32px",
          }}
        ></div>
      </div>

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-lg flex flex-col items-center">
        {/* Brand Logo & Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <CivicLogo size={52} theme="dark" />
          <div className="inline-flex items-center gap-2 mt-4 px-3.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-sky-400 text-xs font-semibold tracking-wide uppercase">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Administrative & Officer Portal</span>
          </div>
          <p className="text-slate-400 text-xs max-w-sm mt-2">
            Secure centralized authentication for municipal officers, department heads, and complaint administrators.
          </p>
        </div>

        {/* Authentication Card */}
        <div className="w-full bg-[#131e3a]/90 backdrop-blur-xl border border-[#233566] rounded-3xl p-8 sm:p-9 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          {/* Auth Method Switcher (Email vs Mobile) */}
          <div className="flex border-b border-[#1e2d54] mb-6">
            <button
              type="button"
              onClick={() => setAuthMethod("email")}
              className={`pb-2.5 px-3 text-xs font-semibold transition-all relative cursor-pointer ${
                authMethod === "email"
                  ? "text-sky-400"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              <span>Official Email</span>
              {authMethod === "email" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-400 rounded-full"></span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setAuthMethod("mobile")}
              className={`pb-2.5 px-3 text-xs font-semibold transition-all relative cursor-pointer ${
                authMethod === "mobile"
                  ? "text-sky-400"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              <span>Registered Mobile</span>
              {authMethod === "mobile" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-400 rounded-full"></span>
              )}
            </button>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleFormSubmit} className="space-y-4">
            {authMethod === "email" ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Official Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. rahul.sharma@example.com"
                      required
                      className="w-full h-11 pl-10 pr-4 bg-[#0e172e] border border-[#233566] rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-300">
                      Security Password
                    </label>
                    {/* Reset query instead of self-service forgot password */}
                    <button
                      type="button"
                      onClick={() => setIsResetModalOpen(true)}
                      className="text-[11px] text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <HelpCircle className="w-3 h-3" />
                      <span>Forgot password? Raise a reset query</span>
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your security password"
                      required
                      className="w-full h-11 pl-10 pr-10 bg-[#0e172e] border border-[#233566] rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4 text-sky-400" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Registered Mobile Number
                  </label>
                  <div className="flex gap-2">
                    <span className="flex items-center justify-center px-3 h-11 bg-[#0e172e] border border-[#233566] rounded-xl text-white text-xs font-semibold">
                      🇮🇳 +91
                    </span>
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        type="tel"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        placeholder="9876543210"
                        required
                        className="w-full h-11 pl-10 pr-4 bg-[#0e172e] border border-[#233566] rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-300">
                      Security Password
                    </label>
                    {/* Reset query instead of self-service forgot password */}
                    <button
                      type="button"
                      onClick={() => setIsResetModalOpen(true)}
                      className="text-[11px] text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <HelpCircle className="w-3 h-3" />
                      <span>Forgot password? Raise a reset query</span>
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your security password"
                      required
                      className="w-full h-11 pl-10 pr-10 bg-[#0e172e] border border-[#233566] rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4 text-sky-400" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-4 h-12 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-bold shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Verifying Credentials & Routing...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Authorize & Access Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </button>
          </form>

          {/* Super Admin Reset Query Quick Trigger Footer */}
          <div className="mt-6 pt-5 border-t border-[#1e2d54] flex items-center justify-between text-[11px] text-slate-400">
            <button
              type="button"
              onClick={() => setIsResetModalOpen(true)}
              className="text-slate-400 hover:text-sky-300 transition-colors flex items-center gap-1.5 text-left"
            >
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span>Raise a Password Reset Query</span>
            </button>
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Gov Gateway Secure</span>
            </div>
          </div>
        </div>

        {/* Support Footer note */}
        <div className="mt-6 text-center text-xs text-slate-400">
          <span>Need technical assistance? Call Helpline </span>
          <strong className="text-slate-200">1800-CIVIC-CARE</strong>
        </div>
      </div>

      {/* Super Admin Reset Query Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-[#131e3a] border border-[#233566] rounded-2xl p-6 shadow-2xl">
            <button
              onClick={closeResetModal}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {!resetSubmitted ? (
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Raise Password Reset Query
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      An administrator above you will verify your identity and issue a temporary password.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSendResetQuery} className="mt-4 space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Official Email or Officer Employee ID
                    </label>
                    <input
                      type="text"
                      required
                      value={resetQuery.emailOrId}
                      onChange={(e) =>
                        setResetQuery({ ...resetQuery, emailOrId: e.target.value })
                      }
                      placeholder="e.g. rahul.sharma@example.com or OFF-8021"
                      className="w-full h-10 px-3 bg-[#0e172e] border border-[#233566] rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Department
                    </label>
                    <select
                      value={resetQuery.department}
                      onChange={(e) =>
                        setResetQuery({ ...resetQuery, department: e.target.value })
                      }
                      className="w-full h-10 px-3 bg-[#0e172e] border border-[#233566] rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Administration">Administration / Super Admin Cell</option>
                      <option value="Electricity">Electricity Department</option>
                      <option value="Water Supply">Water Supply & Sewerage</option>
                      <option value="Sanitation">Sanitation & Waste</option>
                      <option value="Public Works">Public Works Department</option>
                      <option value="Parks & Gardens">Parks & Gardens</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Query Details / Reason
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={resetQuery.reason}
                      onChange={(e) =>
                        setResetQuery({ ...resetQuery, reason: e.target.value })
                      }
                      placeholder="Specify reason for credential reset request..."
                      className="w-full p-2.5 bg-[#0e172e] border border-[#233566] rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    ></textarea>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeResetModal}
                      className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-[#0f1830] border border-[#202f5a] hover:bg-[#1a274c]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/30 cursor-pointer"
                    >
                      Submit Reset Query
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="text-center py-4 space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white">Reset Query Submitted!</h4>
                <p className="text-xs text-slate-300 max-w-xs mx-auto">
                  Ticket <span className="font-mono font-bold text-sky-400">#{resetTicketId}</span> has been sent to the review queue.
                </p>
                <div className="p-3 bg-[#0e172e] border border-[#233566] rounded-xl text-[11px] text-slate-400 text-left">
                  <p>• Department: <strong className="text-slate-200">{resetQuery.department}</strong></p>
                  <p>• Officer ID: <strong className="text-slate-200">{resetQuery.emailOrId}</strong></p>
                  <p>• Status: <strong className="text-amber-400">Awaiting Approval</strong></p>
                </div>
                <button
                  type="button"
                  onClick={closeResetModal}
                  className="w-full mt-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Return to Login
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
