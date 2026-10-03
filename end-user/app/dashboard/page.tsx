import React from "react";
import Greeting from "@/components/Dashboard/Greeting";
import StatCard from "@/components/Dashboard/StatCard";
import RecentComplaints from "@/components/Dashboard/RecentComplaints";
import RecentActivity from "@/components/Dashboard/RecentActivity";

export default function DashboardPage() {
  return (
    <div className="flex-1 md:min-h-0 md:overflow-y-auto">
      <div className="flex flex-col gap-3 p-2 pb-6 md:gap-5 md:px-4 md:py-8">
        <Greeting />
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
