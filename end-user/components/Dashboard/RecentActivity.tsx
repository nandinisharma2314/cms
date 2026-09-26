"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  User,
  Settings,
  CheckCircle,
  Megaphone,
  Leaf,
  ChevronRight,
  Clock,
  Sparkles,
  X,
  FileText,
  Activity as ActivityIcon,
  RefreshCw,
} from "lucide-react";
import { apis } from "@/lib/apis";

interface ActivityItem {
  id: number;
  title: string;
  desc: string;
  type: string;
  complaint_id?: string;
  time: string;
  created_at: string;
}

const RecentActivity = () => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isViewAllOpen, setIsViewAllOpen] = useState(false);
  const router = useRouter();

  const fetchActivities = async (showRefresh = false) => {
    try {
      if (showRefresh) setIsRefreshing(true);
      const actRes = await apis.notifications.getActivities();

      if (actRes && actRes.success) {
        setActivities(actRes.activities || []);
      }
    } catch (err) {
      console.warn("Could not fetch activities:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchActivities();
    // Live polling every 25 seconds
    const interval = setInterval(() => {
      fetchActivities();
    }, 25000);
    return () => clearInterval(interval);
  }, []);

  const handleActivityClick = (item: ActivityItem) => {
    if (item.complaint_id) router.push(`/dashboard/complaints/${encodeURIComponent(item.complaint_id)}`);
  };

  const getIconData = (type: string) => {
    switch (type) {
      case "forwarded":
        return {
          icon: Send,
          bg: "bg-blue-50",
          color: "text-blue-600",
        };
      case "assigned":
        return {
          icon: User,
          bg: "bg-purple-50",
          color: "text-purple-600",
        };
      case "in_progress":
        return {
          icon: Settings,
          bg: "bg-amber-50",
          color: "text-amber-600",
        };
      case "resolved":
        return {
          icon: CheckCircle,
          bg: "bg-emerald-50",
          color: "text-emerald-600",
        };
      case "announcement":
        return {
          icon: Megaphone,
          bg: "bg-sky-50",
          color: "text-sky-600",
        };
      default:
        return {
          icon: FileText,
          bg: "bg-indigo-50",
          color: "text-indigo-600",
        };
    }
  };

  const displayActivities = activities.slice(0, 5);

  return (
    <>
      <div className="w-[320px] shrink-0 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-100 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="p-3 px-4 border-b shrink-0 border-slate-100 flex justify-between items-center bg-slate-50/40">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-800">Recent Activity</h3>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Live real-time feed" />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fetchActivities(true)}
              title="Refresh activity"
              className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-white transition-colors cursor-pointer"
            >
              <RefreshCw size={13} className={isRefreshing ? "animate-spin text-indigo-600" : ""} />
            </button>
            <button
              type="button"
              onClick={() => setIsViewAllOpen(true)}
              className="text-indigo-600 text-xs font-bold flex items-center hover:text-indigo-700 cursor-pointer ml-1"
            >
              View All <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>
        </div>

        {/* Timeline Feed */}
        <div className="flex-1 overflow-y-auto p-4 pb-2">
          {loading ? (
            <div className="flex flex-col gap-4 animate-pulse">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 shrink-0" />
                  <div className="flex-1">
                    <div className="h-3.5 bg-slate-100 rounded w-3/4 mb-1.5" />
                    <div className="h-2.5 bg-slate-50 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="py-12 px-4 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center mb-2">
                <ActivityIcon size={18} />
              </div>
              <p className="text-xs font-bold text-slate-700">No Recent Activity</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                New updates will appear here when you file complaints.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {displayActivities.map((activity, index) => {
                const { icon: Icon, bg, color } = getIconData(activity.type);
                const isClickable = Boolean(activity.complaint_id);

                return (
                  <div
                    key={activity.id || index}
                    onClick={() => handleActivityClick(activity)}
                    className={`flex gap-3.5 relative group ${
                      isClickable ? "cursor-pointer" : ""
                    }`}
                  >
                    {/* Timeline line */}
                    {index !== displayActivities.length - 1 && (
                      <div className="absolute left-4 top-9 w-px h-[calc(100%-10px)] bg-slate-100 -translate-x-1/2" />
                    )}

                    <div
                      className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center relative z-10 ${bg} shadow-sm group-hover:scale-105 transition-transform`}
                    >
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>

                    <div className="flex-1 pb-1 min-w-0">
                      <div className="flex justify-between items-start gap-1 mb-0.5">
                        <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                          {activity.title}
                        </h4>
                        <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap shrink-0 flex items-center gap-0.5">
                          <Clock size={9} /> {activity.time}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">
                        {activity.desc}
                      </p>
                      {activity.complaint_id && (
                        <span className="text-[10px] font-bold text-indigo-600 mt-1 inline-block opacity-0 group-hover:opacity-100 transition-opacity">
                          View details →
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Promo Footer Card */}
        <div className="p-3 mt-auto shrink-0 border-t border-slate-100 bg-slate-50/30">
          <div className="w-full bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-100/60 rounded-xl p-2.5 flex items-center justify-between text-left group">
            <div className="flex items-center gap-2.5">
              <div className="bg-emerald-100 p-1.5 rounded-lg text-emerald-600 shrink-0">
                <Leaf className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-blue-900 leading-tight">
                  Cleaner Communities
                </p>
                <p className="text-[10px] font-medium text-blue-700 leading-tight">
                  Stronger Together
                </p>
              </div>
            </div>
            <Sparkles className="w-4 h-4 text-blue-400 group-hover:text-blue-600 transition-colors" />
          </div>
        </div>
      </div>

      {/* View All Activities Modal */}
      {isViewAllOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 px-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <ActivityIcon size={16} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">All Recent Activities</h3>
                  <p className="text-xs text-slate-500">Live chronological stream of civic updates</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsViewAllOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 divide-y divide-slate-100">
              {activities.map((act) => {
                const { icon: Icon, bg, color } = getIconData(act.type);
                return (
                  <div
                    key={act.id}
                    onClick={() => {
                      handleActivityClick(act);
                      setIsViewAllOpen(false);
                    }}
                    className="py-3 flex items-start gap-3.5 hover:bg-slate-50/80 rounded-xl px-2 transition-colors cursor-pointer"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-800 truncate">{act.title}</h4>
                        <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                          {act.time}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{act.desc}</p>
                      {act.complaint_id && (
                        <span className="text-[10px] font-bold text-indigo-600 mt-1 inline-block">
                          View Complaint Details →
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 px-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{activities.length} total activity records</span>
              <button
                type="button"
                onClick={() => setIsViewAllOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
};

export default RecentActivity;
