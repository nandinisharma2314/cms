"use client";

import React from "react";
import { usePathname } from "next/navigation";
import MobileBottomNav from "@/components/portal/Dashboard/MobileBottomNav";
import { TopHeader } from "@/components/portal/Dashboard/TopHeader";
import { EndUserSessionProvider } from "@/lib/portalSession";

function DashboardShell({ children }: { children: React.ReactNode }) {
  // The phone home screen has its own greeting header instead.
  const isHome = usePathname() === "/dashboard";
  return (
    <div className="relative mx-auto flex h-full w-full max-w-6xl flex-1 flex-col overflow-hidden bg-white font-sans">
      <TopHeader />
      <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto pb-32 md:pb-0">{children}</main>
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
