"use client";

import React, { useState } from "react";
import { SessionProvider } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { TopHeader } from "@/components/TopHeader";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <SessionProvider>
      <div className="flex min-h-screen bg-[#f8fafc] text-slate-900 font-sans antialiased overflow-x-hidden">
        <Sidebar
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <TopHeader />
          <main className="flex-1 p-8 space-y-7 max-w-[1600px] w-full mx-auto">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}
