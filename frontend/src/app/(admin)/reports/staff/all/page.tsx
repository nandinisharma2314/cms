"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, Printer } from "lucide-react";
import { api, PerformanceRow } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { formatHours } from "@/lib/format";
import { useApiData } from "@/lib/hooks";
import { RequirePermission } from "@/components/RequirePermission";
import { ErrorBanner, Spinner } from "@/components/ui";

function Indicator({
  row,
  label,
  field,
  desc,
  format = (v: any) => (v !== null && v !== undefined ? v.toLocaleString() : "—"),
}: {
  row: any;
  label: string;
  field: string;
  desc: string;
  format?: (v: any) => React.ReactNode;
}) {
  const val = row[field];

  let colorClass = "text-slate-800";
  if (typeof val === "number") {
    if (field.includes("sla")) {
      colorClass = val < 70 ? "text-red-500" : val < 90 ? "text-orange-500" : "text-green-500";
    } else if (field === "avg_rating") {
      colorClass = val < 3 ? "text-red-500" : val < 4 ? "text-orange-500" : "text-green-500";
    } else if (["pending", "rejected", "sla_breaches", "escalated_now", "reopened"].includes(field)) {
      colorClass = val === 0 ? "text-green-500" : val < 5 ? "text-orange-500" : "text-red-500";
    } else if (field === "resolved") {
      colorClass = "text-green-600";
    } else {
      // Default for total, avg_response_hours, etc
      colorClass = "text-slate-800";
    }
  }

  return (
    <div className="flex justify-between items-center border-b border-slate-50 pb-3">
      <div>
        <div className="text-sm font-bold text-slate-800">{label}</div>
        <div className="text-[10px] text-slate-400 mt-1">{desc}</div>
      </div>
      <div className="flex items-center gap-2">
        <div className={`text-lg font-bold ${colorClass}`}>{format(val)}</div>
      </div>
    </div>
  );
}

function StaffReportCard({ staff, config }: { staff: PerformanceRow; config: any }) {
  const initials = staff.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
  const total = staff.total;
  const solved = staff.resolved;
  const unsolved = staff.pending;
  const ratingOutOf5 = total > 0 ? (solved / total) * 5.0 : 0.0;
  const solvedPct = total > 0 ? (solved / total) * 100 : 0;
  const unsolvedPct = total > 0 ? (unsolved / total) * 100 : 0;

  // Rating ring (SVG) - Half circle
  const radius = 70;
  const circumference = Math.PI * radius; // Half circle circumference
  const strokeDashoffset = circumference - (ratingOutOf5 / 5.0) * circumference;

  return (
    <div className="max-w-4xl mx-auto p-6 print:p-0 font-sans text-slate-800 page-break">
      <div className="flex items-start justify-between border-b-2 border-slate-200 pb-4 mb-4">
        <div className="flex items-center">
          <div>
            <h1 className="text-2xl font-bold uppercase text-slate-900 tracking-wide">
              {config.organisation_name || "Organization Name"}
            </h1>
            <div className="text-sm text-slate-500 font-medium uppercase mt-1 tracking-wider">Performance Review 2026</div>
            {(config.support?.email || config.support?.phone) && (
              <div className="text-xs text-slate-500 mt-2 font-medium flex items-center gap-2">
                {config.support.email && <span>{config.support.email}</span>}
                {config.support.email && config.support.phone && <span className="text-slate-300">•</span>}
                {config.support.phone && <span>{config.support.phone}</span>}
              </div>
            )}
          </div>
        </div>
        <div className="text-right flex flex-col items-end gap-1">
          <div className="text-sm font-bold text-red-600 tracking-wider">CONFIDENTIAL</div>
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg p-5 mb-4 bg-white shadow-sm flex items-center gap-6">
        <div className="relative">
          <div className="w-24 h-24 bg-red-600 text-white rounded-lg flex items-center justify-center text-3xl font-bold">
            {initials}
          </div>
          <div className="absolute -bottom-2 -right-2 bg-white rounded-full p-0.5 shadow-sm">
            <CheckCircle className="w-6 h-6 text-green-500 fill-white" />
          </div>
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-slate-900">{staff.name}</h2>
          <div className="text-sm font-semibold text-slate-500 tracking-wider mb-4 mt-1">
            <span className="uppercase">{staff.role || "Staff Member"}</span>
            {staff.location && <span className="normal-case"> &bull; {staff.location}</span>}
          </div>
          <div className="flex flex-row flex-wrap gap-x-12 gap-y-4 mt-2">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Workplace</div>
              <div className="text-xs font-semibold text-slate-700">{staff.department || "—"}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Reports To</div>
              <div className="text-xs font-semibold text-slate-700">{staff.superior_name || "—"}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Email</div>
              <div className="text-xs font-semibold text-slate-700">{staff.email || "—"}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Mobile Number</div>
              <div className="text-xs font-semibold text-slate-700">{staff.mobile || "—"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-4">
        <div className="border border-slate-200 rounded-lg p-5 bg-slate-50 flex flex-col items-center justify-center relative shadow-sm h-40">
          <div className="absolute top-4 left-4 text-xs font-bold text-slate-500 tracking-wider uppercase">Overall Rating</div>
          <div className="mt-6 flex flex-col items-center relative w-full h-full justify-end pb-2">
            <svg className="w-40 h-20" viewBox="0 0 160 80">
              <path d="M 10 80 A 70 70 0 0 1 150 80" stroke="#e2e8f0" strokeWidth="16" fill="none" />
              <path
                d="M 10 80 A 70 70 0 0 1 150 80"
                stroke="#3b82f6"
                strokeWidth="16"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute bottom-2 flex flex-col items-center justify-center mt-2">
              <span className="text-2xl font-black text-slate-800 leading-none">{ratingOutOf5.toFixed(1)}</span>
              <span className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Out of 5.0</span>
            </div>
          </div>
        </div>

        <div className="col-span-2 border border-slate-200 rounded-lg p-5 bg-slate-50 relative shadow-sm h-40">
          <div className="absolute top-4 left-4 text-xs font-bold text-slate-500 tracking-wider uppercase">Velocity Metrics</div>
          <div className="absolute top-4 right-4 text-xs font-bold text-slate-500 tracking-wider uppercase">Current Period</div>
          <div className="mt-8 grid grid-cols-5 gap-6 h-full">
            <div className="col-span-2 flex flex-col items-center justify-center border-r border-slate-200 pr-4 mt-2">
              <div className="text-6xl font-black text-slate-800 leading-none">{total}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2">Total Complaints</div>
            </div>
            <div className="col-span-3 flex flex-col justify-center gap-4 pl-2">
              <div className="space-y-1 mt-4">
                <div className="flex justify-between items-end">
                  <span className="text-sm font-bold text-slate-700">Solved Complaints</span>
                  <span className="text-sm font-bold text-green-600">
                    {solved} ({solvedPct.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${solvedPct}%` }} />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-end">
                  <span className="text-sm font-bold text-slate-700">Unsolved Complaints</span>
                  <span className="text-sm font-bold text-orange-500">
                    {unsolved} ({unsolvedPct.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-400 rounded-full" style={{ width: `${unsolvedPct}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg p-5 bg-white shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-slate-700 tracking-wider uppercase">Performance Indicators</h3>
          <div className="text-xs font-bold text-slate-400 tracking-wider uppercase">{ratingOutOf5.toFixed(1)}/5 AVG</div>
        </div>
        <div className="grid grid-cols-2 gap-x-12 gap-y-6">
          <Indicator row={staff} label="Complaints" field="total" desc="Total complaints handled" />
          <Indicator row={staff} label="Pending" field="pending" desc="Currently open or in progress" />
          <Indicator row={staff} label="Resolved" field="resolved" desc="Successfully closed" />
          <Indicator row={staff} label="Rejected" field="rejected" desc="Invalid or duplicate" />
          <Indicator
            row={staff}
            label="Avg response"
            field="avg_response_hours"
            desc="Time to first response"
            format={formatHours}
          />
          <Indicator
            row={staff}
            label="Avg resolution"
            field="avg_resolution_hours"
            desc="Time to resolution"
            format={formatHours}
          />
          <Indicator
            row={staff}
            label="Response SLA"
            field="response_sla_pct"
            desc="Response targets met"
            format={(v) => (v !== null ? `${v.toFixed(0)}%` : "—")}
          />
          <Indicator
            row={staff}
            label="Resolution SLA"
            field="resolution_sla_pct"
            desc="Resolution targets met"
            format={(v) => (v !== null ? `${v.toFixed(0)}%` : "—")}
          />
          <Indicator row={staff} label="Missed a target" field="sla_breaches" desc="SLA breaches" />
          <Indicator row={staff} label="Escalated now" field="escalated_now" desc="Currently escalated" />
          <Indicator
            row={staff}
            label="Rating"
            field="avg_rating"
            desc="End user feedback"
            format={(v) => (v !== null ? `${v.toFixed(1)} / 5` : "—")}
          />
          <Indicator row={staff} label="Reopened" field="reopened" desc="Complaints reopened after resolution" />
        </div>
      </div>

      <div className="mt-8 flex justify-between items-center text-[9px] font-semibold text-slate-400 uppercase tracking-widest border-t border-slate-100 pt-4">
        <div>Generated: {new Date().toLocaleString()}</div>
        <div>{config.organisation_name || "KVON TECH"} ERP • PERFORMANCE REVIEW</div>
      </div>
    </div>
  );
}

function AllReportsContent() {
  const searchParams = useSearchParams();
  const date_from = searchParams.get("date_from") ?? undefined;
  const date_to = searchParams.get("date_to") ?? undefined;

  const config = useConfig();
  useDocumentTitle("Bulk Staff Performance Review");

  const { data: rows, error } = useApiData(() => api.reports.table("agents", { date_from, date_to }), [date_from, date_to]);

  useEffect(() => {
    if (searchParams?.get("print") === "true" && rows) {
      const t = setTimeout(() => {
        window.parent.postMessage("print_ready", "*");
      }, 1000); // bulk might need more time
      return () => clearTimeout(t);
    }
  }, [searchParams, rows]);

  if (error) return <ErrorBanner message={error} />;
  if (!rows) return <Spinner />;

  const validStaff = rows.filter((r: PerformanceRow) => r.id !== null);

  if (validStaff.length === 0) {
    return <div className="p-10 text-center text-slate-500">No staff data found in this period.</div>;
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="flex justify-between items-center p-4 border-b border-slate-100 print:hidden bg-slate-50">
        <div className="text-sm font-semibold text-slate-700">Generating report for {validStaff.length} staff members</div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded shadow-sm hover:bg-blue-700 font-medium text-sm transition-colors"
        >
          <Printer className="w-4 h-4" /> Download All as PDF
        </button>
      </div>

      <div className="print-container">
        {validStaff.map((staff) => (
          <StaffReportCard key={staff.id} staff={staff} config={config} />
        ))}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          aside, header {
            display: none !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          html, body, .h-screen, .overflow-hidden, .overflow-y-auto, [class*="overflow-"] {
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
          }
          .print-container {
            width: 100%;
          }
          .page-break {
            page-break-after: always;
            break-after: page;
            padding: 20px !important;
            min-height: 100vh;
            box-shadow: none !important;
          }
          .page-break:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          @page { margin: 0; }
          .bg-white, .bg-slate-50 {
            background-color: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `,
        }}
      />
    </div>
  );
}

export default function BulkStaffReportPage() {
  return (
    <RequirePermission anyOf={["reports.view"]}>
      <AllReportsContent />
    </RequirePermission>
  );
}
