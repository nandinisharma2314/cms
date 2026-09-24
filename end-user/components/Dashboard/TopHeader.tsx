"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, SlidersHorizontal, LogOut, ChevronRight, Bell } from "lucide-react";
import { SearchIcon, ChevronDownIcon } from "./DashboardIcons";
import NotificationPanel from "./NotificationPanel";
import { apis } from "@/lib/apis";

interface TopHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNotificationClick?: () => void;
  onProfileClick?: () => void;
  userName?: string;
}

export function TopHeader({
  searchQuery,
  onSearchChange,
  onNotificationClick,
  onProfileClick,
  userName = "Rahul Sharma",
}: TopHeaderProps) {
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentName, setCurrentName] = useState(userName);
  const [currentEmail, setCurrentEmail] = useState("rahul.sharma@example.com");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifButtonRef = useRef<HTMLDivElement>(null);

  // Sync profile data and unread notification count
  useEffect(() => {
    const handleProfileUpdate = () => {
      try {
        const stored = localStorage.getItem("user");
        if (stored) {
          const u = JSON.parse(stored);
          if (u.name) setCurrentName(u.name);
          if (u.email) setCurrentEmail(u.email);
          else if (u.mobile) setCurrentEmail(u.mobile);
        }
        const storedImage = localStorage.getItem("user_profile_image");
        if (storedImage) {
          setProfileImage(storedImage);
        }
      } catch (e) {
        console.error("Error reading stored user profile", e);
      }
    };
    
    handleProfileUpdate();
    window.addEventListener("profileUpdated", handleProfileUpdate);

    // Fetch live profile
    apis.profile
      .getProfile()
      .then((res) => {
        if (res && res.success && res.user) {
          if (res.user.name) setCurrentName(res.user.name);
          if (res.user.email) setCurrentEmail(res.user.email);
          else if (res.user.mobile) setCurrentEmail(res.user.mobile);
        }
      })
      .catch(() => {});

    // Fetch initial unread count
    const fetchUnread = () => {
      apis.notifications
        .getNotifications()
        .then((res) => {
          if (res && res.success) {
            setUnreadCount(res.unread_count || 0);
          }
        })
        .catch(() => {});
    };

    fetchUnread();
    // Poll every 30s for live updates
    const interval = setInterval(fetchUnread, 30000);
    return () => {
      clearInterval(interval);
      window.removeEventListener("profileUpdated", handleProfileUpdate);
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Initials
  const displayName = currentName || (currentEmail ? currentEmail.split("@")[0] : "") || "RS";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "RS";

  return (
    <>
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 lg:px-12 py-2 md:py-3 flex items-center justify-between sticky top-0 z-30">
        {/* Left: Logo */}
        <div
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => router.push("/dashboard")}
        >
          <div className="bg-indigo-600 p-1.5 md:p-2 rounded flex items-center justify-center">
            <Megaphone className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
          <span className="text-indigo-900 font-extrabold tracking-wider text-lg md:text-xl uppercase">
            CMS
          </span>
        </div>

        {/* Right: Search, Notifications & Profile */}
        <div className="flex items-center gap-3 md:gap-5 shrink-0">
          {/* Search Bar */}
          <div className="hidden md:flex relative">
            <div className="flex items-center bg-slate-50 border border-slate-200 px-4 py-2 w-64 lg:w-80 transition-colors focus-within:bg-white focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
              <SearchIcon size={16} color="#94a3b8" />
              <input
                type="text"
                className="bg-transparent border-none outline-none w-full ml-3 text-sm text-slate-700 placeholder-slate-400"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
          </div>

          {/* Notifications button with Live Popover */}
          <div className="relative hidden md:block" ref={notifButtonRef}>
            <button
              type="button"
              className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-colors relative cursor-pointer"
              onClick={() => {
                setIsNotificationOpen(!isNotificationOpen);
                if (onNotificationClick) onNotificationClick();
              }}
              aria-label="View live notifications"
            >
              <Bell size={20} className="text-slate-600 hover:text-indigo-600 transition-colors" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white rounded-full text-[10px] font-extrabold flex items-center justify-center ring-2 ring-white shadow-sm shadow-red-500/40 animate-pulse">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Live Notification Popover */}
            <NotificationPanel
              isOpen={isNotificationOpen}
              onClose={() => setIsNotificationOpen(false)}
              onUnreadChange={setUnreadCount}
            />
          </div>

          {/* Profile Menu Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              className="flex items-center gap-3 hover:bg-slate-50 p-1 md:pr-3 transition-colors cursor-pointer rounded-xl"
              onClick={() => {
                setIsDropdownOpen(!isDropdownOpen);
                if (onProfileClick) onProfileClick();
              }}
              aria-label="User Profile menu"
            >
              <div className="w-10 h-10 bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-600/20 rounded-xl overflow-hidden shrink-0">
                {profileImage ? (
                  <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-white">{initials}</span>
                )}
              </div>
              <div className="hidden md:flex flex-col items-start text-left">
                <span className="text-sm font-bold text-slate-800 leading-tight">
                  {currentName}
                </span>
                <span className="text-[11px] font-medium text-slate-500 leading-tight mt-0.5">
                  Community Member
                </span>
              </div>
              <span className="hidden md:block ml-1">
                <ChevronDownIcon size={14} color="#94a3b8" />
              </span>
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white shadow-xl border border-slate-100 rounded-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="p-4 border-b border-slate-100 bg-slate-50/70">
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {currentName}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {currentEmail}
                  </div>
                </div>

                <div className="p-2 flex flex-col gap-1">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors flex items-center justify-between group cursor-pointer"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      router.push("/dashboard/profile");
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <SlidersHorizontal size={15} className="text-slate-400 group-hover:text-indigo-600" />
                      <span>Profile Settings</span>
                    </div>
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-600 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>

                <div className="border-t border-slate-100 p-2">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-semibold flex items-center gap-2 cursor-pointer"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      localStorage.removeItem("access_token");
                      localStorage.removeItem("user");
                      router.push("/login");
                    }}
                  >
                    <LogOut size={15} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
