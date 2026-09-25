"use client";

import React, { useState } from"react";
import MobileBottomNav from"@/components/Dashboard/MobileBottomNav";
import { TopHeader } from"@/components/Dashboard/TopHeader";
import { CitizenSessionProvider, useCitizen } from"@/lib/citizenSession";

function DashboardShell({ children }: { children: React.ReactNode }) {
 const { profile, logout } = useCitizen();
 const [searchQuery, setSearchQuery] = useState("");

 return (
 <div className="flex h-screen overflow-hidden bg-slate-50 md:bg-slate-100 font-sans relative">
 <main className="flex-1 flex flex-col overflow-y-auto md:overflow-hidden h-screen pb-24 md:pb-0 relative z-10 w-full">
 <TopHeader
 searchQuery={searchQuery}
 onSearchChange={setSearchQuery}
 userName={profile.name}
 userEmail={profile.email}
 onSignOut={logout}
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
 <CitizenSessionProvider>
 <DashboardShell>{children}</DashboardShell>
 </CitizenSessionProvider>
 );
}
