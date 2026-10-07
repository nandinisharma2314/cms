"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */


import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, ExternalLink, ShieldCheck, ShieldAlert, Star, Loader2 } from "lucide-react";
import { api, ComplaintData, MemberProfileResponse } from "@/lib/api";
import { useApiData } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";
import { useDocumentTitle } from "@/lib/config";
import { RequirePermission } from "@/components/RequirePermission";
import { Card, PageHeader, ErrorBanner, secondaryButtonClass, Modal } from "@/components/ui";

export default function MemberProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const memberId = Number(id);

  useDocumentTitle("Member Profile");

  const { data, error, loading } = useApiData<MemberProfileResponse>(
    () => api.team.memberProfile(memberId),
    [memberId],
  );

  const [complaints, setComplaints] = useState<ComplaintData[] | null>(null);
  const [complaintsLoading, setComplaintsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.team.memberComplaints(memberId).then((list) => {
      if (active) {
        setComplaints(list);
        setComplaintsLoading(false);
      }
    }).catch(() => {
      if (active) setComplaintsLoading(false);
    });
    return () => { active = false; };
  }, [memberId]);

  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleProfileClick = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    if (checkingId !== null) return;
    setCheckingId(id);
    try {
      await api.team.memberProfile(id);
      router.push(`/users/staff/${id}`);
    } catch (err) {
      setAuthError((err as Error).message || "Not authorized to view this member.");
    } finally {
      setCheckingId(null);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 text-sm">Loading member profile...</div>;
  if (error) return <div className="p-8"><ErrorBanner message={error} /><button onClick={() => router.back()} className={secondaryButtonClass + " mt-4"}>Back</button></div>;
  if (!data) return null;

  const { user, hierarchy, performance } = data;

  return (
    <RequirePermission anyOf={["team.view"]}>
      <div className="space-y-6">
        <div className="flex items-center gap-4 -mt-2 mb-2">
          <button onClick={() => router.back()} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <PageHeader title={`${user.name}'s Profile`} description={`${user.role.name} • ${user.email}`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info & Hierarchy */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="p-6 border-slate-200">
              <h3 className="text-xs font-bold text-slate-800 mb-4 uppercase tracking-wider text-slate-500">Member Details</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Status</span>
                  <span className={`font-semibold ${user.is_available ? "text-emerald-600" : "text-amber-600"}`}>
                    {user.is_available ? "Available" : "On Leave"}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Department</span>
                  <span className="text-slate-800 font-medium">{user.primary_department?.name || "All"}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Location</span>
                  <span className="text-slate-800 font-medium">{user.primary_location?.name || "All"}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Mobile</span>
                  <span className="text-slate-800 font-medium">{user.mobile || "—"}</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-slate-500">Joined</span>
                  <span className="text-slate-800 font-medium">{new Date(user.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </Card>

            <Card className="p-6 border-slate-200">
              <h3 className="text-xs font-bold text-slate-800 mb-4 uppercase tracking-wider text-slate-500">Reporting Hierarchy</h3>
              <div className="space-y-2.5 font-mono text-xs">
                {hierarchy.above.map((h: any, i: number) => (
                  <div key={h.id} className="flex flex-col" style={{ paddingLeft: `${i * 12}px` }}>
                    <div className="flex items-center gap-2">
                      {i > 0 && <span className="text-slate-300">└</span>}
                      <Link href={`/users/staff/${h.id}`} onClick={(e) => handleProfileClick(e, h.id)} className="font-bold text-sky-700 hover:underline flex items-center gap-1.5">
                        {h.name}
                        {checkingId === h.id && <Loader2 className="w-3 h-3 animate-spin text-sky-500" />}
                      </Link>
                    </div>
                    <div className="text-[10px] text-slate-400 pl-3">{h.role} {h.department ? ` • ${h.department}` : ""}</div>
                  </div>
                ))}

                <div className="flex flex-col" style={{ paddingLeft: `${hierarchy.above.length * 12}px` }}>
                  <div className="flex items-center gap-2 py-2 mb-1 border-l-[3px] border-sky-500 pl-2 bg-sky-50/50 rounded-r">
                    {hierarchy.above.length > 0 && <span className="text-slate-300">└</span>}
                    <span className="font-bold text-slate-900">{user.name}</span>
                  </div>
                </div>

                {hierarchy.below.map((h: any) => (
                  <div key={h.id} className="flex flex-col" style={{ paddingLeft: `${(hierarchy.above.length + 1) * 12}px` }}>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-300">└</span>
                      <Link href={`/users/staff/${h.id}`} onClick={(e) => handleProfileClick(e, h.id)} className="font-medium text-slate-700 hover:text-sky-700 hover:underline flex items-center gap-1.5">
                        {h.name}
                        {checkingId === h.id && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                      </Link>
                    </div>
                    <div className="text-[10px] text-slate-400 pl-4">{h.role}</div>
                  </div>
                ))}
                
                {hierarchy.below.length === 0 && (
                  <div className="text-[10px] text-slate-400 italic" style={{ paddingLeft: `${(hierarchy.above.length + 1) * 12}px` }}>
                    (No direct reports)
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Performance & Workload */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wider text-slate-500">Performance Overview (30 Days)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="p-4 flex flex-col items-center justify-center text-center shadow-sm">
                  <Clock className="w-5 h-5 text-sky-500 mb-2" />
                  <div className="text-xl font-bold text-slate-800">{performance.current_active_complaints}</div>
                  <div className="text-[10px] text-slate-500 font-semibold uppercase">Active Pending</div>
                </Card>
                <Card className="p-4 flex flex-col items-center justify-center text-center shadow-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mb-2" />
                  <div className="text-xl font-bold text-slate-800">{performance.resolved}</div>
                  <div className="text-[10px] text-slate-500 font-semibold uppercase">Resolved</div>
                </Card>
                <Card className="p-4 flex flex-col items-center justify-center text-center shadow-sm border-t-2 border-t-amber-400">
                  <ShieldCheck className="w-5 h-5 text-amber-500 mb-2" />
                  <div className="text-xl font-bold text-slate-800">{performance.resolution_sla_pct !== null ? `${performance.resolution_sla_pct}%` : "—"}</div>
                  <div className="text-[10px] text-slate-500 font-semibold uppercase">Resolution SLA</div>
                </Card>
                <Card className="p-4 flex flex-col items-center justify-center text-center shadow-sm">
                  <Star className="w-5 h-5 text-yellow-500 mb-2 fill-yellow-100" />
                  <div className="text-xl font-bold text-slate-800">{performance.avg_rating !== null ? performance.avg_rating : "—"}</div>
                  <div className="text-[10px] text-slate-500 font-semibold uppercase">Avg Rating</div>
                </Card>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wider text-slate-500">Active Workload</h3>
              <Card className="overflow-hidden">
                {complaintsLoading ? (
                  <div className="py-8 text-center text-xs text-slate-400">Loading active complaints...</div>
                ) : !complaints || complaints.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">No complaints currently assigned to this member.</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {complaints.map((c) => (
                      <div key={c.id} className="p-3.5 hover:bg-slate-50/80 flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-mono text-xs font-bold text-slate-800">{c.id}</span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              {c.status}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${c.priority.tone === "danger" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                              {c.priority.name}
                            </span>
                          </div>
                          <div className="text-xs font-medium text-slate-800 truncate">{c.title}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {c.department} • {c.location} • Filed {formatDateTime(c.created_at)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Link
                            href={`/complaints/${c.id}`}
                            target="_blank"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> View
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>
      
      {authError && (
        <Modal title="Access Restricted" onClose={() => setAuthError(null)}>
          <div className="flex flex-col items-center text-center space-y-4 py-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Permission Denied</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                {authError}
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={() => setAuthError(null)}
                className={secondaryButtonClass}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </RequirePermission>
  );
}
