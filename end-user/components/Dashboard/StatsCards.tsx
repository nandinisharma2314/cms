"use client";

import React from"react";
import {
 MetricDocIcon,
 MetricClockIcon,
 MetricCheckIcon,
 MetricHourglassIcon,
 ChevronRightIcon,
} from"./DashboardIcons";

interface StatsCardsProps {
 onViewAll?: () => void;
 onFilterStatus?: (status: string) => void;
 total?: number;
 open?: number;
 resolved?: number;
 inProgress?: number;
}

export function StatsCards({
 onViewAll,
 onFilterStatus,
 total = 12,
 open = 3,
 resolved = 8,
 inProgress = 1,
}: StatsCardsProps) {
 const stats = [
 {
 id:"all",
 count: total,
 label:"Total Complaints",
 icon: MetricDocIcon,
 accentColor:"#7c3aed",
 bgColor:"#f5f3ff",
 trendText:"↑ 2",
 trendColor:"text-green-500",
 sparklineColor:"#7c3aed",
 sparklinePath:"M0 20 Q 10 20, 20 15 T 40 10 T 60 5 T 80 0",
 },
 {
 id:"open",
 count: open,
 label:"Open Complaints",
 icon: MetricClockIcon,
 accentColor:"#dc2626",
 bgColor:"#fef2f2",
 trendText:"↑ 1",
 trendColor:"text-red-500",
 sparklineColor:"#dc2626",
 sparklinePath:"M0 20 Q 10 20, 20 15 T 40 15 T 60 5 T 80 0",
 },
 {
 id:"resolved",
 count: resolved,
 label:"Resolved Complaints",
 icon: MetricCheckIcon,
 accentColor:"#10b981",
 bgColor:"#ecfdf5",
 trendText:"↑ 3",
 trendColor:"text-green-500",
 sparklineColor:"#10b981",
 sparklinePath:"M0 20 Q 20 20, 30 10 T 60 10 T 80 0",
 },
 {
 id:"in_progress",
 count: inProgress,
 label:"In Progress",
 icon: MetricHourglassIcon,
 accentColor:"#c026d3",
 bgColor:"#fdf4ff",
 trendText:"↓ 2",
 trendColor:"text-indigo-500",
 sparklineColor:"#c026d3",
 sparklinePath:"M0 0 Q 20 5, 30 15 T 60 15 T 80 5",
 },
 ];

 return (
 <section className="w-full flex flex-col gap-4">
 {/* Mobile Section Header with"View All >" */}
 <div className="flex items-center justify-between lg:hidden mb-2">
 <h3 className="text-lg font-bold text-slate-800">Your Complaints</h3>
 <button
 type="button"
 className="text-sm font-bold text-indigo-600 flex items-center gap-1"
 onClick={onViewAll}
 >
 <span>View All</span>
 <ChevronRightIcon size={14} color="#4f46e5" />
 </button>
 </div>

 {/* Grid of 4 Stat Cards */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
 {stats.map((stat) => {
 const Icon = stat.icon;

 return (
 <div
 key={stat.id}
 className="bg-white shadow-sm border border-slate-100 p-5 cursor-pointer hover:shadow-md hover:border-slate-200 transition-all group flex flex-col justify-between relative overflow-hidden"
 onClick={() => onFilterStatus && onFilterStatus(stat.id)}
 >
 <div className="flex items-start gap-4">
 {/* Icon Container */}
 <div
 className="w-12 h-12 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
 style={{ backgroundColor: stat.bgColor }}
 >
 <Icon size={24} color={stat.accentColor} />
 </div>

 {/* Data & Label */}
 <div className="flex flex-col">
 <span className="text-2xl font-black text-slate-800 leading-none mb-1">
 {stat.count}
 </span>
 <span className="text-[13px] font-semibold text-slate-500 leading-tight">
 {stat.label}
 </span>
 </div>
 </div>

 {/* Bottom area: Trend and Sparkline */}
 <div className="mt-4 flex items-end justify-between relative">
 <div className="flex items-center gap-1">
 <span className={`text-xs font-bold ${stat.trendColor}`}>
 {stat.trendText}
 </span>
 <span className="text-xs font-medium text-slate-400">
 since last week
 </span>
 </div>

 <div className="absolute -right-2 -bottom-2 w-24 h-12 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity">
 <svg
 width="100%"
 height="100%"
 viewBox="0 0 80 20"
 preserveAspectRatio="none"
 >
 {/* Light background fill for sparkline (optional) */}
 <path
 d={`${stat.sparklinePath} L 80 20 L 0 20 Z`}
 fill={stat.sparklineColor}
 fillOpacity="0.05"
 />
 {/* Stroke line */}
 <path
 d={stat.sparklinePath}
 fill="none"
 stroke={stat.sparklineColor}
 strokeWidth="1.5"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 </div>
 </div>
 </div>
 );
 })}
 </div>
 </section>
 );
}
