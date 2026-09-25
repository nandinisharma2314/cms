"use client";

import React, { useState, useEffect, useMemo } from"react";
import Link from"next/link";
import {
 MapPin,
 ChevronRight,
 Calendar,
 Filter,
 FileText,
 ChevronDown,
} from"lucide-react";
import { getPriorityStyles, getStatusStyles } from"@/lib/utils";
import ComplaintModal from"./ComplaintModal";
import { apis } from"@/lib/apis";

const RecentComplaints = () => {
 const [dateFilter, setDateFilter] = useState("All Time");
 const [isFilterOpen, setIsFilterOpen] = useState(false);
 const [selectedComplaint, setSelectedComplaint] = useState<any | null>(null);
 const [allComplaints, setAllComplaints] = useState<any[]>([]);
 // bumped when the detail modal closes, so status changes made there show up
 const [refreshKey, setRefreshKey] = useState(0);

 useEffect(() => {
 apis.complaints.getComplaints()
 .then((data) => {
 setAllComplaints(data || []);
 })
 .catch((err) => {
 console.error("Failed to fetch complaints:", err);
 });
 }, [refreshKey]);

 const filteredComplaints = useMemo(() => {
 const now = new Date();

 return allComplaints.filter((item) => {
 if (dateFilter ==="All Time") return true;

 const rawDate = item.created_at || item.date;
 const itemDate = rawDate ? new Date(rawDate) : null;
 if (!itemDate || isNaN(itemDate.getTime())) return true;

 const diffTime = now.getTime() - itemDate.getTime();
 const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

 if (dateFilter ==="Today") return diffDays <= 1;
 if (dateFilter ==="Yesterday") return diffDays > 0 && diffDays <= 2;
 if (dateFilter ==="Last 7 Days") return diffDays <= 7;
 if (dateFilter ==="This Month") return diffDays <= 30;

 return true;
 });
 }, [allComplaints, dateFilter]);

 const topComplaints = filteredComplaints.slice(0, 5);

 return (
 <div className="md:bg-white md:-2xl md:shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] md:border border-slate-100 flex-1 flex flex-col overflow-hidden mb-6">
 {/* Header */}
 <div className="p-0 md:p-3 md:px-4 md:border-b shrink-0 border-slate-100 flex justify-between items-center mb-4 md:mb-0">
 <h3 className="text-lg font-bold text-slate-800">Recent Complaints</h3>
 <div className="flex items-center gap-4">
 <div className="relative hidden md:block">
 <button
 onClick={() => setIsFilterOpen(!isFilterOpen)}
 className="flex items-center gap-2 text-xs font-medium border border-slate-200 px-3 py-1.5 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
 >
 <Filter className="w-3.5 h-3.5 text-slate-400" />
 {dateFilter}
 <ChevronDown
 className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isFilterOpen ?"rotate-180" :""}`}
 />
 </button>

 {isFilterOpen && (
 <>
 <div
 className="fixed inset-0 z-40"
 onClick={() => setIsFilterOpen(false)}
 />
 <div className="absolute right-0 top-full mt-2 w-40 bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] z-50 overflow-hidden transform opacity-100 scale-100 transition-all duration-200">
 <div className="py-1.5">
 {[
"All Time",
"Today",
"Yesterday",
"Last 7 Days",
"This Month",
 ].map((option) => (
 <button
 key={option}
 onClick={() => {
 setDateFilter(option);
 setIsFilterOpen(false);
 }}
 className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors ${dateFilter === option ?"bg-blue-50 text-blue-600" :"text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
 >
 {option}
 </button>
 ))}
 </div>
 </div>
 </>
 )}
 </div>
 <Link
 href="/dashboard/complaints"
 className="text-blue-600 text-sm font-semibold flex items-center hover:text-blue-700"
 >
 View All <ChevronRight className="w-4 h-4 ml-1" />
 </Link>
 </div>
 </div>

 <div className="overflow-auto flex-1">
 {/* Desktop Table View */}
 <table className="hidden md:table w-full text-left border-collapse">
 <thead>
 <tr className="bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
 <th className="px-4 py-2 border-b border-slate-100">#</th>
 <th className="px-4 py-2 border-b border-slate-100">
 Complaint ID
 </th>
 <th className="px-4 py-2 border-b border-slate-100">Title</th>
 <th className="px-4 py-2 border-b border-slate-100">
 <div className="flex items-center gap-1.5">
 <MapPin className="w-3.5 h-3.5" />
 <span>Location</span>
 </div>
 </th>
 <th className="px-4 py-2 border-b border-slate-100">Priority</th>
 <th className="px-4 py-2 border-b border-slate-100">Date</th>
 <th className="px-4 py-2 border-b border-slate-100">Status</th>
 </tr>
 </thead>
 <tbody className="text-sm">
 {topComplaints.map((item, index) => (
 <tr
 key={item.id}
 onClick={() => setSelectedComplaint(item)}
 className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0 cursor-pointer group"
 >
 <td className="px-4 py-2.5 font-semibold text-slate-700">
 {index + 1}
 </td>
 <td className="px-4 py-2.5 text-slate-600 font-mono text-xs font-semibold">
 {item.generated_id || item.cmpId || item.id ||"N/A"}
 </td>
 <td className="px-4 py-2.5 font-bold text-slate-800">
 {item.title ||"Untitled"}
 </td>

 <td className="px-4 py-2.5">
 <span className="text-slate-500">
 {item.location || (item.area ? `${item.area}${item.city ? `, ${item.city}` :""}` :"Jaipur, Rajasthan")}
 </span>
 </td>
 <td className="px-4 py-2.5">
 <span
 className={`px-2.5 py-1 text-xs font-semibold ${getPriorityStyles(item.priority)}`}
 >
 {item.priority ||"Low"}
 </span>
 </td>
 <td className="px-4 py-2.5 text-slate-500">
 {item.created_at ? new Date(item.created_at).toLocaleDateString() : (item.date ||"N/A")}
 </td>
 <td className="px-4 py-2.5">
 <span
 className={`px-3 py-1 text-xs font-semibold ${getStatusStyles(item.status)}`}
 >
 {item.status_label || item.status}
 </span>
 </td>
 </tr>
 ))}
 </tbody>
 </table>

 {/* Mobile List View */}
 <div className="md:hidden flex flex-col gap-3">
 {topComplaints.map((item) => (
 <div
 key={item.id}
 onClick={() => setSelectedComplaint(item)}
 className="cursor-pointer flex gap-4 items-center bg-white p-4 shadow-xs border border-slate-100 hover:shadow-md transition-shadow"
 >
 <div
 className={`w-12 h-12 flex items-center justify-center shrink-0 ${item.priority ==="High" ?"bg-orange-50 text-orange-500" : item.priority ==="Medium" ?"bg-blue-50 text-blue-500" :"bg-red-50 text-red-500"}`}
 >
 <FileText className="w-5 h-5" />
 </div>
 <div className="flex-1 min-w-0">
 <h4 className="text-[13px] font-bold text-slate-800 truncate mb-1">
 {item.title ||"Untitled"}
 </h4>
 <p className="text-[11px] text-slate-500 truncate mb-1.5 font-medium">
 <span className="font-mono">{item.generated_id || item.cmpId || item.id ||"N/A"}</span> • {item.location || (item.area ? `${item.area}${item.city ? `, ${item.city}` :""}` :"Jaipur, Rajasthan")}
 </p>
 <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
 <Calendar className="w-3 h-3" />
 {item.created_at ? new Date(item.created_at).toLocaleDateString() : (item.date ||"N/A")}
 </div>
 </div>
 <div className="flex flex-col items-end gap-3 shrink-0">
 <span
 className={`px-2.5 py-1 text-[10px] font-semibold ${getStatusStyles(item.status)}`}
 >
 {item.status_label || item.status}
 </span>
 <ChevronRight className="w-4 h-4 text-slate-400" />
 </div>
 </div>
 ))}
 </div>
 </div>

 <div className="hidden md:block p-3 border-t shrink-0 border-slate-100 text-xs text-slate-500">
 Showing {topComplaints.length} of {allComplaints.length} complaints
 </div>

 {selectedComplaint && (
 <ComplaintModal
 complaint={selectedComplaint}
 onClose={() => {
 setSelectedComplaint(null);
 setRefreshKey((k) => k + 1);
 }}
 />
 )}
 </div>
 );
};

export default RecentComplaints;
