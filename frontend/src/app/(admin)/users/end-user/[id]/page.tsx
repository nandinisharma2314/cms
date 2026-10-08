"use client";

import React, { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  User as UserIcon,
  XCircle,
  CreditCard,
} from "lucide-react";
import { api, EndUserProfileResponse } from "@/lib/api";
import { useApiData } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";
import { useDocumentTitle } from "@/lib/config";
import { RequirePermission } from "@/components/RequirePermission";
import { ErrorBanner, StatusPill } from "@/components/ui";

function KpiTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone: "success" | "warning" | "danger" | "neutral" | "brand";
}) {
  const colors = {
    success: "bg-emerald-500/10 text-emerald-700",
    warning: "bg-amber-500/10 text-amber-700",
    danger: "bg-rose-500/10 text-rose-700",
    neutral: "bg-slate-500/10 text-slate-700",
    brand: "bg-sky-500/10 text-sky-700",
  };

  const iconColors = {
    success: "text-emerald-600 bg-emerald-50",
    warning: "text-amber-600 bg-amber-50",
    danger: "text-rose-600 bg-rose-50",
    neutral: "text-slate-600 bg-slate-50",
    brand: "text-sky-600 bg-sky-50",
  };

  return (
    <div
      className={`p-3.5 rounded-2xl ${colors[tone]} flex flex-col justify-between transition-all hover:scale-[1.02] duration-200 shadow-sm`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-2xl font-extrabold tracking-tight leading-none">{value}</div>
        <div className={`p-2 rounded-xl shadow-sm bg-white ${iconColors[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-[9px] font-bold uppercase tracking-wider opacity-80">{label}</div>
    </div>
  );
}

function EndUserProfileContent() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");

  const { data, error, loading } = useApiData<EndUserProfileResponse>(() => api.endUsers.profile(id), [id]);

  const recentComplaints = data?.recent_complaints;
  const filteredComplaints = useMemo(() => {
    if (!recentComplaints) return [];
    let result = [...recentComplaints];

    if (statusFilter === "open") {
      result = result.filter((c) => c.status_group !== "resolved" && c.status_group !== "rejected");
    } else if (statusFilter === "resolved") {
      result = result.filter((c) => c.status_group === "resolved");
    } else if (statusFilter === "rejected") {
      result = result.filter((c) => c.status_group === "rejected");
    }

    result.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [recentComplaints, statusFilter, sortOrder]);

  useDocumentTitle(data?.user?.name ? `${data.user.name} - End User` : "End User Profile");

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading user profile...</div>;
  }
  if (error || !data) {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <ErrorBanner message={error ?? "Failed to load profile"} />
        <Link href="/users?tab=end-users" className="text-sm text-sky-600 hover:underline mt-4 inline-block">
          &larr; Back to users
        </Link>
      </div>
    );
  }

  const { user, stats } = data;

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)]">
      {/* Header & Navigation */}
      <div className="flex-none flex items-center gap-4 pb-4">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">{user.name}</h1>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            End User Profile {user.external_id ? `• ID: ${user.external_id}` : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <StatusPill active={user.is_active} />
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: User Info with Stats inside */}
        <div className="lg:col-span-5 h-full overflow-y-auto custom-scrollbar pr-1 pb-1">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col min-h-full">
            <div className="h-24 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 relative shrink-0">
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
            </div>
            <div className="px-8 pb-8 flex-1 flex flex-col relative">
              <div className="w-20 h-20 bg-white rounded-2xl shadow-md flex items-center justify-center text-3xl font-extrabold text-slate-800 bg-gradient-to-br from-slate-50 to-slate-100 -mt-10 mb-5 shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>

              <div className="space-y-5 flex-1">
                <div className="flex items-start gap-3.5 group">
                  <div className="mt-0.5 p-2 rounded-xl bg-slate-50 text-slate-400 group-hover:text-sky-600 group-hover:bg-sky-50 transition-colors">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Email Address</div>
                    <div className="text-[13px] font-semibold text-slate-800">{user.email}</div>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 group">
                  <div className="mt-0.5 p-2 rounded-xl bg-slate-50 text-slate-400 group-hover:text-emerald-600 group-hover:bg-emerald-50 transition-colors">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Mobile Number</div>
                    <div className="text-[13px] font-semibold text-slate-800">{user.mobile}</div>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 group">
                  <div className="mt-0.5 p-2 rounded-xl bg-slate-50 text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-colors">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Assigned Location</div>
                    <div className="text-[13px] font-semibold text-slate-800 leading-snug">{user.location?.label ?? "—"}</div>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 group">
                  <div className="mt-0.5 p-2 rounded-xl bg-slate-50 text-slate-400 group-hover:text-purple-600 group-hover:bg-purple-50 transition-colors">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Aadhar</div>
                    <div className="text-[13px] font-semibold text-slate-800">{user.aadhar || "—"}</div>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 group">
                  <div className="mt-0.5 p-2 rounded-xl bg-slate-50 text-slate-400 group-hover:text-orange-600 group-hover:bg-orange-50 transition-colors">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">PAN Card</div>
                    <div className="text-[13px] font-semibold text-slate-800">{user.pan_card || "—"}</div>
                  </div>
                </div>

                <div className="pt-5 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Joined</div>
                    <div className="text-[11px] text-slate-600 font-medium">{formatDateTime(user.created_at)}</div>
                  </div>
                  {user.last_login_at && (
                    <div className="text-right">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Last Seen</div>
                      <div className="text-[11px] text-slate-600 font-medium">{formatDateTime(user.last_login_at)}</div>
                    </div>
                  )}
                </div>

                {/* KPI Cards inside User Info */}
                <div className="pt-6 mt-2 border-t border-slate-100">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Complaint Statistics</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <KpiTile label="Total Filed" value={stats.total_complaints} icon={Mail} tone="brand" />
                    <KpiTile
                      label="Currently Open"
                      value={stats.open_complaints}
                      icon={Clock}
                      tone={stats.open_complaints > 0 ? "warning" : "neutral"}
                    />
                    <KpiTile label="Resolved" value={stats.resolved_complaints} icon={CheckCircle2} tone="success" />
                    <KpiTile
                      label="Rejected"
                      value={stats.rejected_complaints}
                      icon={XCircle}
                      tone={stats.rejected_complaints > 0 ? "danger" : "neutral"}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Complaints */}
        <div className="lg:col-span-7 h-full flex flex-col min-h-0">
          <div className="bg-white rounded-xl shadow-sm p-6 flex flex-col h-full overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4 shrink-0">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-indigo-500" />
                Recent Complaints
              </h3>
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all font-medium cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  <option value="open">Currently Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all font-medium cursor-pointer"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
              </div>
            </div>

            {filteredComplaints.length === 0 ? (
              <div className="text-center py-12 bg-slate-50/50 rounded-2xl border border-slate-200 border-dashed m-1">
                <p className="text-slate-500 text-sm font-medium">No complaints match your filters.</p>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                {filteredComplaints.map(
                  (complaint: {
                    id: string | number;
                    title: string;
                    status_group: string;
                    status_label: string;
                    created_at: string;
                    assigned_to?: { name: string };
                  }) => (
                    <Link
                      key={complaint.id}
                      href={`/complaints/${complaint.id}`}
                      className="block bg-slate-50/50 hover:bg-slate-100/80 rounded-2xl p-4 transition-all hover:shadow-sm group"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-2 gap-2">
                        <div className="font-bold text-slate-800 group-hover:text-sky-700 transition-colors">
                          {complaint.title || "(No subject provided)"}
                        </div>
                        <div className="text-[11px] font-mono font-semibold text-slate-500 bg-white shadow-sm px-2.5 py-1 rounded-lg shrink-0">
                          {complaint.id}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                        <span
                          className={`px-2.5 py-1 rounded-lg font-bold tracking-wide uppercase text-[9px] ${
                            complaint.status_group === "resolved"
                              ? "bg-emerald-100 text-emerald-800"
                              : complaint.status_group === "rejected"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-sky-100 text-sky-800"
                          }`}
                        >
                          {complaint.status_label}
                        </span>
                        <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {formatDateTime(complaint.created_at)}
                        </span>
                        {complaint.assigned_to && (
                          <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                            <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                            Assigned to: <span className="text-slate-700">{complaint.assigned_to.name}</span>
                          </span>
                        )}
                      </div>
                    </Link>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EndUserPage() {
  return (
    <RequirePermission anyOf={["end_user.view"]}>
      <EndUserProfileContent />
    </RequirePermission>
  );
}
