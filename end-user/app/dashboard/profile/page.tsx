"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  User, Phone, Bell, Globe, HelpCircle, LogOut,
  ChevronLeft, Camera, CheckCircle, Mail, MapPin, Calendar, ChevronDown, Check, Info
} from "lucide-react";
import { apis } from "@/lib/apis";

export default function ProfilePage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("personal");

  // State for saving
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ type: "", text: "" });

  // Profile data
  const [name, setName] = useState("Rahul Sharma");
  const [email, setEmail] = useState("rahul.sharma@example.com");
  const [mobile, setMobile] = useState("+91 98765 43210");
  const [address, setAddress] = useState("123, Mansarovar Colony\nJaipur, Rajasthan - 302020");
  const [dob, setDob] = useState("1998-03-15");
  const [gender, setGender] = useState("Male");
  const [language, setLanguage] = useState("English (India)");
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // Preferences data
  const [notifySms, setNotifySms] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyAlerts, setNotifyAlerts] = useState(true);


  useEffect(() => {
    // Load existing user from local storage
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const u = JSON.parse(storedUser);
        if (u.name) setName(u.name);
        if (u.email) setEmail(u.email);
        if (u.mobile) setMobile(u.mobile);
      } catch (e) {}
    }
    
    const storedImage = localStorage.getItem("user_profile_image");
    if (storedImage) setProfileImage(storedImage);
    
    const storedDob = localStorage.getItem("user_dob");
    if (storedDob) setDob(storedDob);
    
    const storedGender = localStorage.getItem("user_gender");
    if (storedGender) setGender(storedGender);
    
    const storedAddress = localStorage.getItem("user_address");
    if (storedAddress) setAddress(storedAddress);
    
    const storedLang = localStorage.getItem("user_language");
    if (storedLang) setLanguage(storedLang);

    const storedNotifySms = localStorage.getItem("user_notifySms");
    if (storedNotifySms !== null) setNotifySms(storedNotifySms === "true");

    const storedNotifyEmail = localStorage.getItem("user_notifyEmail");
    if (storedNotifyEmail !== null) setNotifyEmail(storedNotifyEmail === "true");

    const storedNotifyAlerts = localStorage.getItem("user_notifyAlerts");
    if (storedNotifyAlerts !== null) setNotifyAlerts(storedNotifyAlerts === "true");

    // Fetch live profile
    apis.profile.getProfile().then((res) => {
      if (res && res.success && res.user) {
        if (res.user.name) setName(res.user.name);
        if (res.user.email) setEmail(res.user.email);
        if (res.user.mobile) setMobile(res.user.mobile);
        if (res.user.dob) setDob(res.user.dob);
        if (res.user.gender) setGender(res.user.gender);
        if (res.user.address) setAddress(res.user.address);
      }
    }).catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage({ type: "", text: "" });

    try {
      if (activeTab === "personal" || activeTab === "contact") {
        const payload = { name, email, mobile, dob, gender, address };
        await apis.profile.updateProfile(payload);
        
        const stored = localStorage.getItem("user");
        const u = stored ? JSON.parse(stored) : {};
        localStorage.setItem("user", JSON.stringify({ ...u, ...payload }));
        window.dispatchEvent(new Event("profileUpdated"));
        
        localStorage.setItem("user_dob", dob);
        localStorage.setItem("user_gender", gender);
        localStorage.setItem("user_address", address);
        
        setSaveMessage({ type: "success", text: "Profile updated successfully!" });
      } else if (activeTab === "notifications") {
        localStorage.setItem("user_notifySms", String(notifySms));
        localStorage.setItem("user_notifyEmail", String(notifyEmail));
        localStorage.setItem("user_notifyAlerts", String(notifyAlerts));
        setSaveMessage({ type: "success", text: "Notification preferences saved!" });
      } else if (activeTab === "language") {
        localStorage.setItem("user_language", language);
        setSaveMessage({ type: "success", text: "Language preference saved!" });
      }
    } catch (err: any) {
      console.error(err);
      setSaveMessage({ type: "error", text: err.message || "Failed to save changes. Please try again." });
    } finally {
      setIsSaving(false);
      setTimeout(() => {
        setSaveMessage({ type: "", text: "" });
      }, 3500);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImage(reader.result as string);
        localStorage.setItem("user_profile_image", reader.result as string);
        window.dispatchEvent(new Event("profileUpdated"));
        setSaveMessage({ type: "success", text: "Profile photo updated!" });
        setTimeout(() => setSaveMessage({ type: "", text: "" }), 3000);
      };
      reader.readAsDataURL(file);
    }
  };

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "RS";

  // Render form content dynamically based on selected tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "personal":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 shrink-0">
            {/* Row 1: Full Name and Gender */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-800">Full Name</label>
              <div className="relative">
                <div className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-slate-400 scale-90 md:scale-100">
                  <User size={16} />
                </div>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)}
                  className="w-full pl-9 md:pl-11 pr-4 py-2.5 md:py-3 bg-white border border-slate-200 rounded-lg md:rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-800">Gender</label>
              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={() => setGender("Male")}
                  className={`flex-1 py-2.5 md:py-3 rounded-lg md:rounded-xl text-xs font-bold transition-all border ${gender === 'Male' ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' : 'bg-[#F8FAFC] text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                >
                  Male
                </button>
                <button 
                  type="button" 
                  onClick={() => setGender("Female")}
                  className={`flex-1 py-2.5 md:py-3 rounded-lg md:rounded-xl text-xs font-bold transition-all border ${gender === 'Female' ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' : 'bg-[#F8FAFC] text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                >
                  Female
                </button>
                <button 
                  type="button" 
                  onClick={() => setGender("Other")}
                  className={`flex-1 py-2.5 md:py-3 rounded-lg md:rounded-xl text-xs font-bold transition-all border ${gender === 'Other' ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' : 'bg-[#F8FAFC] text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                >
                  Other
                </button>
              </div>
            </div>

            {/* Row 2: Date of Birth and Action Buttons */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-800">Date of Birth</label>
              <div className="relative">
                <div className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-slate-400 scale-90 md:scale-100">
                  <Calendar size={16} />
                </div>
                <input 
                  type="date" 
                  value={dob} 
                  onChange={e => setDob(e.target.value)}
                  className="w-full pl-9 md:pl-11 pr-4 py-2.5 md:py-3 bg-white border border-slate-200 rounded-lg md:rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex flex-col justify-end gap-1.5 mt-2 md:mt-0">
              <div className="flex items-center gap-3 w-full">
                <button 
                  type="button" 
                  disabled={isSaving}
                  onClick={() => router.push('/dashboard')}
                  className="hidden md:block flex-1 py-2.5 md:py-3 rounded-lg md:rounded-xl border border-slate-200 bg-white text-slate-700 text-xs md:text-sm font-bold hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  disabled={isSaving}
                  onClick={handleLogout}
                  className="md:hidden flex-1 py-2.5 md:py-3 rounded-lg md:rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs md:text-sm font-bold hover:bg-red-100 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <LogOut size={16} /> Logout
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-1 py-2.5 md:py-3 rounded-lg md:rounded-xl bg-[#0F62FE] text-white text-xs md:text-sm font-bold hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                      Saving...
                    </>
                  ) : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        );

      case "contact":
        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 shrink-0">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-800">Phone Number</label>
                <div className="relative">
                  <div className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-slate-400 scale-90 md:scale-100">
                    <Phone size={16} />
                  </div>
                  <input 
                    type="text" 
                    value={mobile} 
                    onChange={e => setMobile(e.target.value)}
                    className="w-full pl-9 md:pl-11 pr-20 py-2.5 md:py-3 bg-white border border-slate-200 rounded-lg md:rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 bg-green-50 text-green-600 rounded-md text-[10px] font-bold">
                    <CheckCircle size={10} /> Verified
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-800">Email Address</label>
                <div className="relative">
                  <div className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-slate-400 scale-90 md:scale-100">
                    <Mail size={16} />
                  </div>
                  <input 
                    type="email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-9 md:pl-11 pr-20 py-2.5 md:py-3 bg-white border border-slate-200 rounded-lg md:rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 bg-green-50 text-green-600 rounded-md text-[10px] font-bold">
                    <CheckCircle size={10} /> Verified
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 shrink-0">
              <label className="text-xs font-bold text-slate-800">Address</label>
              <div className="relative">
                <div className="absolute left-3 md:left-4 top-2.5 md:top-3.5 text-slate-400 scale-90 md:scale-100">
                  <MapPin size={16} />
                </div>
                <textarea 
                  value={address} 
                  onChange={e => setAddress(e.target.value)}
                  rows={2}
                  className="w-full pl-9 md:pl-11 pr-4 py-2.5 md:py-3 bg-white border border-slate-200 rounded-lg md:rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm resize-none"
                />
              </div>
            </div>
          </>
        );

      case "notifications":
        return (
          <div className="hidden md:flex flex-col gap-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <h4 className="text-sm font-bold text-slate-800">SMS Status Alerts</h4>
                <p className="text-xs font-medium text-slate-500 mt-0.5">Receive real-time text messages for updates.</p>
              </div>
              <input
                type="checkbox"
                checked={notifySms}
                onChange={(e) => setNotifySms(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <h4 className="text-sm font-bold text-slate-800">Email Digest & Tracking</h4>
                <p className="text-xs font-medium text-slate-500 mt-0.5">Formal email acknowledgements with tracking links.</p>
              </div>
              <input
                type="checkbox"
                checked={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <h4 className="text-sm font-bold text-slate-800">Civic Alerts</h4>
                <p className="text-xs font-medium text-slate-500 mt-0.5">Urgent municipal announcements and alerts.</p>
              </div>
              <input
                type="checkbox"
                checked={notifyAlerts}
                onChange={(e) => setNotifyAlerts(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
            </div>
          </div>
        );

      case "language":
        return (
          <div className="flex flex-col gap-1.5 w-full md:w-1/2 shrink-0">
            <label className="text-xs font-bold text-slate-800">App Language</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Globe size={16} />
              </div>
              <input 
                type="text" 
                value={language} 
                onChange={e => setLanguage(e.target.value)}
                className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                <ChevronDown size={16} />
              </div>
            </div>
          </div>
        );

      case "help":
        return (
          <div className="flex flex-col gap-4 items-center justify-center p-8 text-center bg-slate-50 border border-slate-100 rounded-2xl">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-2">
              <HelpCircle size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Need Assistance?</h3>
            <p className="text-sm font-medium text-slate-500 max-w-md">
              If you have any questions or need help with the CMS application, our support team is available 24/7.
            </p>
            <div className="flex gap-4 mt-4">
              <button type="button" className="px-6 py-2 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
                View FAQs
              </button>
              <button type="button" className="px-6 py-2 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20">
                Contact Support
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case "personal": return "Personal Information";
      case "contact": return "Contact Information";
      case "notifications": return "Notification Preferences";
      case "language": return "Language Settings";
      case "help": return "Help & Support";
      default: return "Edit Profile";
    }
  };

  const getTabSubtitle = () => {
    switch (activeTab) {
      case "personal": return "Update your name, date of birth, and gender";
      case "contact": return "Update your phone, email, and address";
      case "notifications": return "Manage how you receive alerts and messages";
      case "language": return "Choose your preferred language for the application";
      case "help": return "Find answers or contact our support team";
      default: return "Update your profile information";
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-0 md:p-6 lg:p-8 flex flex-col items-center">
      <div className="max-w-5xl w-full h-full flex flex-col gap-0 md:gap-6 pb-0 md:pb-20">
        
        {/* Top Header & Navbar Card */}
        <div className="bg-white rounded-t-3xl md:rounded-3xl shadow-none md:shadow-sm border-b md:border border-slate-100 overflow-hidden flex flex-col shrink-0">
          
          {/* Header Banner */}
          <div className="h-16 md:h-32 bg-gradient-to-r from-sky-100 via-blue-50 to-indigo-50 relative overflow-hidden">
            {/* Decorative cityscape pattern */}
            <div className="absolute bottom-0 left-0 right-0 h-12 md:h-20 flex items-end justify-center opacity-30">
              <div className="w-12 h-10 bg-sky-500 mx-1 rounded-t-md"></div>
              <div className="w-16 h-16 bg-sky-600 mx-1 rounded-t-md"></div>
              <div className="w-14 h-8 bg-sky-400 mx-1 rounded-t-md"></div>
              <div className="w-20 h-20 bg-sky-700 mx-1 rounded-t-md"></div>
              <div className="w-12 h-12 bg-sky-500 mx-1 rounded-t-md"></div>
              <div className="w-16 h-24 bg-sky-800 mx-1 rounded-t-md"></div>
              <div className="w-12 h-16 bg-sky-600 mx-1 rounded-t-md"></div>
            </div>
            {/* Trees */}
            <div className="absolute bottom-0 left-0 right-0 h-8 flex items-end justify-center opacity-60">
              <div className="w-12 h-8 bg-green-500 rounded-full -mb-4 mx-1"></div>
              <div className="w-16 h-10 bg-green-400 rounded-full -mb-5 mx-1"></div>
              <div className="w-14 h-8 bg-green-500 rounded-full -mb-4 mx-1"></div>
              <div className="w-20 h-12 bg-green-400 rounded-full -mb-6 mx-1"></div>
            </div>
          </div>
          
          {/* Profile Info Overlay */}
          <div className="px-4 sm:px-8 pb-2 md:pb-4 flex flex-col sm:flex-row items-center sm:items-end gap-2 sm:gap-6 relative z-10 -mt-7 md:-mt-12">
            
            {/* Avatar */}
            <div className="relative shrink-0 group">
              <div className="w-14 h-14 md:w-24 md:h-24 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xl md:text-3xl font-extrabold border-4 border-white shadow-sm overflow-hidden relative">
                {profileImage ? (
                  <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  initials
                )}
                {/* Hover overlay for upload */}
                <div 
                  className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={() => document.getElementById('top-profile-upload')?.click()}
                >
                  <Camera size={24} className="text-white" />
                </div>
              </div>
              <button 
                type="button"
                onClick={() => document.getElementById('top-profile-upload')?.click()}
                className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white border-2 border-white hover:bg-blue-700 transition-colors shadow-sm cursor-pointer z-10"
              >
                <Camera size={14} />
              </button>
              <input 
                id="top-profile-upload"
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleImageUpload}
              />
            </div>
            
            {/* User Details */}
            <div className="flex-1 flex flex-col sm:flex-row items-center sm:items-start justify-between w-full gap-2 md:gap-3 pt-0.5 md:pt-1 sm:pt-0">
              <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <h2 className="text-xl md:text-2xl font-extrabold text-slate-800 leading-tight">{name}</h2>
                  <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-600 rounded-md text-[10px] font-bold">
                    <CheckCircle size={10} /> Verified
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 md:gap-3 mt-1 text-xs md:text-sm font-medium text-slate-500">
                  <span className="flex items-center gap-1"><Phone size={12} className="md:w-3 md:h-3 text-slate-400" /> {mobile}</span>
                  <span className="hidden sm:inline text-slate-300">•</span>
                  <span className="flex items-center gap-1"><Mail size={12} className="md:w-3 md:h-3 text-slate-400" /> {email}</span>
                </div>
              </div>
              
              <button onClick={handleLogout} className="hidden md:flex px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl bg-red-50 text-red-600 font-bold text-xs items-center gap-2 hover:bg-red-100 transition-colors shrink-0 mt-2 md:mt-0">
                <LogOut size={12} className="md:w-[14px] md:h-[14px]" /> Logout
              </button>
            </div>
          </div>
          
          {/* Horizontal Navbar */}
          <div className="px-0 sm:px-8 border-t border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-1 md:gap-2 overflow-x-auto no-scrollbar scroll-smooth px-2 md:px-0">
              <NavTab icon={<User size={16} />} label="Personal Info" active={activeTab === 'personal'} onClick={() => { setActiveTab('personal'); setSaveMessage({ type: "", text: "" }); }} />
              <NavTab icon={<Phone size={16} />} label="Contact Info" active={activeTab === 'contact'} onClick={() => { setActiveTab('contact'); setSaveMessage({ type: "", text: "" }); }} />
              <NavTab icon={<Bell size={16} />} label="Notifications" active={activeTab === 'notifications'} onClick={() => { setActiveTab('notifications'); setSaveMessage({ type: "", text: "" }); }} className="hidden md:flex" />
              <NavTab icon={<Globe size={16} />} label="Language" active={activeTab === 'language'} onClick={() => { setActiveTab('language'); setSaveMessage({ type: "", text: "" }); }} />
              <div className="w-px h-6 bg-slate-200 mx-2 shrink-0 hidden md:block"></div>
              <NavTab icon={<HelpCircle size={16} />} label="Help" active={activeTab === 'help'} onClick={() => { setActiveTab('help'); setSaveMessage({ type: "", text: "" }); }} />
            </div>
          </div>
        </div>
        
        {/* Content Area */}
        <div className="bg-white md:rounded-3xl shadow-none md:shadow-sm border-0 md:border border-slate-100 flex flex-col overflow-hidden flex-1">
          <form onSubmit={handleSave} className="flex flex-col h-full">
            
            {/* Form Header */}
            <div className="hidden md:flex px-4 sm:px-8 py-2 md:py-5 border-b border-slate-100 items-center justify-between shrink-0">
              <div className="flex items-center gap-2 md:gap-3">
                <button type="button" onClick={() => router.push('/dashboard')} className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors shrink-0">
                  <ChevronLeft size={16} className="scale-75 md:scale-100" />
                </button>
                <div>
                  <h1 className="text-base md:text-xl font-extrabold text-slate-800 leading-tight">{getTabTitle()}</h1>
                  <p className="hidden md:block text-xs font-medium text-slate-500 mt-0.5">{getTabSubtitle()}</p>
                </div>
              </div>
            </div>
            
            {/* Form Fields (Dynamic based on Tab) */}
            <div className="px-4 sm:px-8 py-4 md:py-6 flex-1 overflow-y-auto flex flex-col gap-3.5 md:gap-5">
              {saveMessage.text && (
                <div className={`p-3.5 mb-1 rounded-xl border flex items-center gap-2.5 text-sm font-bold animate-in fade-in slide-in-from-top-2 ${saveMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  {saveMessage.type === 'success' ? <CheckCircle size={18} /> : <Info size={18} />}
                  {saveMessage.text}
                </div>
              )}
              {renderTabContent()}
            </div>
            
            {/* Footer for non-personal and non-help tabs */}
            {activeTab !== 'help' && activeTab !== 'personal' && (
              <div className="px-4 sm:px-8 py-3 md:py-5 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-white md:bg-slate-50/50 mt-auto">
                <button 
                  type="button" 
                  disabled={isSaving}
                  onClick={() => router.push('/dashboard')}
                  className="hidden md:block flex-1 md:flex-none px-6 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  disabled={isSaving}
                  onClick={handleLogout}
                  className="md:hidden flex-1 md:flex-none px-6 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-bold hover:bg-red-100 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <LogOut size={16} /> Logout
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-1 md:flex-none px-8 py-2.5 rounded-xl bg-[#0F62FE] text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                      Saving...
                    </>
                  ) : "Save Changes"}
                </button>
              </div>
            )}
          </form>
        </div>
        
      </div>
    </div>
  );
}

function NavTab({ icon, label, active = false, onClick, className = "" }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void, className?: string }) {
  return (
    <button 
      type="button" 
      onClick={onClick}
      className={`flex items-center gap-2 px-3 md:px-4 py-3 md:py-3.5 border-b-2 font-bold text-xs md:text-sm transition-all whitespace-nowrap shrink-0 ${active ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'} ${className}`}
    >
      <span className={`${active ? 'text-blue-600' : 'text-slate-400'} scale-90 md:scale-100`}>
        {icon}
      </span>
      {label}
    </button>
  );
}
