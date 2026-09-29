"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { SessionProvider } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { TopHeader } from "@/components/TopHeader";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // The page the mobile menu was opened on: navigating elsewhere closes it.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const mobileOpen = menuOpenOn === pathname;

  return (
    <SessionProvider>
      <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMenuOpenOn(null)}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <TopHeader onOpenMenu={() => setMenuOpenOn(pathname)} />
          <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 space-y-6 max-w-[1600px] w-full mx-auto">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}
