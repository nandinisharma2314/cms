"use client";

import React, { useEffect, useState } from"react";
import { Search, Bell, ChevronDown } from"lucide-react";

const Header = () => {
  const [userName, setUserName] = useState("User");
  const [initials, setInitials] = useState("U");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) {
        const u = JSON.parse(stored);
        if (u.name) {
          setUserName(u.name);
          const parts = u.name.split(" ");
          if (parts.length > 1) {
            setInitials(parts[0][0].toUpperCase() + parts[1][0].toUpperCase());
          } else {
            setInitials(u.name.substring(0, 2).toUpperCase());
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

 return (
 <header className="flex items-start justify-between mb-4">
 {/* Left Greeting */}
 <div>
 <p className="text-slate-500 text-sm font-medium">Good Morning,</p>
 <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2 capitalize">
 {userName} <span className="text-xl">👋</span>
 </h1>
 <p className="text-slate-500 text-xs mt-0.5">
 Together for a cleaner, safer and better community.
 </p>
 </div>

 {/* Right Controls */}
 <div className="flex items-center gap-2 md:gap-4">
 {/* Search */}
 <div className="relative hidden md:block">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
 <input
 type="text"
 placeholder="Search complaints, locations or services..."
 className="pl-10 pr-4 py-2.5 bg-white border-none w-80 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] text-slate-700 placeholder-slate-400"
 />
 </div>

 {/* Notifications */}
 <button className="relative w-10 h-10 bg-white flex items-center justify-center shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] text-slate-600 hover:text-blue-600 transition-colors">
 <Bell className="w-5 h-5" />
 <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 border-2 border-white"></span>
 </button>

 {/* Profile */}
 <button className="flex items-center gap-2 bg-white p-1 md:pr-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] hover:bg-slate-50 transition-colors">
 <div className="w-8 h-8 bg-blue-100 text-blue-700 font-semibold flex items-center justify-center text-sm">
 {initials}
 </div>
 <ChevronDown className="hidden md:block w-4 h-4 text-slate-400" />
 </button>
 </div>
 </header>
 );
};

export default Header;
