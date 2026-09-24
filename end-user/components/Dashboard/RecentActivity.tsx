import React from"react";
import {
 Send,
 User,
 Settings,
 CheckCircle,
 Megaphone,
 Leaf,
 ChevronRight,
} from"lucide-react";

const activities = [
 {
 title:"Complaint Forwarded",
 desc:"CMP-10231 forwarded to Electricity Department.",
 time:"2 min ago",
 icon: Send,
 iconBg:"bg-blue-50",
 iconColor:"text-blue-500",
 },
 {
 title:"Assigned to Field Agent",
 desc:"Rakesh Kumar assigned to CMP-10218.",
 time:"1 hour ago",
 icon: User,
 iconBg:"bg-emerald-50",
 iconColor:"text-emerald-500",
 },
 {
 title:"Work in Progress",
 desc:"Work started on CMP-10196.",
 time:"3 hours ago",
 icon: Settings,
 iconBg:"bg-purple-50",
 iconColor:"text-purple-500",
 },
 {
 title:"Complaint Resolved",
 desc:"CMP-10154 marked as resolved.",
 time:"1 day ago",
 icon: CheckCircle,
 iconBg:"bg-green-50",
 iconColor:"text-green-500",
 },
 {
 title:"New Announcement",
 desc:"Scheduled maintenance on 25 Sep 2026.",
 time:"3 days ago",
 icon: Megaphone,
 iconBg:"bg-blue-50",
 iconColor:"text-blue-500",
 },
];

const RecentActivity = () => {
 return (
 <div className="w-[320px] shrink-0 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-100 flex flex-col h-full overflow-hidden">
 <div className="p-3 px-4 border-b shrink-0 border-slate-100 flex justify-between items-center">
 <h3 className="text-lg font-bold text-slate-800">Recent Activity</h3>
 <button className="text-blue-600 text-sm font-semibold flex items-center hover:text-blue-700">
 View All <ChevronRight className="w-4 h-4 ml-1" />
 </button>
 </div>

 <div className="flex-1 overflow-y-auto p-4 pb-2">
 <div className="flex flex-col gap-4">
 {activities.map((activity, index) => (
 <div key={index} className="flex gap-4 relative">
 {/* Timeline line */}
 {index !== activities.length - 1 && (
 <div className="absolute left-4 top-10 w-px h-full bg-slate-100 transform -translate-x-1/2"></div>
 )}

 <div
 className={`w-8 h-8 flex-shrink-0 flex items-center justify-center relative z-10 ${activity.iconBg}`}
 >
 <activity.icon className={`w-4 h-4 ${activity.iconColor}`} />
 </div>

 <div className="flex-1 pb-1">
 <div className="flex justify-between items-start mb-0.5">
 <h4 className="text-sm font-bold text-slate-800">
 {activity.title}
 </h4>
 <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
 {activity.time}
 </span>
 </div>
 <p className="text-xs text-slate-500 pr-4 leading-relaxed">
 {activity.desc}
 </p>
 </div>
 </div>
 ))}
 </div>
 </div>

 <div className="p-3 mt-auto shrink-0">
 <button className="w-full bg-blue-50 hover:bg-blue-100 transition-colors p-3 flex items-center justify-between text-left group">
 <div className="flex items-center gap-3">
 <div className="bg-emerald-100 p-2 text-emerald-600">
 <Leaf className="w-5 h-5" />
 </div>
 <div>
 <p className="text-sm font-semibold text-blue-700 leading-tight">
 Cleaner Communities
 </p>
 <p className="text-sm font-semibold text-blue-700 leading-tight">
 Stronger Together
 </p>
 </div>
 </div>
 <ChevronRight className="w-5 h-5 text-blue-400 group-hover:text-blue-600 transition-colors" />
 </button>
 </div>
 </div>
 );
};

export default RecentActivity;
