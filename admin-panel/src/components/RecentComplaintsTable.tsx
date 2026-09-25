"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Zap,
  Droplets,
  Trash2,
  Building,
  Trees,
  MapPin,
  HelpCircle,
  UserCircle2,
  ArrowUpCircle,
} from "lucide-react";
import { ComplaintData } from "@/lib/api";
import { currentSla, PRIORITY_BADGE, SLA_BADGE, STATUS_BADGE } from "@/lib/status";

interface RecentComplaintsTableProps {
  complaints?: ComplaintData[];
  isLoading?: boolean;
  title?: string;
  /** Show every row instead of the first five. */
  showAllRows?: boolean;
  emptyText?: string;
}

const getDeptIconInfo = (dept: string) => {
  switch (dept) {
    case "Electricity":
      return { icon: Zap, color: "text-blue-500" };
    case "Water":
      return { icon: Droplets, color: "text-sky-500" };
    case "Sanitation":
      return { icon: Trash2, color: "text-emerald-500" };
    case "Roads":
      return { icon: Building, color: "text-slate-600" };
    case "General":
      return { icon: Trees, color: "text-emerald-600" };
    default:
      return { icon: HelpCircle, color: "text-blue-500" };
  }
};

/** Shows only what needs attention: breached / due soon / paused, and escalation. */
function SlaChips({ item }: { item: ComplaintData }) {
  const state = item.sla ? currentSla(item.sla) : null;
  const badge = state && ["breached", "at_risk", "paused"].includes(state) ? SLA_BADGE[state] : null;
  if (!badge && !item.escalation) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {badge && <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>}
      {item.escalation && (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-100"
          title={`Escalated to ${item.escalation.to.name}`}
        >
          <ArrowUpCircle className="w-3 h-3" /> L{item.escalation.level} · {item.escalation.to.name}
        </span>
      )}
    </div>
  );
}

export function RecentComplaintsTable({
  complaints = [],
  isLoading = false,
  title = "Recent Complaints",
  showAllRows = false,
  emptyText = "No complaints in your scope.",
}: RecentComplaintsTableProps) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(showAllRows);
  const displayList = showAll ? complaints : complaints.slice(0, 5);

  return (
    <div className="flex flex-col p-6 bg-white rounded-none border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] h-[450px]">
      {/* Table Card Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
          <span className="text-xs text-slate-400 font-medium">({complaints.length} in your scope)</span>
        </div>
        {complaints.length > 5 && !showAllRows && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="flex items-center text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
          >
            <span>{showAll ? "Show Less" : "View All"}</span>
            <ChevronRight className={`w-3.5 h-3.5 ml-0.5 transition-transform ${showAll ? "rotate-90" : ""}`} />
          </button>
        )}
      </div>

      {/* Table Content */}
      <div className="overflow-auto flex-1 min-h-0 pr-1">
        <table className="w-full text-left text-xs relative">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase text-[11px] tracking-wider pb-3">
              <th className="pb-3 pl-2 font-semibold">ID</th>
              <th className="pb-3 font-semibold">Title</th>
              <th className="pb-3 font-semibold">Department</th>
              <th className="pb-3 font-semibold">Location</th>
              <th className="pb-3 font-semibold">Priority</th>
              <th className="pb-3 font-semibold">Status</th>
              <th className="pb-3 font-semibold">Assigned To</th>
              <th className="pb-3 pr-2 text-right font-semibold">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading && complaints.length === 0 ? (
              [1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="animate-pulse">
                  {[16, 36, 24, 20, 12, 16, 20, 16].map((w, j) => (
                    <td key={j} className="py-4">
                      <div className="h-3 bg-slate-100 rounded" style={{ width: w * 4 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : displayList.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                  {emptyText}
                </td>
              </tr>
            ) : (
              displayList.map((item) => {
                const { icon: DeptIcon, color: iconColor } = getDeptIconInfo(item.department);
                const href = `/complaints/${item.id}`;
                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                    onClick={() => router.push(href)}
                  >
                    <td className="py-3.5 pl-2 font-medium text-slate-600 font-mono text-[11px]">
                      <Link href={href} onClick={(e) => e.stopPropagation()} className="hover:text-blue-600">
                        {item.id}
                      </Link>
                    </td>
                    <td className="py-3.5 font-bold text-slate-800 group-hover:text-blue-600 transition-colors max-w-[220px] truncate">
                      {item.title}
                    </td>
                    <td className="py-3.5 text-slate-600">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <DeptIcon className={`w-3.5 h-3.5 ${iconColor}`} />
                        <span>{item.department}</span>
                      </div>
                    </td>
                    <td className="py-3.5 text-slate-600">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{item.location}</span>
                      </div>
                    </td>
                    <td className="py-3.5">
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-none ${PRIORITY_BADGE[item.priority] ?? ""}`}>
                        {item.priority}
                      </span>
                    </td>
                    <td className="py-3.5">
                      <span className={`inline-block px-2.5 py-1 text-[11px] font-semibold rounded-none whitespace-nowrap ${STATUS_BADGE[item.status]}`}>
                        {item.status_label}
                      </span>
                      <SlaChips item={item} />
                    </td>
                    <td className="py-3.5 text-slate-600 whitespace-nowrap">
                      {item.assignee ? (
                        <span className="flex items-center gap-1">
                          <UserCircle2 className="w-3.5 h-3.5 text-slate-400" />
                          {item.assignee.name}
                        </span>
                      ) : (
                        <span className="text-rose-500 font-semibold">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3.5 pr-2 text-right text-slate-500 font-medium whitespace-nowrap">{item.date}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
