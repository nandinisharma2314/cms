"use client";

import React, { useState, useEffect } from"react";
import { useRouter } from"next/navigation";
import MobileBottomNav from"@/components/Dashboard/MobileBottomNav";
import { TopHeader } from"@/components/Dashboard/TopHeader";

export default function DashboardLayout({
 children,
}: {
 children: React.ReactNode;
}) {
 const router = useRouter();
 const [searchQuery, setSearchQuery] = useState("");
 const [isAuthorized, setIsAuthorized] = useState(false);

 useEffect(() => {
 const token = localStorage.getItem("access_token");
 if (!token) {
 router.replace("/login");
 } else {
 setIsAuthorized(true);
 }
 }, [router]);

 if (!isAuthorized) {
 return (
 <div className="flex h-screen items-center justify-center bg-slate-50">
 <div className="flex flex-col items-center gap-2">
 <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
 <span className="text-xs text-slate-500 font-medium">Checking session...</span>
 </div>
 </div>
 );
 }

 return (
 <div className="flex h-screen overflow-hidden bg-slate-50 md:bg-slate-100 font-sans relative">
 <main className="flex-1 flex flex-col overflow-y-auto md:overflow-hidden h-screen pb-24 md:pb-0 relative z-10 w-full">
 <TopHeader searchQuery={searchQuery} onSearchChange={setSearchQuery} />
 {children}
 </main>
 <MobileBottomNav />
 </div>
 );
}
