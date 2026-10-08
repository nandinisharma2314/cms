"use client";

import React from "react";
import { usePathname } from "next/navigation";
import MobileBottomNav from "@/components/Dashboard/MobileBottomNav";
import { TopHeader } from "@/components/Dashboard/TopHeader";
import { EndUserSessionProvider } from "@/lib/session";

function DashboardShell({ children }: { children: React.ReactNode }) {
  // The phone home screen has its own greeting header instead.
  const isHome = usePathname() === "/dashboard";
  return (
    <div className="relative mx-auto flex w-full max-w-6xl flex-1 overflow-hidden bg-white font-sans">
      <main className="relative z-10 flex h-full flex-1 flex-col overflow-y-auto pb-32 md:pb-0">
        <TopHeader hideOnMobile={isHome} />
        {children}
      </main>
      <MobileBottomNav />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <EndUserSessionProvider>
      <DashboardShell>{children}</DashboardShell>
    </EndUserSessionProvider>
  );
}
