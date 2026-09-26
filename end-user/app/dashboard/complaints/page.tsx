"use client";

import React, { useState, useEffect, useMemo } from"react";
import { useRouter } from"next/navigation";
import { MapPin, Search, Filter } from"lucide-react";
import {
 getPriorityStyles,
 getStatusStyles,
} from"@/lib/utils";
import { apis } from"@/lib/apis";

export default function MyComplaintsPage() {
 const router = useRouter();
 const [allComplaints, setAllComplaints] = useState<any[]>([]);
 const [searchTerm, setSearchTerm] = useState("");
 const [statusFilter, setStatusFilter] = useState("All");
 const [locationFilter, setLocationFilter] = useState("All");
 const [priorityFilter, setPriorityFilter] = useState("All");
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 apis.complaints.getComplaints()
 .then((data) => {
 setAllComplaints(data || []);
 setLoading(false);
 })
 .catch((err) => {
 console.error("Failed to fetch complaints:", err);
 setLoading(false);
 });
 }, []);

 const locations = useMemo(
 () => [
"All",
 ...Array.from(
 new Set(
 allComplaints
 .map((c) => c.location || (c.area ? `${c.area}, ${c.city}` :""))
 .filter(Boolean)
 )
 ),
 ],
 [allComplaints],
 );
 const priorities = useMemo(
 () => ["All", ...Array.from(new Set(allComplaints.map((c) => c.priority).filter(Boolean)))],
 [allComplaints],
 );

 const filteredComplaints = allComplaints.filter((item) => {
 const sTerm = searchTerm.toLowerCase();
 const matchesSearch =
 item.title?.toLowerCase().includes(sTerm) ||
 item.generated_id?.toLowerCase().includes(sTerm) ||
 item.id?.toLowerCase().includes(sTerm) ||
 item.department?.toLowerCase().includes(sTerm);
 const matchesStatus =
 statusFilter ==="All" || item.status_group === statusFilter;
 const itemLoc = item.location || (item.area ? `${item.area}, ${item.city}` :"");
 const matchesLoc =
 locationFilter ==="All" || itemLoc === locationFilter;
 const matchesPriority =
 priorityFilter ==="All" || item.priority === priorityFilter;

 return matchesSearch && matchesStatus && matchesLoc && matchesPriority;
 });

 return (
 <>
 <div className="bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-100 flex flex-col h-[calc(100vh-140px)]">
 <div className="p-5 border-b border-slate-100 shrink-0">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
 <div>
 <h2 className="text-xl font-bold text-slate-800">
 My Complaints
 </h2>
 <p className="text-sm text-slate-500 mt-1">
 View and manage all your registered complaints
 </p>
 </div>

 <div className="flex flex-wrap items-center gap-3">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
 <input
 type="text"
 placeholder="Search by ID or Title..."
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 w-64"
 />
 </div>

 <div className="relative">
 <select
 value={locationFilter}
 onChange={(e) => setLocationFilter(e.target.value)}
 className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 cursor-pointer text-slate-700"
 >
 {locations.map((loc) => (
 <option key={loc} value={loc}>
 {loc ==="All" ?"All Locations" : loc}
 </option>
 ))}
 </select>
 <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
 </div>

 <div className="relative">
 <select
 value={priorityFilter}
 onChange={(e) => setPriorityFilter(e.target.value)}
 className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 cursor-pointer text-slate-700"
 >
 {priorities.map((prio) => (
 <option key={prio} value={prio}>
 {prio ==="All" ?"All Priorities" : prio}
 </option>
 ))}
 </select>
 <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
 </div>

 <div className="relative">
 <select
 value={statusFilter}
 onChange={(e) => setStatusFilter(e.target.value)}
 className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 cursor-pointer text-slate-700"
 >
 <option value="All">All Statuses</option>
 <option value="open">Submitted / Awaiting Action</option>
 <option value="in_progress">In Progress</option>
 <option value="resolved">Resolved / Closed</option>
 <option value="rejected">Rejected</option>
 </select>
 <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
 </div>
 </div>
 </div>
 </div>

 <div className="overflow-auto flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider sticky top-0 backdrop-blur-md">
 <th className="px-5 py-3 border-b border-slate-100">#</th>
 <th className="px-5 py-3 border-b border-slate-100">
 Complaint ID
 </th>
 <th className="px-5 py-3 border-b border-slate-100">Title</th>
 <th className="px-5 py-3 border-b border-slate-100">
 <div className="flex items-center gap-1.5">
 <MapPin className="w-3.5 h-3.5" />
 <span>Location</span>
 </div>
 </th>
 <th className="px-5 py-3 border-b border-slate-100">
 Priority
 </th>
 <th className="px-5 py-3 border-b border-slate-100">Date</th>
 <th className="px-5 py-3 border-b border-slate-100">Status</th>
 </tr>
 </thead>
 <tbody className="text-sm">
 {loading ? (
 <tr>
 <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
 Loading complaints...
 </td>
 </tr>
 ) : filteredComplaints.length > 0 ? (
 filteredComplaints.map((item, index) => (
 <tr
 key={item.id}
 onClick={() => router.push(`/dashboard/complaints/${encodeURIComponent(item.id)}`)}
 className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0 cursor-pointer group"
 >
 <td className="px-5 py-4 font-semibold text-slate-700">
 {index + 1}
 </td>
 <td className="px-5 py-4 text-slate-600 font-mono text-xs font-semibold">
 {item.generated_id || item.cmpId || item.id ||"N/A"}
 </td>
 <td className="px-5 py-4 font-bold text-slate-800">
 {item.title ||"Untitled"}
 </td>
 <td className="px-5 py-4">
 <span className="text-slate-500">
 {item.location || (item.area ? `${item.area}${item.city ? `, ${item.city}` :""}` :"Jaipur, Rajasthan")}
 </span>
 </td>
 <td className="px-5 py-4">
 <span
 className={`px-2.5 py-1 text-xs font-semibold ${getPriorityStyles(item.priority)}`}
 >
 {item.priority ||"Low"}
 </span>
 </td>
 <td className="px-5 py-4 text-slate-500">
 {item.created_at ? new Date(item.created_at).toLocaleDateString() : (item.date ||"N/A")}
 </td>
 <td className="px-5 py-4">
 <span
 className={`px-3 py-1 text-xs font-semibold ${getStatusStyles(item.status)}`}
 >
 {item.status_label || item.status}
 </span>
 </td>
 </tr>
 ))
 ) : (
 <tr>
 <td
 colSpan={7}
 className="px-5 py-10 text-center text-slate-500"
 >
 No complaints found matching your filters.
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>

 <div className="p-4 border-t shrink-0 border-slate-100 flex justify-between items-center text-xs text-slate-500">
 <p>
 Showing {filteredComplaints.length} of {allComplaints.length}{""}
 complaints
 </p>
 </div>
 </div>

 </>
 );
}
