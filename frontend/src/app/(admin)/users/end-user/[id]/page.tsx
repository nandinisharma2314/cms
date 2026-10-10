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
import { useSession } from "@/lib/session";
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
  const { me } = useSession();

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

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar ">
        {/* User Info Small Card */}
        <div className="px-2 py-1  flex flex-col  shrink-0">
          <div className="flex items-center gap-3">
            <div className="   flex items-center justify-center text-xl font-extrabold text-slate-700 shrink-0"></div>
            <div></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2  ">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-50 text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <div className="text-sm font-medium text-slate-800">{user.email}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-50 text-slate-400">
                <Phone className="w-4 h-4" />
              </div>
              <div className="text-sm font-medium text-slate-800">{user.mobile}</div>
            </div>
          </div>
        </div>

        {/* KPI Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 mb-2">
          <KpiTile label="Total Complaints" value={stats.total_complaints} icon={ShieldAlert} tone="brand" />
          <KpiTile label="Open" value={stats.open_complaints} icon={Clock} tone="warning" />
          <KpiTile label="Resolved" value={stats.resolved_complaints} icon={CheckCircle2} tone="success" />
          <KpiTile label="Rejected" value={stats.rejected_complaints} icon={XCircle} tone="danger" />
        </div>

        {/* Complaints Section (No Card) */}
        {(me.is_super_admin || me.role.key === "admin") && (
          <div className="mt-2 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
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

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-sm text-slate-600 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-4 w-24">ID</th>
                    <th className="px-4 py-4">Title</th>
                    <th className="px-4 py-4 text-center w-32">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredComplaints.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center py-12 text-slate-500 text-sm">
                        No complaints match your filters.
                      </td>
                    </tr>
                  ) : (
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    filteredComplaints.map((c: any) => (
                      <tr
                        key={c.id}
                        onClick={() => router.push(`/complaints/${c.id}`)}
                        className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                      >
                        <td className="px-4 py-5 text-sm font-mono font-medium text-slate-500">{c.id}</td>
                        <td className="px-4 py-5 text-base font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                          {c.title || "(No subject provided)"}
                        </td>
                        <td className="px-4 py-5 text-center">
                          <span
                            className={`px-3 py-1.5 rounded-lg font-bold tracking-wide uppercase text-[10px] inline-block ${
                              c.status_group === "resolved"
                                ? "bg-emerald-100 text-emerald-800"
                                : c.status_group === "rejected"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-sky-100 text-sky-800"
                            }`}
                          >
                            {c.status_label}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EndUserPage() {
  return <EndUserProfileContent />;
}
