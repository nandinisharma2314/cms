"use client";

import React from"react";
import {
 ElectricityIcon,
 WaterSupplyIcon,
 SanitationIcon,
 PublicWorksIcon,
 ParksGardensIcon,
 MapPinIcon,
 ChevronRightIcon,
} from"./DashboardIcons";
import { Calendar, MoreHorizontal, FileText } from"lucide-react";

export interface ComplaintItem {
 id: string;
 cmpId: string;
 title: string;
 department: string;
 departmentIcon: string;
 location: string;
 priority:"High" |"Medium" |"Low";
 date: string;
 status:"In Progress" |"Resolved" |"Open";
}

export const sampleComplaints: ComplaintItem[] = [
 {
 id:"1",
 cmpId:"CMP-10231",
 title:"Street Light Not Working",
 department:"Electricity",
 departmentIcon:"electricity",
 location:"Mansarovar",
 priority:"High",
 date:"22 Sep 2026",
 status:"In Progress",
 },
 {
 id:"2",
 cmpId:"CMP-10218",
 title:"Water Supply Issue",
 department:"Water Supply",
 departmentIcon:"water",
 location:"Vaishali Nagar",
 priority:"Medium",
 date:"18 Sep 2026",
 status:"Resolved",
 },
 {
 id:"3",
 cmpId:"CMP-10205",
 title:"Garbage Not Collected",
 department:"Sanitation",
 departmentIcon:"sanitation",
 location:"Malviya Nagar",
 priority:"High",
 date:"12 Sep 2026",
 status:"Open",
 },
 {
 id:"4",
 cmpId:"CMP-10196",
 title:"Road Damage",
 department:"Public Works",
 departmentIcon:"public_works",
 location:"Tonk Road",
 priority:"Medium",
 date:"10 Sep 2026",
 status:"Resolved",
 },
 {
 id:"5",
 cmpId:"CMP-10182",
 title:"Park Maintenance",
 department:"Parks & Gardens",
 departmentIcon:"parks",
 location:"Pratap Nagar",
 priority:"Low",
 date:"02 Sep 2026",
 status:"Resolved",
 },
 {
 id:"6",
 cmpId:"CMP-10170",
 title:"Drainage Overflow",
 department:"Sanitation",
 departmentIcon:"sanitation",
 location:"C-Scheme",
 priority:"High",
 date:"28 Aug 2026",
 status:"Open",
 },
 {
 id:"7",
 cmpId:"CMP-10154",
 title:"Transformer Noise",
 department:"Electricity",
 departmentIcon:"electricity",
 location:"Civil Lines",
 priority:"Medium",
 date:"21 Aug 2026",
 status:"Resolved",
 },
 {
 id:"8",
 cmpId:"CMP-10142",
 title:"Pothole on Main Avenue",
 department:"Public Works",
 departmentIcon:"public_works",
 location:"Raja Park",
 priority:"High",
 date:"15 Aug 2026",
 status:"Open",
 },
 {
 id:"9",
 cmpId:"CMP-10130",
 title:"Low Water Pressure",
 department:"Water Supply",
 departmentIcon:"water",
 location:"Bapu Nagar",
 priority:"Medium",
 date:"08 Aug 2026",
 status:"Resolved",
 },
 {
 id:"10",
 cmpId:"CMP-10115",
 title:"Fallen Tree Branch",
 department:"Parks & Gardens",
 departmentIcon:"parks",
 location:"Vidhyadhar Nagar",
 priority:"Low",
 date:"01 Aug 2026",
 status:"Resolved",
 },
 {
 id:"11",
 cmpId:"CMP-10098",
 title:"Streetlight Pole Leaning",
 department:"Electricity",
 departmentIcon:"electricity",
 location:"Ajmer Road",
 priority:"Medium",
 date:"25 Jul 2026",
 status:"Resolved",
 },
 {
 id:"12",
 cmpId:"CMP-10080",
 title:"Public Tap Leakage",
 department:"Water Supply",
 departmentIcon:"water",
 location:"Jhotwara",
 priority:"Low",
 date:"18 Jul 2026",
 status:"Resolved",
 },
];

interface RecentComplaintsTableProps {
 complaints?: ComplaintItem[];
 onViewAll?: () => void;
 onComplaintClick?: (complaint: ComplaintItem) => void;
}

export function RecentComplaintsTable({
 complaints = sampleComplaints,
 onViewAll,
 onComplaintClick,
}: RecentComplaintsTableProps) {
 function renderDeptIcon(type: string) {
 switch (type) {
 case"electricity":
 return <ElectricityIcon size={16} color="#2563eb" />;
 case"water":
 return <WaterSupplyIcon size={16} color="#0284c7" />;
 case"sanitation":
 return <SanitationIcon size={16} color="#059669" />;
 case"public_works":
 return <PublicWorksIcon size={16} color="#475569" />;
 case"parks":
 return <ParksGardensIcon size={16} color="#16a34a" />;
 default:
 return <ElectricityIcon size={16} color="#2563eb" />;
 }
 }

 function getPriorityClass(priority: string) {
 switch (priority) {
 case"High":
 return"bg-red-50 text-red-600 font-bold px-3 py-1 text-xs";
 case"Medium":
 return"bg-indigo-50 text-indigo-600 font-bold px-3 py-1 text-xs";
 case"Low":
 return"bg-green-50 text-green-600 font-bold px-3 py-1 text-xs";
 default:
 return"bg-slate-100 text-slate-600 font-bold px-3 py-1 text-xs";
 }
 }

 function getStatusClass(status: string) {
 switch (status) {
 case"In Progress":
 case"Resolved":
 return"bg-green-50 text-green-600 font-bold px-3 py-1 text-xs";
 case"Open":
 return"bg-red-50 text-red-600 font-bold px-3 py-1 text-xs";
 default:
 return"bg-slate-100 text-slate-600 font-bold px-3 py-1 text-xs";
 }
 }

 return (
 <div className="bg-white shadow-sm border border-slate-100 flex flex-col overflow-hidden">
 {/* Table Header */}
 <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
 <div className="flex items-start gap-4">
 <div className="w-10 h-10 bg-indigo-50 flex items-center justify-center shrink-0">
 <FileText size={20} className="text-indigo-600" />
 </div>
 <div className="flex flex-col">
 <h3 className="text-lg font-bold text-slate-800 leading-tight">
 Recent Complaints
 </h3>
 <p className="text-xs text-slate-500 font-medium mt-1">
 Track the latest complaints and their status
 </p>
 </div>
 </div>

 <div className="flex items-center gap-4">
 <button className="hidden md:flex items-center gap-2 border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
 <svg
 width="12"
 height="12"
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 strokeWidth="2"
 >
 <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
 </svg>
 All Time
 <svg
 width="12"
 height="12"
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 strokeWidth="2"
 >
 <path d="M6 9l6 6 6-6" />
 </svg>
 </button>
 <button
 type="button"
 className="text-sm font-bold text-indigo-600 flex items-center gap-1 hover:text-indigo-700 transition-colors"
 onClick={onViewAll}
 >
 <span>View All</span>
 <ChevronRightIcon size={14} color="currentColor" />
 </button>
 </div>
 </div>

 {/* Table Container */}
 <div className="w-full overflow-x-auto">
 <table className="w-full min-w-[900px] text-left border-collapse">
 <thead>
 <tr className="border-b border-slate-100">
 <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-12">
 #
 </th>
 <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
 Complaint ID
 </th>
 <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
 Title
 </th>
 <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
 Location
 </th>
 <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
 Priority
 </th>
 <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
 Date
 </th>
 <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
 Status
 </th>
 <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">
 Actions
 </th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-50">
 {complaints.slice(0, 5).map((item, idx) => (
 <tr
 key={item.id}
 className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
 onClick={() => onComplaintClick && onComplaintClick(item)}
 >
 <td className="px-6 py-4 text-sm font-bold text-slate-800">
 {idx + 1}
 </td>
 <td className="px-6 py-4 text-sm text-slate-500 font-medium">
 {item.cmpId}
 </td>
 <td className="px-6 py-4">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 bg-slate-50 flex items-center justify-center shrink-0">
 {renderDeptIcon(item.departmentIcon)}
 </div>
 <span className="text-sm font-bold text-slate-800">
 {item.title}
 </span>
 </div>
 </td>
 <td className="px-6 py-4 text-sm text-slate-500 font-medium">
 <div className="flex items-center gap-1.5">
 <MapPinIcon size={14} color="#94a3b8" />
 <span>{item.location}</span>
 </div>
 </td>
 <td className="px-6 py-4">
 <span className={getPriorityClass(item.priority)}>
 {item.priority}
 </span>
 </td>
 <td className="px-6 py-4 text-sm text-slate-500 font-medium">
 <div className="flex items-center gap-2">
 <Calendar size={14} className="text-slate-400" />
 <span>{item.date}</span>
 </div>
 </td>
 <td className="px-6 py-4">
 <span className={getStatusClass(item.status)}>
 {item.status}
 </span>
 </td>
 <td className="px-6 py-4 text-center">
 <button className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors inline-flex">
 <MoreHorizontal size={16} />
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {/* Table Footer Count & Pagination */}
 <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between">
 <span className="text-xs font-semibold text-slate-500">
 Showing 5 of 12 complaints
 </span>

 <div className="flex items-center gap-1">
 <button className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
 <ChevronRightIcon size={14} color="currentColor" />
 </button>
 <button className="w-8 h-8 bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-md shadow-indigo-600/20">
 1
 </button>
 <button className="w-8 h-8 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors flex items-center justify-center">
 2
 </button>
 <button className="w-8 h-8 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors flex items-center justify-center">
 3
 </button>
 <button className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors">
 <ChevronRightIcon size={14} color="currentColor" />
 </button>
 </div>
 </div>
 </div>
 );
}
