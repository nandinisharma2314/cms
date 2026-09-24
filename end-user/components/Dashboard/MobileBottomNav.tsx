"use client";

import React from"react";
import Link from"next/link";
import { usePathname } from"next/navigation";
import { Home, FileText, Plus, Bell, User } from"lucide-react";

const MobileBottomNav = ({
 activeTab,
 onTabChange,
 onCenterAction,
}: {
 activeTab?: string;
 onTabChange?: React.Dispatch<React.SetStateAction<string>>;
 onCenterAction?: () => void;
}) => {
 const pathname = usePathname();

 const navItems = [
 { name:"Home", icon: Home, href:"/dashboard", exact: true },
 { name:"My Complaints", icon: FileText, href:"/dashboard/complaints" },
 ];

 const rightNavItems = [
 {
 name:"Notifications",
 icon: Bell,
 href:"/dashboard/notifications",
 hasDot: true,
 },
 { name:"Profile", icon: User, href:"/dashboard/profile" },
 ];

 return (
 <div className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-100 flex justify-between items-center px-4 pb-4 pt-3 z-50 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
 {/* Left Items */}
 <div className="flex justify-around flex-1 pr-6">
 {navItems.map((item) => {
 const isActive = item.exact
 ? pathname === item.href
 : pathname?.startsWith(item.href);
 return (
 <Link
 key={item.name}
 href={item.href}
 className={`flex flex-col items-center gap-1 min-w-[64px] ${isActive ?"text-blue-600" :"text-slate-400"}`}
 >
 <item.icon
 className={`w-6 h-6 ${isActive ?"text-blue-600" :"text-slate-400"}`}
 />
 <span
 className={`text-[10px] ${isActive ?"font-semibold text-blue-600" :"font-medium"}`}
 >
 {item.name}
 </span>
 </Link>
 );
 })}
 </div>

 {/* Center FAB */}
 <div className="absolute left-1/2 -top-5 -translate-x-1/2">
 <Link
 href="/dashboard/complaints/new"
 className="bg-blue-600 hover:bg-blue-700 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-blue-600/30 transition-transform active:scale-95"
 >
 <Plus size={28} />
 </Link>
 </div>

 {/* Right Items */}
 <div className="flex justify-around flex-1 pl-6">
 {rightNavItems.map((item) => {
 const isActive = pathname?.startsWith(item.href);
 return (
 <Link
 key={item.name}
 href={item.href}
 className={`flex flex-col items-center gap-1 min-w-[64px] ${isActive ?"text-blue-600" :"text-slate-400"}`}
 >
 <div className="relative">
 <item.icon
 className={`w-6 h-6 ${isActive ?"text-blue-600" :"text-slate-400"}`}
 />
 {item.hasDot && (
 <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 border-2 border-white transform translate-x-1/4 -translate-y-1/4"></span>
 )}
 </div>
 <span
 className={`text-[10px] ${isActive ?"font-semibold text-blue-600" :"font-medium"}`}
 >
 {item.name}
 </span>
 </Link>
 );
 })}
 </div>
 </div>
 );
};

export default MobileBottomNav;
