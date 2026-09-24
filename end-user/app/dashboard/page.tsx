import React from"react";
import Banner from"@/components/Dashboard/Banner";
import StatCard from"@/components/Dashboard/StatCard";
import RecentComplaints from"@/components/Dashboard/RecentComplaints";
import RecentActivity from"@/components/Dashboard/RecentActivity";
import QuickActions from"@/components/Dashboard/QuickActions";

export default function DashboardPage() {
 return (
 <>
 <Banner />
 <QuickActions />
 <StatCard />
 <div className="flex flex-col md:flex-row gap-4 items-stretch flex-1 min-h-0">
 <RecentComplaints />
 <div className="hidden md:block">
 <RecentActivity />
 </div>
 </div>
 </>
 );
}
