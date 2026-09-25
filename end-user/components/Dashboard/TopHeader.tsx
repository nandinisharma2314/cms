"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Megaphone } from "lucide-react";
import { SearchIcon, ChevronDownIcon } from"./DashboardIcons";
import NotificationBell from"./NotificationBell";

interface TopHeaderProps {
 searchQuery: string;
 onSearchChange: (query: string) => void;
 onNotificationClick?: () => void;
 onProfileClick?: () => void;
 onSignOut?: () => void;
 userName?: string;
 userEmail?: string;
}

export function TopHeader({
 searchQuery,
 onSearchChange,
 onProfileClick,
 onSignOut,
 userName ="Citizen",
 userEmail ="",
}: TopHeaderProps) {
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const initials =
    userName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "C";

  return (
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
 <NotificationBell />

 <div className="relative">
 <button
 type="button"
 className="flex items-center gap-3 hover:bg-slate-50 p-1 pr-3 transition-colors border border-transparent hover:border-slate-200"
 onClick={() => {
 setIsDropdownOpen(!isDropdownOpen);
 if (onProfileClick) onProfileClick();
 }}
 aria-label="User Profile menu"
 >
 <div className="w-10 h-10 bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-600/20">
 <span className="text-sm font-bold text-white">
 {userName.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
 </span>
 </div>
 <div className="hidden md:flex flex-col items-start text-left">
 <span className="text-sm font-bold text-slate-800 leading-tight">
 {userName}
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
 <div className="absolute right-0 top-full mt-2 w-56 bg-white shadow-lg border border-slate-100 overflow-hidden z-50">
 <div className="p-4 border-b border-slate-100 bg-slate-50/50">
 <div className="text-sm font-bold text-slate-800">
 {userName}
 </div>
 <div className="text-xs text-slate-500 mt-1">
 {userEmail}
 </div>
 </div>
 <div className="p-2 flex flex-col gap-1">
 <button
 type="button"
 className="text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
 onClick={() => setIsDropdownOpen(false)}
 >
 Profile Settings
 </button>
 <button
 type="button"
 className="text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
 onClick={() => setIsDropdownOpen(false)}
 >
 My Complaints History
 </button>
 </div>
 <div className="border-t border-slate-100 p-2">
 <button
 type="button"
 className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
 onClick={() => {
 setIsDropdownOpen(false);
 if (onSignOut) onSignOut();
 else router.push("/login");
 }}
 >
 Sign Out
 </button>
 </div>
 </div>
 )}
 </div>
 </div>
 </header>
 );
}
