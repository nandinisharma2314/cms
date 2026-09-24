"use client";

import React, { useEffect, useState } from"react";
import {
 FileText,
 Clock,
 CheckCircle,
 Hourglass,
 ChevronRight,
} from"lucide-react";
import { apis } from"@/lib/apis";

const StatCard = () => {
 const [statsData, setStatsData] = useState({
 total: 0,
 open: 0,
 resolved: 0,
 in_progress: 0,
 });

 useEffect(() => {
 apis.complaints.getDashboardStats()
 .then((data) => {
 if (data) {
 setStatsData({
 total: data.total || 0,
 open: data.open !== undefined ? data.open : Math.max(0, (data.total || 0) - (data.resolved || 0)),
 resolved: data.resolved || 0,
 in_progress: data.in_progress || 0,
 });
 }
 })
 .catch(err => console.error("Error fetching stats:", err));
 }, []);

 const stats = [
 {
 title:"Total\nComplaints",
 value: statsData.total.toString(),
 icon: FileText,
 iconColor:"text-blue-600",
 iconBg:"bg-white",
 cardBg:"bg-blue-50/70 border-blue-100/50",
 },
 {
 title:"Open\nComplaints",
 value: statsData.open.toString(),
 icon: Clock,
 iconColor:"text-red-500",
 iconBg:"bg-white",
 cardBg:"bg-red-50/70 border-red-100/50",
 },
 {
 title:"Resolved\nComplaints",
 value: statsData.resolved.toString(),
 icon: CheckCircle,
 iconColor:"text-green-600",
 iconBg:"bg-white",
 cardBg:"bg-green-50/70 border-green-100/50",
 },
 {
 title:"In\nProgress",
 value: statsData.in_progress.toString(),
 icon: Hourglass,
 iconColor:"text-purple-600",
 iconBg:"bg-white",
 cardBg:"bg-purple-50/70 border-purple-100/50",
 },
 ];

 return (
 <div className="mb-4 shrink-0">
 <div className="flex justify-between items-center mb-3 md:hidden">
 <h3 className="text-lg font-bold text-slate-800">Your Complaints</h3>
 <button className="text-blue-600 text-sm font-semibold flex items-center hover:text-blue-700">
 View All <ChevronRight className="w-4 h-4 ml-1" />
 </button>
 </div>
 <div className="grid grid-cols-4 gap-2 md:gap-4">
 {stats.map((stat, index) => (
 <div
 key={index}
 className={`md:bg-white -[20px] p-2 py-4 md:p-3 flex flex-col md:flex-row items-center gap-2 md:gap-4 md:border md:border-slate-100 ${stat.cardBg}`}
 >
 <div
 className={`w-10 h-10 md: flex items-center justify-center ${stat.iconBg} shrink-0`}
 >
 <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
 </div>
 <div className="flex flex-col items-center md:items-start text-center md:text-left">
 <h3 className="text-lg md:text-xl font-bold text-slate-800 leading-none mb-0.5 md:mb-1">
 {stat.value}
 </h3>
 <p className="text-[10px] md:text-xs text-slate-500 font-medium leading-tight whitespace-pre-wrap md:whitespace-pre-wrap">
 {stat.title}
 </p>
 </div>
 </div>
 ))}
 </div>
 </div>
 );
};

export default StatCard;
