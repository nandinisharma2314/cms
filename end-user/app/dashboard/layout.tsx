"use client";

import React, { useState } from"react";
import { usePathname } from "next/navigation";
import MobileBottomNav from"@/components/Dashboard/MobileBottomNav";
import { TopHeader } from"@/components/Dashboard/TopHeader";
import { EndUserSessionProvider, useEndUser } from"@/lib/endUserSession";

function DashboardShell({ children }: { children: React.ReactNode }) {
 const { profile, logout } = useEndUser();
 const [searchQuery, setSearchQuery] = useState("");
 const isHome = usePathname() === "/dashboard";

 return (
 <div className="flex h-screen overflow-hidden bg-slate-50 md:bg-slate-100 font-sans relative">
 <main className="flex-1 flex flex-col overflow-y-auto md:overflow-hidden h-screen pb-24 md:pb-0 relative z-10 w-full">
 <TopHeader
 searchQuery={searchQuery}
 onSearchChange={setSearchQuery}
 userName={profile.name}
 userEmail={profile.email}
 userRole={profile.role.name}
 onSignOut={logout}
 hideOnMobile={isHome}
 />
 {children}
 </main>
 <MobileBottomNav />
 </div>
 );
}

export default function DashboardLayout({
 children,
}: {
 children: React.ReactNode;
}) {
 return (
 <EndUserSessionProvider>
 <DashboardShell>{children}</DashboardShell>
 </EndUserSessionProvider>
 );
}
