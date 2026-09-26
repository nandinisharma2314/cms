import React from "react";
import Greeting from "@/components/Dashboard/Greeting";
import ShortcutCards from "@/components/Dashboard/ShortcutCards";
import StatCard from "@/components/Dashboard/StatCard";
import RecentComplaints from "@/components/Dashboard/RecentComplaints";
import RecentActivity from "@/components/Dashboard/RecentActivity";

export default function DashboardPage() {
  return (
    <div className="flex-1 bg-gradient-to-b from-[#e5effd] via-[#f0f5fd] to-slate-50 md:min-h-0 md:overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 pb-6 pt-6 md:gap-5 md:px-8 md:py-8">
        <Greeting />
        <ShortcutCards />
        <StatCard />
        <div className="flex items-stretch gap-5">
          <RecentComplaints />
          <div className="hidden overflow-hidden rounded-2xl md:flex">
            <RecentActivity />
          </div>
        </div>
      </div>
    </div>
  );
}
