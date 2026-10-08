"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpCircle, MapPin, UserCircle2 } from "lucide-react";
import { ComplaintData } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { currentSla, SLA_BADGE } from "@/lib/status";
import { PriorityBadge, StatusBadge, TableMessage } from "./ui";

/** Only what needs attention: breached / due soon / paused, and escalation. */
function SlaChips({ item }: { item: ComplaintData }) {
  const state = currentSla(item.sla);
  const badge = state === "breached" || state === "at_risk" || state === "paused" ? SLA_BADGE[state] : null;
  if (!badge && !item.escalation) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {badge && <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>}
      {item.escalation && (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-100"
          title={`Escalated to ${item.escalation.to.name}`}
        >
          <ArrowUpCircle className="w-3 h-3" aria-hidden="true" /> L{item.escalation.level} · {item.escalation.to.name}
        </span>
      )}
    </div>
  );
}

const COLUMNS = ["ID", "Title", "Department", "Location", "Priority", "Status", "Assigned to", "Registered"];
/** The dashboard's narrower list leaves out location and date. */
const COMPACT_HIDDEN = new Set(["Location", "Registered"]);

export function ComplaintTable({
  complaints,
  loading,
  emptyText,
  compact = false,
}: {
  complaints: ComplaintData[];
  loading: boolean;
  emptyText: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const columns = compact ? COLUMNS.filter((c) => !COMPACT_HIDDEN.has(c)) : COLUMNS;
  return (
    <>
      {/* Phones: one card per complaint */}
      <ul className="md:hidden divide-y divide-slate-100">
        {loading && complaints.length === 0 ? (
          <li className="px-4 py-8 text-center text-xs text-slate-400">Loading…</li>
        ) : complaints.length === 0 ? (
          <li className="px-4 py-8 text-center text-xs text-slate-400">{emptyText}</li>
        ) : (
          complaints.map((item) => (
            <li key={item.id}>
              <Link href={`/complaints/${encodeURIComponent(item.id)}`} className="block px-4 py-3 hover:bg-slate-50 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-slate-500">{item.id}</span>
                  <PriorityBadge priority={item.priority} />
                </div>
                <div className="text-xs font-bold text-slate-800">{item.title}</div>
                <div className="text-[11px] text-slate-500">
                  {item.department}
                  {item.category && ` · ${item.category}`} · {item.location}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={item.status} label={item.status_label} />
                  <span className={`text-[11px] ${item.assignee ? "text-slate-600" : "text-rose-600 font-semibold"}`}>
                    {item.assignee ? item.assignee.name : "Unassigned"}
                  </span>
                </div>
                <SlaChips item={item} />
              </Link>
            </li>
          ))
        )}
      </ul>
      <div className="hidden md:block relative overflow-x-auto">
        <table className={`w-full ${compact ? "min-w-160" : "min-w-225"} text-left text-xs`}>
          <thead className="bg-white">
            <tr className="border-b border-slate-100 text-slate-400 uppercase text-[11px] tracking-wider">
              {columns.map((c, i) => (
                <th
                  key={c}
                  className={`py-3 font-semibold ${i === 0 ? "pl-5" : "px-2"} ${i === columns.length - 1 ? "pr-5" : ""} ${c === "Registered" ? "text-right" : ""}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && complaints.length === 0 ? (
              <TableMessage colSpan={columns.length}>Loading…</TableMessage>
            ) : complaints.length === 0 ? (
              <TableMessage colSpan={columns.length}>{emptyText}</TableMessage>
            ) : (
              complaints.map((item) => {
                const href = `/complaints/${encodeURIComponent(item.id)}`;
                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/70 group cursor-pointer align-top"
                    onClick={() => router.push(href)}
                  >
                    <td className="py-3 pl-5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      <Link href={href} onClick={(e) => e.stopPropagation()} className="hover:text-blue-600">
                        {item.id}
                      </Link>
                    </td>
                    <td
                      className="py-3 px-2 font-bold text-slate-800 group-hover:text-blue-600 max-w-60 truncate"
                      title={item.title}
                    >
                      {item.title}
                    </td>
                    <td className="py-3 px-2 text-slate-600 whitespace-nowrap">
                      {item.department}
                      {item.category && <div className="text-[10px] text-slate-400">{item.category}</div>}
                    </td>
                    {!compact && (
                      <td className="py-3 px-2 text-slate-600 whitespace-nowrap">
                        <span className="flex items-center gap-1" title={item.location_detail.label}>
                          <MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                          {item.location}
                        </span>
                      </td>
                    )}
                    <td className="py-3 px-2">
                      <PriorityBadge priority={item.priority} />
                    </td>
                    <td className="py-3 px-2">
                      <StatusBadge status={item.status} label={item.status_label} />
                      <SlaChips item={item} />
                    </td>
                    <td className={`py-3 px-2 text-slate-600 whitespace-nowrap ${compact ? "pr-5" : ""}`}>
                      {item.assignee ? (
                        <span className="flex items-center gap-1">
                          <UserCircle2 className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                          {item.assignee.name}
                        </span>
                      ) : (
                        <span className="text-rose-600 font-semibold">Unassigned</span>
                      )}
                    </td>
                    {!compact && (
                      <td className="py-3 pr-5 text-right text-slate-500 whitespace-nowrap">{formatDateTime(item.created_at)}</td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
