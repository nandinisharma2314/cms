"use client";

import React from"react";
import {
 PaperPlaneIcon,
 AgentUserIcon,
 CogGearIcon,
 CheckCircleIcon,
 AnnouncementMegaphoneIcon,
 ChevronRightIcon,
 LeafIcon,
} from"./DashboardIcons";
import { Zap, ArrowRight } from"lucide-react";

interface ActivityItem {
 id: string;
 type:"forwarded" |"assigned" |"in_progress" |"resolved" |"announcement";
 title: string;
 description: string;
 timeAgo: string;
 iconBg: string;
 iconColor: string;
}

export const sampleActivities: ActivityItem[] = [
 {
 id:"act-1",
 type:"forwarded",
 title:"Complaint Forwarded",
 description:"CMP-10231 forwarded to Electricity Department.",
 timeAgo:"2 min ago",
 iconBg:"#eff6ff",
 iconColor:"#2563eb",
 },
 {
 id:"act-2",
 type:"assigned",
 title:"Assigned to Field Agent",
 description:"Rakesh Kumar assigned to CMP-10218.",
 timeAgo:"1 hour ago",
 iconBg:"#ecfdf5",
 iconColor:"#059669",
 },
 {
 id:"act-3",
 type:"in_progress",
 title:"Work in Progress",
 description:"Work started on CMP-10196.",
 timeAgo:"3 hours ago",
 iconBg:"#f5f3ff",
 iconColor:"#7c3aed",
 },
 {
 id:"act-4",
 type:"resolved",
 title:"Complaint Resolved",
 description:"CMP-10154 marked as resolved.",
 timeAgo:"1 day ago",
 iconBg:"#ecfdf5",
 iconColor:"#10b981",
 },
 {
 id:"act-5",
 type:"announcement",
 title:"New Announcement",
 description:"Scheduled maintenance on 25 Sep 2026.",
 timeAgo:"3 days ago",
 iconBg:"#eff6ff",
 iconColor:"#0284c7",
 },
];

interface RecentActivityFeedProps {
 activities?: ActivityItem[];
 onViewAll?: () => void;
 onPromoClick?: () => void;
}

export function RecentActivityFeed({
 activities = sampleActivities,
 onViewAll,
 onPromoClick,
}: RecentActivityFeedProps) {
 function renderActivityIcon(type: ActivityItem["type"]) {
 switch (type) {
 case"forwarded":
 return <PaperPlaneIcon size={16} color="currentColor" />;
 case"assigned":
 return <AgentUserIcon size={16} color="currentColor" />;
 case"in_progress":
 return <CogGearIcon size={16} color="currentColor" />;
 case"resolved":
 return <CheckCircleIcon size={16} color="currentColor" />;
 case"announcement":
 return <AnnouncementMegaphoneIcon size={16} color="currentColor" />;
 default:
 return <PaperPlaneIcon size={16} color="currentColor" />;
 }
 }

 function getIconColorClass(type: string) {
 switch (type) {
 case"forwarded":
 return"bg-indigo-50 text-indigo-600";
 case"assigned":
 return"bg-green-50 text-green-600";
 case"in_progress":
 return"bg-fuchsia-50 text-fuchsia-600";
 case"resolved":
 return"bg-green-50 text-green-600";
 case"announcement":
 return"bg-blue-50 text-blue-600";
 default:
 return"bg-indigo-50 text-indigo-600";
 }
 }

 return (
 <aside className="w-full flex flex-col gap-6">
 {/* Activity Card */}
 <div className="bg-white shadow-sm border border-slate-100 flex flex-col overflow-hidden">
 <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 bg-blue-50 text-blue-600 flex items-center justify-center">
 <Zap size={16} />
 </div>
 <h3 className="text-lg font-bold text-slate-800">
 Recent Activity
 </h3>
 </div>
 <button
 type="button"
 className="text-sm font-bold text-indigo-600 flex items-center gap-1 hover:text-indigo-700 transition-colors"
 onClick={onViewAll}
 >
 <span>View All</span>
 <ChevronRightIcon size={14} color="currentColor" />
 </button>
 </div>

 {/* Activity Timeline List */}
 <div className="flex flex-col p-6 gap-6">
 {activities.map((act) => (
 <div key={act.id} className="flex gap-4">
 {/* Icon Circle */}
 <div
 className={`w-10 h-10 flex items-center justify-center shrink-0 ${getIconColorClass(act.type)}`}
 >
 {renderActivityIcon(act.type)}
 </div>

 {/* Text & Time */}
 <div className="flex flex-col flex-1 min-w-0 pt-0.5">
 <div className="flex items-center justify-between gap-2">
 <h4 className="text-sm font-bold text-slate-800 truncate">
 {act.title}
 </h4>
 <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
 {act.timeAgo}
 </span>
 </div>
 <p className="text-xs text-slate-500 mt-1 leading-relaxed pr-2">
 {act.description}
 </p>
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Bottom Promo Card:"Cleaner Communities Stronger Together" */}
 <div
 className="bg-white shadow-sm border border-slate-100 p-5 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow group"
 onClick={onPromoClick}
 role="button"
 tabIndex={0}
 >
 <div className="flex items-center gap-4">
 <div className="w-12 h-12 bg-green-50 flex items-center justify-center group-hover:scale-105 transition-transform">
 <LeafIcon size={20} color="#10b981" />
 </div>
 <div className="flex flex-col">
 <span className="text-sm font-bold text-indigo-600 leading-tight">
 Cleaner Communities
 </span>
 <span className="text-sm font-bold text-indigo-600 leading-tight">
 Stronger Together
 </span>
 </div>
 </div>

 <div className="w-8 h-8 bg-indigo-600 text-white flex items-center justify-center group-hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/30">
 <ArrowRight size={16} />
 </div>
 </div>
 </aside>
 );
}
