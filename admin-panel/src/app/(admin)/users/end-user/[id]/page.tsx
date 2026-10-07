"use client";

import React from "react";
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
  XCircle 
} from "lucide-react";
import { api, EndUserProfileResponse } from "@/lib/api";
import { useApiData } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";
import { useDocumentTitle } from "@/lib/config";
import { RequirePermission } from "@/components/RequirePermission";
import { ErrorBanner, StatusPill, primaryButtonClass } from "@/components/ui";

function KpiTile({ 
  label, 
  value, 
  icon: Icon, 
  tone 
}: { 
  label: string; 
  value: string | number; 
  icon: any; 
  tone: "success" | "warning" | "danger" | "neutral" | "brand";
}) {
  const colors = {
    success: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-700 border-amber-500/20",
    danger: "bg-rose-500/10 text-rose-700 border-rose-500/20",
    neutral: "bg-slate-500/10 text-slate-700 border-slate-500/20",
    brand: "bg-sky-500/10 text-sky-700 border-sky-500/20"
  };

  const iconColors = {
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-rose-600",
    neutral: "text-slate-600",
    brand: "text-sky-600"
  };

  return (
    <div className={`p-5 rounded-2xl border ${colors[tone]} flex flex-col justify-between transition-all hover:scale-[1.02] duration-200 shadow-sm`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2 rounded-xl bg-white shadow-sm ${iconColors[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div>
        <div className="text-3xl font-extrabold tracking-tight mb-1">{value}</div>
        <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
      </div>
    </div>
  );
}

function EndUserProfileContent() {
  const params = useParams();
  const id = Number(params.id);
  const router = useRouter();

  const { data, error, loading } = useApiData<EndUserProfileResponse>(
    () => api.endUsers.profile(id),
    [id]
  );
  
  useDocumentTitle(data?.user?.name ? `${data.user.name} - End User` : "End User Profile");

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading user profile...</div>;
  }
  if (error || !data) {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <ErrorBanner message={error ?? "Failed to load profile"} />
        <Link href="/users" className="text-sm text-sky-600 hover:underline mt-4 inline-block">
          &larr; Back to users
        </Link>
      </div>
    );
  }

  const { user, stats, recent_complaints } = data;

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      {/* Header & Navigation */}
      <div className="flex items-center gap-4">
        <Link 
          href="/users" 
          className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{user.name}</h1>
          <p className="text-sm text-slate-500 mt-0.5">End User Profile {user.external_id ? `• ID: ${user.external_id}` : ''}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <StatusPill active={user.is_active} />
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: User Info */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="h-32 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 relative">
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
            </div>
            <div className="px-8 pb-8 relative">
              <div className="w-24 h-24 bg-white rounded-2xl shadow-md border-4 border-white flex items-center justify-center text-4xl font-extrabold text-slate-800 bg-gradient-to-br from-slate-50 to-slate-100 -mt-12 mb-5">
                {user.name.charAt(0).toUpperCase()}
              </div>
              
              <div className="space-y-5">
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

                <div className="pt-6 mt-2 border-t border-slate-100 flex items-center justify-between">
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
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Stats & Complaints */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiTile label="Total Filed" value={stats.total_complaints} icon={Mail} tone="brand" />
            <KpiTile label="Currently Open" value={stats.open_complaints} icon={Clock} tone={stats.open_complaints > 0 ? "warning" : "neutral"} />
            <KpiTile label="Resolved" value={stats.resolved_complaints} icon={CheckCircle2} tone="success" />
            <KpiTile label="Rejected" value={stats.rejected_complaints} icon={XCircle} tone={stats.rejected_complaints > 0 ? "danger" : "neutral"} />
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-7">
            <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-indigo-500" />
              Recent Complaints
            </h3>
            
            {recent_complaints.length === 0 ? (
              <div className="text-center py-12 bg-slate-50/50 rounded-2xl border border-slate-200 border-dashed">
                <p className="text-slate-500 text-sm font-medium">This user hasn't filed any complaints yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recent_complaints.map((complaint: any) => (
                  <Link 
                    key={complaint.id} 
                    href={`/complaints/${complaint.id}`}
                    className="block bg-white hover:bg-slate-50 border border-slate-200/80 rounded-2xl p-4.5 transition-all hover:shadow-sm group"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-3 gap-2">
                      <div className="font-bold text-slate-800 group-hover:text-sky-700 transition-colors">
                        {complaint.title || "(No subject provided)"}
                      </div>
                      <div className="text-[11px] font-mono font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg shrink-0">
                        {complaint.id}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                      <span className={`px-2.5 py-1 rounded-lg font-bold tracking-wide uppercase text-[9px] border ${
                        complaint.status_group === "resolved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        complaint.status_group === "rejected" ? "bg-rose-50 text-rose-700 border-rose-200" :
                        "bg-sky-50 text-sky-700 border-sky-200"
                      }`}>
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
                ))}
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
