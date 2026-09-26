"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  User,
  Mail,
  Phone,
  MapPin,
  Building2,
  Building,
  ShieldCheck,
  Check,
  Save,
  Bell,
  Sliders,
  AlertCircle,
  Sparkles,
  Camera,
  Map,
} from "lucide-react";
import { apis } from "@/lib/apis";
import { useEndUser } from "@/lib/endUserSession";

interface ProfileSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: (user: { name: string; email: string; mobile?: string }) => void;
}

export default function ProfileSettingsPanel({
  isOpen,
  onClose,
  onProfileUpdated,
}: ProfileSettingsPanelProps) {
  // Tabs: personal, address, preferences
  const [activeTab, setActiveTab] = useState<"personal" | "address" | "preferences">("personal");

  // Profile fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const role = useEndUser().profile.role.name;

  // Address fields (stored in local preferences & profile)
  const [area, setArea] = useState("Mansarovar");
  const [city, setCity] = useState("Jaipur");
  const [stateName, setStateName] = useState("Rajasthan");
  const [pincode, setPincode] = useState("302020");

  // Preferences
  const [notifySms, setNotifySms] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyAlerts, setNotifyAlerts] = useState(true);

  // Status
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Load profile data on open
  useEffect(() => {
    if (!isOpen) return;

    setSuccessMessage("");
    setErrorMessage("");

    // Load from localStorage first
    try {
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        setName(parsed.name || "");
        setEmail(parsed.email || "");
        setMobile(parsed.mobile || "");
      }

      const storedAddress = localStorage.getItem("user_profile_address");
      if (storedAddress) {
        const addr = JSON.parse(storedAddress);
        if (addr.area) setArea(addr.area);
        if (addr.city) setCity(addr.city);
        if (addr.state) setStateName(addr.state);
        if (addr.pincode) setPincode(addr.pincode);
      }

      const storedPrefs = localStorage.getItem("user_profile_prefs");
      if (storedPrefs) {
        const prefs = JSON.parse(storedPrefs);
        setNotifySms(prefs.notifySms ?? true);
        setNotifyEmail(prefs.notifyEmail ?? true);
        setNotifyAlerts(prefs.notifyAlerts ?? true);
      }
    } catch (e) {
      console.error("Error reading localStorage user data", e);
    }

    // Fetch from backend
    const fetchRemoteProfile = async () => {
      try {
        setLoading(true);
        const res = await apis.profile.getProfile();
        if (res && res.success && res.user) {
          setName(res.user.name || "");
          setEmail(res.user.email || "");
          setMobile(res.user.mobile || "");

          localStorage.setItem(
            "user",
            JSON.stringify({
              id: res.user.id,
              name: res.user.name || "",
              email: res.user.email || "",
              mobile: res.user.mobile || "",
              role: res.user.role.name,
            })
          );
        }
      } catch (err: any) {
        console.warn("Could not fetch remote profile:", err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRemoteProfile();
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scrolling while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!name.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    if (!email.trim() && !mobile.trim()) {
      setErrorMessage("Please enter either an email address or mobile number.");
      return;
    }

    if (email.trim() && !email.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    try {
      setSaving(true);

      const payload: { name: string; email: string; mobile: string } = {
        name: name.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
      };

      const res = await apis.profile.updateProfile(payload);
      const updatedUser = res?.user || payload;

      // Update localStorage
      const existingUserStr = localStorage.getItem("user");
      const existingUser = existingUserStr ? JSON.parse(existingUserStr) : {};
      const newUserObj = {
        ...existingUser,
        name: updatedUser.name || name.trim(),
        email: updatedUser.email || email.trim(),
        mobile: updatedUser.mobile || mobile.trim(),
      };
      localStorage.setItem("user", JSON.stringify(newUserObj));

      // Save address preferences
      localStorage.setItem(
        "user_profile_address",
        JSON.stringify({ area, city, state: stateName, pincode })
      );

      // Save notification preferences
      localStorage.setItem(
        "user_profile_prefs",
        JSON.stringify({ notifySms, notifyEmail, notifyAlerts })
      );

      if (onProfileUpdated) {
        onProfileUpdated({
          name: updatedUser.name || name.trim(),
          email: updatedUser.email || email.trim(),
          mobile: updatedUser.mobile || mobile.trim(),
        });
      }

      setSuccessMessage("Your profile has been saved successfully!");
      setTimeout(() => {
        setSuccessMessage("");
      }, 3500);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // Extract initials
  const displayName = name || (email ? email.split("@")[0] : "") || mobile || "User";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "RS";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col h-full animate-in slide-in-from-right duration-300 ease-out">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Sliders size={18} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                Profile Settings
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Manage your account credentials, civic address & preferences
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close panel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Profile Card Banner */}
        <div className="px-6 pt-5 pb-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-blue-900 text-white shrink-0 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />

          <div className="flex items-center gap-4 relative z-10">
            <div className="relative group cursor-pointer">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-blue-400 text-white flex items-center justify-center text-xl font-extrabold shadow-lg shadow-black/20 ring-4 ring-white/10">
                {initials}
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center border-2 border-indigo-900 shadow-sm text-[10px]">
                <Camera size={11} />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white truncate">{displayName}</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold border border-emerald-400/30">
                  <ShieldCheck size={11} /> Verified End User
                </span>
              </div>
              <p className="text-xs text-indigo-200 truncate mt-0.5">
                {email || mobile || "Civic Account"}
              </p>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-indigo-200">
                <span className="inline-flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-md text-[10px] font-medium text-white">
                  <User size={10} /> {role}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} className="text-indigo-300" /> {city}, {stateName}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-200 px-6 bg-slate-50/50 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("personal")}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "personal"
                ? "border-indigo-600 text-indigo-600 bg-white"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <User size={14} /> Personal Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("address")}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "address"
                ? "border-indigo-600 text-indigo-600 bg-white"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <MapPin size={14} /> Civic Address
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("preferences")}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "preferences"
                ? "border-indigo-600 text-indigo-600 bg-white"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Bell size={14} /> Notifications
          </button>
        </div>

        {/* Notification Banners */}
        {successMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-800 animate-in fade-in shrink-0">
            <Check size={16} className="text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-red-700 animate-in fade-in shrink-0">
            <AlertCircle size={16} className="text-red-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 flex flex-col justify-between">
          <div className="flex flex-col gap-5">
            {/* TAB 1: Personal Details */}
            {activeTab === "personal" && (
              <div className="flex flex-col gap-4 animate-in fade-in duration-200">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span>
                      Full Name <span className="text-red-500">*</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">Official end user name</span>
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <User size={16} />
                    </div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span>Email Address</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      {email ? "Registered Login" : "Optional"}
                    </span>
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <Mail size={16} />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. user@example.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span>Mobile Phone Number</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      {mobile ? "Primary Contact" : "Optional"}
                    </span>
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <Phone size={16} />
                    </div>
                    <input
                      type="text"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl flex items-start gap-3 mt-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles size={14} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-indigo-900">Official Civic Account</h4>
                    <p className="text-[11px] text-indigo-700/80 leading-relaxed mt-0.5">
                      Your registered contact details receive official department notices and SMS alerts on complaint status updates.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Civic Address */}
            {activeTab === "address" && (
              <div className="flex flex-col gap-4 animate-in fade-in duration-200">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-900">Default Civic Locality</span>
                  <p className="text-[11px] text-slate-500">
                    This location will automatically pre-populate Step 2 whenever you register a new complaint.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-800">Area / Locality</label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <MapPin size={15} />
                      </div>
                      <input
                        type="text"
                        value={area}
                        onChange={(e) => setArea(e.target.value)}
                        placeholder="e.g. Mansarovar"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-800">City</label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <Building2 size={15} />
                      </div>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="e.g. Jaipur"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-800">State / Region</label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <Map size={15} />
                      </div>
                      <input
                        type="text"
                        value={stateName}
                        onChange={(e) => setStateName(e.target.value)}
                        placeholder="e.g. Rajasthan"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-800">Postal / Pin Code</label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <Building size={15} />
                      </div>
                      <input
                        type="text"
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value)}
                        placeholder="e.g. 302020"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-slate-800">Assigned Ward:</span>
                    <span>Zone 4 — South Jaipur</span>
                  </div>
                  <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded">Active</span>
                </div>
              </div>
            )}

            {/* TAB 3: Notifications */}
            {activeTab === "preferences" && (
              <div className="flex flex-col gap-3.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">SMS Status Alerts</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Receive real-time text messages when an agent is assigned or complaint resolves.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifySms}
                      onChange={(e) => setNotifySms(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Email Digest & Tracking</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Get formal email acknowledgements with complaint IDs and tracking links.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Civic Alerts & Maintenance</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Urgent municipal notices, power cut announcements, and water schedule alerts.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyAlerts}
                      onChange={(e) => setNotifyAlerts(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={14} /> Save Profile Settings
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
