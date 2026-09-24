"use client";

import React, { useState, useMemo } from"react";
import { useRouter } from"next/navigation";
import { useEffect } from"react";
import { apis, BACKEND_URL } from"../../lib/apis";

import { TopHeader } from"./TopHeader";
import { HeroBanner } from"./HeroBanner";
import QuickActions from"./QuickActions";
import { StatsCards } from"./StatsCards";
import {
 RecentComplaintsTable,
 sampleComplaints,
 ComplaintItem,
} from"./RecentComplaintsTable";
import { RecentComplaintsList } from"./RecentComplaintsList";
import { RecentActivityFeed, sampleActivities } from"./RecentActivityFeed";
import MobileBottomNav from"./MobileBottomNav";

export function DashboardView() {
 const router = useRouter();
 const [activeTab, setActiveTab] = useState<string>("home");
 const [searchQuery, setSearchQuery] = useState<string>("");
 const [selectedStatusFilter, setSelectedStatusFilter] =
 useState<string>("all");
 const [activeToast, setActiveToast] = useState<string>("");
  const [userName, setUserName] = useState<string>("User");

 const [complaintsList, setComplaintsList] = useState<any[]>(sampleComplaints);
 const [stats, setStats] = useState({
 total: 0,
 open: 0,
 resolved: 0,
 inProgress: 0,
 });

 function triggerToast(msg: string) {
 setActiveToast(msg);
 setTimeout(() => setActiveToast(""), 3500);
 }

 useEffect(() => {
 const fetchData = async () => {
 try {
 const [complaintsRes, statsRes, profileRes] = await Promise.all([
 apis.complaints.getComplaints(),
 apis.complaints.getDashboardStats(),
          apis.profile.getProfile().catch(() => null),
 ]);

 if (Array.isArray(complaintsRes)) {
 const formatted = complaintsRes.map((c) => ({
 id: c.id,
 cmpId: c.id,
 title: c.title,
 date: c.date,
 status: c.status ==="Submitted" ?"Open" : c.status,
 department: c.department,
 location: c.location ||"Dashboard",
 img:
 c.attachments && c.attachments.length > 0
 ? `${BACKEND_URL ||"http://localhost:5000"}${c.attachments[0].file_path}`
 :"https://images.unsplash.com/photo-1512403754473-27835f7b9984?w=150&h=150&fit=crop",
 }));
 setComplaintsList(formatted);
 }

 if (profileRes && profileRes.success && profileRes.user?.name) {
          setUserName(profileRes.user.name);
        }

        if (statsRes && statsRes.total !== undefined) {
 setStats({
 total: statsRes.total,
 open: statsRes.total - statsRes.in_progress - statsRes.resolved,
 inProgress: statsRes.in_progress,
 resolved: statsRes.resolved,
 });
 }
 } catch (err) {
 console.error("Failed to fetch dashboard data:", err);
 }
 };
 fetchData();
 }, []);

 // Filter complaints based on search query & status filter
 const filteredComplaints = useMemo(() => {
 return complaintsList.filter((c) => {
 const matchesSearch =
 searchQuery.trim() ==="" ||
 c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
 c.cmpId.toLowerCase().includes(searchQuery.toLowerCase()) ||
 c.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
 c.department.toLowerCase().includes(searchQuery.toLowerCase());

 const matchesStatus =
 selectedStatusFilter ==="all" ||
 (selectedStatusFilter ==="open" && c.status ==="Open") ||
 (selectedStatusFilter ==="resolved" && c.status ==="Resolved") ||
 (selectedStatusFilter ==="in_progress" && c.status ==="In Progress");

 return matchesSearch && matchesStatus;
 });
 }, [complaintsList, searchQuery, selectedStatusFilter]);

 return (
 <div className="min-h-screen bg-[#f4f7fa] font-sans selection:bg-indigo-100 flex flex-col">
 {/* Toast Notification */}
 {activeToast && (
 <div
 className="fixed top-4 right-4 bg-slate-800 text-white px-6 py-3 shadow-2xl z-50 animate-in slide-in-from-top-2"
 role="status"
 >
 <span className="font-medium">{activeToast}</span>
 </div>
 )}

 {/* Main Content Area */}
 <main className="flex-1 flex flex-col w-full">
 {/* Top Header Bar */}
 <TopHeader
 searchQuery={searchQuery}
 onSearchChange={setSearchQuery}
 userName={userName}
 onNotificationClick={() =>
 triggerToast("You have 3 unread notifications")
 }
 onProfileClick={() => {}}
 />

 {/* Scrollable Body Content */}
 <div className="flex-1 overflow-y-auto pb-28 md:pb-8">
 <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-6">
 {/* Hero Call-to-Action Banner */}
 <HeroBanner
 onRegisterClick={() => router.push("/dashboard/register")}
          userName={userName}
 />

 {/* Mobile Only: 4 Quick Actions Grid */}
 <div className="lg:hidden">
 <QuickActions
 onRegisterComplaint={() => router.push("/dashboard/register")}
 onTrackStatus={() =>
 triggerToast("Track status of CMP-10231 (In Progress)")
 }
 onSendSuggestion={() =>
 triggerToast("Suggestion submitted to City Council")
 }
 onHelpSupport={() =>
 triggerToast("Connecting to Civic Support Hotline...")
 }
 />
 </div>

 {/* 4 Metric Stats Cards */}
 <StatsCards
 total={stats.total || complaintsList.length}
 open={
 stats.open ||
 complaintsList.filter((c) => c.status ==="Open").length
 }
 resolved={
 stats.resolved ||
 complaintsList.filter((c) => c.status ==="Resolved").length
 }
 inProgress={
 stats.inProgress ||
 complaintsList.filter((c) => c.status ==="In Progress").length
 }
 onViewAll={() => setSelectedStatusFilter("all")}
 onFilterStatus={(status) => {
 setSelectedStatusFilter((prev) =>
 prev === status ?"all" : status,
 );
 }}
 />

 {/* Main Dual-Column Content Grid (Desktop) / Linear Stack (Mobile) */}
 <div className="grid grid-cols-1 xl:grid-cols-[1fr_350px] gap-6 items-start">
 {/* Left Column: Recent Complaints (Table on Desktop, Card List on Mobile) */}
 <div className="w-full min-w-0">
 {/* Desktop Data Table */}
 <div className="hidden lg:block">
 <RecentComplaintsTable
 complaints={filteredComplaints}
 onViewAll={() => {
 setSelectedStatusFilter("all");
 setSearchQuery("");
 }}
 onComplaintClick={(c) => {
 triggerToast(
 `Viewing details for ${c.cmpId}: ${c.title}`,
 );
 }}
 />
 </div>

 {/* Mobile Card List */}
 <div className="block lg:hidden">
 <RecentComplaintsList
 complaints={filteredComplaints.slice(0, 5)}
 onViewAll={() => {
 setSelectedStatusFilter("all");
 setSearchQuery("");
 }}
 onComplaintClick={(c) => {
 triggerToast(
 `Viewing details for ${c.cmpId}: ${c.title}`,
 );
 }}
 />
 </div>
 </div>

 {/* Right Column: Recent Activity Feed */}
 <div className="w-full">
 <RecentActivityFeed
 activities={sampleActivities}
 onViewAll={() =>
 triggerToast("Opening complete activity log")
 }
 onPromoClick={() =>
 triggerToast("Joining Cleaner Communities initiative")
 }
 />
 </div>
 </div>
 </div>
 </div>

 {/* Mobile Floating Bottom Navigation Bar */}
 <MobileBottomNav
 activeTab={activeTab}
 onTabChange={setActiveTab}
 onCenterAction={() => router.push("/dashboard/register")}
 />
 </main>
 </div>
 );
}
