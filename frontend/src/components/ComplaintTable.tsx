"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  Download,
  Loader2,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  Square,
  UserCheck,
  UserCircle2,
  X,
} from "lucide-react";
import { api, ComplaintData, PriorityRef, StaffUser } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { PriorityBadge, StatusBadge, TableMessage } from "./ui";
import { LiveSlaTicker } from "./LiveSlaTicker";
import { toast } from "./Toast";

const COLUMNS = ["ID", "Title", "Department", "Location", "Priority", "Status", "Assigned to", "Registered"];
/** The dashboard's narrower list leaves out location and date. */
const COMPACT_HIDDEN = new Set(["Location", "Registered"]);

function exportComplaintsToCsv(complaints: ComplaintData[]) {
  const headers = ["ID", "Title", "Department", "Category", "Location", "Priority", "Status", "Assignee", "Created At"];
  const rows = complaints.map((c) => [
    `"${c.id}"`,
    `"${(c.title || "").replace(/"/g, '""')}"`,
    `"${(c.department || "").replace(/"/g, '""')}"`,
    `"${(c.category || "").replace(/"/g, '""')}"`,
    `"${(c.location || "").replace(/"/g, '""')}"`,
    `"${(c.priority?.name || "").replace(/"/g, '""')}"`,
    `"${(c.status_label || c.status || "").replace(/"/g, '""')}"`,
    `"${(c.assignee?.name || "Unassigned").replace(/"/g, '""')}"`,
    `"${(c.created_at || "").replace(/"/g, '""')}"`,
  ]);
  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `complaints_export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function ComplaintTable({
  complaints,
  loading,
  emptyText,
  compact = false,
  enableBulkSelection,
  onActionCompleted,
}: {
  complaints: ComplaintData[];
  loading: boolean;
  emptyText: string;
  compact?: boolean;
  enableBulkSelection?: boolean;
  onActionCompleted?: () => void;
}) {
  const router = useRouter();
  const { me, can } = useSession();
  const allowBulk = enableBulkSelection ?? !compact;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeModal, setActiveModal] = useState<"assign" | "status" | "priority" | null>(null);
  const [busy, setBusy] = useState(false);

  // Modal form states
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [priorities, setPriorities] = useState<PriorityRef[]>([]);
  const [assigneeId, setAssigneeId] = useState<number | "">("");
  const [workflowAction, setWorkflowAction] = useState<string>("start");
  const [priorityId, setPriorityId] = useState<number | "">("");
  const [actionNote, setActionNote] = useState<string>("");

  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const canAssign = can("complaint.assign") || can("complaint.reassign") || me.is_super_admin;
  const canStatus = can("complaint.respond") || can("complaint.resolve") || me.is_super_admin;
  const canPriority = can("complaint.reclassify") || me.is_super_admin;

  const columns = compact ? COLUMNS.filter((c) => !COMPACT_HIDDEN.has(c)) : COLUMNS;

  // Manage header indeterminate state
  const visibleIds = complaints.map((c) => c.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id)) && !allVisibleSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  // Load staff and priorities on demand when modal opens
  useEffect(() => {
    if (activeModal === "assign" && staffUsers.length === 0) {
      api.users
        .list({ page_size: 100 })
        .then((res) => {
          setStaffUsers(res.items || []);
          if (res.items?.length && !assigneeId) {
            setAssigneeId(res.items[0].id);
          }
        })
        .catch(() => {});
    } else if (activeModal === "priority" && priorities.length === 0) {
      api.complaints
        .facets()
        .then((res) => {
          setPriorities(res.priorities || []);
          if (res.priorities?.length && !priorityId) {
            setPriorityId(res.priorities[0].id);
          }
        })
        .catch(() => {});
    }
  }, [activeModal, staffUsers.length, priorities.length, assigneeId, priorityId]);

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const toggleSelectOne = (id: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleExportSelected = () => {
    const selectedItems = complaints.filter((c) => selectedIds.includes(c.id));
    if (selectedItems.length === 0) return;
    exportComplaintsToCsv(selectedItems);
    toast.success("CSV Exported", `Downloaded data for ${selectedItems.length} complaints.`);
  };

  const executeBulkAction = async () => {
    if (!activeModal || selectedIds.length === 0) return;
    setBusy(true);

    try {
      if (activeModal === "assign") {
        if (!assigneeId) {
          toast.error("Selection Required", "Please choose a staff member to assign.");
          setBusy(false);
          return;
        }
        const res = await api.complaints.bulkAction({
          complaint_ids: selectedIds,
          action_type: "assign",
          assignee_id: Number(assigneeId),
          assignee_reason: actionNote.trim() || "Bulk reassignment via dashboard",
        });
        toast.success("Bulk Assign Completed", `Assigned ${res.updated_count} complaints successfully.`);
        if (res.failed && res.failed.length > 0) {
          toast.warning("Partial Updates", `${res.failed.length} tickets could not be assigned.`);
        }
      } else if (activeModal === "status") {
        if (!workflowAction) {
          toast.error("Selection Required", "Please choose a workflow action.");
          setBusy(false);
          return;
        }
        if (workflowAction === "resolve" && !actionNote.trim()) {
          toast.error("Resolution Note Required", "Please specify a resolution message.");
          setBusy(false);
          return;
        }
        const res = await api.complaints.bulkAction({
          complaint_ids: selectedIds,
          action_type: "status",
          workflow_action: workflowAction,
          workflow_note: actionNote.trim() || undefined,
        });
        toast.success("Status Updated", `Updated status for ${res.updated_count} complaints.`);
        if (res.failed && res.failed.length > 0) {
          toast.warning("Partial Updates", `${res.failed.length} tickets were skipped due to status rules.`);
        }
      } else if (activeModal === "priority") {
        if (!priorityId) {
          toast.error("Selection Required", "Please choose a priority.");
          setBusy(false);
          return;
        }
        const res = await api.complaints.bulkAction({
          complaint_ids: selectedIds,
          action_type: "priority",
          priority_id: Number(priorityId),
          priority_reason: actionNote.trim() || "Bulk priority reclassification",
        });
        toast.success("Priority Updated", `Reclassified ${res.updated_count} complaints.`);
        if (res.failed && res.failed.length > 0) {
          toast.warning("Partial Updates", `${res.failed.length} tickets could not be updated.`);
        }
      }

      setSelectedIds([]);
      setActiveModal(null);
      setActionNote("");
      onActionCompleted?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Bulk action failed";
      toast.error("Bulk Action Failed", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Phones: one card per complaint */}
      <ul className="md:hidden divide-y divide-slate-100">
        {loading && complaints.length === 0 ? (
          <li className="px-4 py-8 text-center text-xs text-slate-400">Loading…</li>
        ) : complaints.length === 0 ? (
          <li className="px-4 py-8 text-center text-xs text-slate-400">{emptyText}</li>
        ) : (
          complaints.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <li
                key={item.id}
                className={`transition-colors ${isSelected ? "bg-blue-50/60" : "hover:bg-slate-50"}`}
              >
                <div className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {allowBulk && (
                        <button
                          type="button"
                          onClick={(e) => toggleSelectOne(item.id, e)}
                          className="p-1 -ml-1 text-slate-500 hover:text-blue-600 focus:outline-none"
                          aria-label={`Select ticket ${item.id}`}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 fill-blue-50" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </button>
                      )}
                      <Link
                        href={`/complaints/${encodeURIComponent(item.id)}`}
                        className="font-mono text-[11px] text-slate-500 hover:text-blue-600"
                      >
                        {item.id}
                      </Link>
                    </div>
                    <PriorityBadge priority={item.priority} />
                  </div>
                  <Link href={`/complaints/${encodeURIComponent(item.id)}`} className="block space-y-1.5">
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
                    <div className="pt-0.5">
                      <LiveSlaTicker complaint={item} />
                    </div>
                  </Link>
                </div>
              </li>
            );
          })
        )}
      </ul>

      {/* Desktop Table */}
      <div className="hidden md:block relative overflow-x-auto">
        <table className={`w-full ${compact ? "min-w-160" : "min-w-225"} text-left text-xs`}>
          <thead className="bg-white">
            <tr className="border-b border-slate-100 text-slate-400 uppercase text-[11px] tracking-wider">
              {allowBulk && (
                <th className="py-3 pl-5 pr-2 w-10">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    disabled={complaints.length === 0}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                    aria-label="Select all visible tickets"
                  />
                </th>
              )}
              {columns.map((c, i) => (
                <th
                  key={c}
                  className={`py-3 font-semibold ${
                    i === 0 && !allowBulk ? "pl-5" : "px-2"
                  } ${i === columns.length - 1 ? "pr-5" : ""} ${c === "Registered" ? "text-right" : ""}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && complaints.length === 0 ? (
              <TableMessage colSpan={columns.length + (allowBulk ? 1 : 0)}>Loading…</TableMessage>
            ) : complaints.length === 0 ? (
              <TableMessage colSpan={columns.length + (allowBulk ? 1 : 0)}>{emptyText}</TableMessage>
            ) : (
              complaints.map((item) => {
                const href = `/complaints/${encodeURIComponent(item.id)}`;
                const isSelected = selectedIds.includes(item.id);
                return (
                  <tr
                    key={item.id}
                    className={`group cursor-pointer align-top transition-colors ${
                      isSelected ? "bg-blue-50/50 hover:bg-blue-50/80" : "hover:bg-slate-50/70"
                    }`}
                    onClick={() => router.push(href)}
                  >
                    {allowBulk && (
                      <td
                        className="py-3 pl-5 pr-2 w-10 align-top"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleSelectOne(item.id, e)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          aria-label={`Select ticket ${item.id}`}
                        />
                      </td>
                    )}
                    <td
                      className={`py-3 ${
                        !allowBulk ? "pl-5" : ""
                      } px-2 font-mono text-[11px] text-slate-600 whitespace-nowrap`}
                    >
                      <Link href={href} onClick={(e) => e.stopPropagation()} className="hover:text-blue-600 font-semibold">
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
                        <span className="flex items-center gap-1" title={item.location_detail?.label || item.location}>
                          <MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                          {item.location}
                        </span>
                      </td>
                    )}
                    <td className="py-3 px-2">
                      <PriorityBadge priority={item.priority} />
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex flex-col gap-1 items-start">
                        <StatusBadge status={item.status} label={item.status_label} />
                        <LiveSlaTicker complaint={item} />
                      </div>
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
                      <td className="py-3 pr-5 text-right text-slate-500 whitespace-nowrap">
                        {formatDateTime(item.created_at)}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Floating Bulk Operations Island */}
      {allowBulk && selectedIds.length > 0 && (
        <div className="fixed bottom-6  left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md text-white px-4 py-2.5  rounded-2xl shadow-2xl border border-slate-700/80 flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
          {/* Selected count pill */}
          <div className="flex items-center gap-2 border-r border-slate-700 pr-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-xs">
              {selectedIds.length}
            </span>
            <span className="text-xs font-medium text-slate-300">Selected</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            {canAssign && (
              <button
                type="button"
                onClick={() => setActiveModal("assign")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 transition border border-slate-700/60 hover:border-slate-600 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>Assign</span>
              </button>
            )}

            {canStatus && (
              <button
                type="button"
                onClick={() => setActiveModal("status")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 transition border border-slate-700/60 hover:border-slate-600 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                <span>Status</span>
              </button>
            )}

            {canPriority && (
              <button
                type="button"
                onClick={() => setActiveModal("priority")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 transition border border-slate-700/60 hover:border-slate-600 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                <span>Priority</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportSelected}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 transition border border-slate-700/60 hover:border-slate-600 cursor-pointer"
              title="Export selected as CSV"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>Export</span>
            </button>
          </div>

          {/* Clear selection */}
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition ml-1 cursor-pointer"
            title="Deselect all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modal Dialog for Bulk Actions */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                  {selectedIds.length}
                </span>
                <h3 className="font-bold text-slate-800 text-sm">
                  {activeModal === "assign"
                    ? "Bulk Assign Staff"
                    : activeModal === "status"
                      ? "Bulk Update Status"
                      : "Bulk Change Priority"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {activeModal === "assign" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Assign to Staff Member</label>
                    <select
                      value={assigneeId}
                      onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : "")}
                      className="w-full h-10 px-3 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      <option value="">Select staff member…</option>
                      {staffUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role?.name || "Staff"}) {u.is_available === false ? "• Unavailable" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Note / Reason (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Reassigned due to shift workload"
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      className="w-full h-10 px-3 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {activeModal === "status" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Target Action</label>
                    <select
                      value={workflowAction}
                      onChange={(e) => setWorkflowAction(e.target.value)}
                      className="w-full h-10 px-3 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      <option value="acknowledge">Acknowledge</option>
                      <option value="start">Start Work (In Progress)</option>
                      <option value="resolve">Mark Resolved</option>
                      <option value="close">Close Ticket</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {workflowAction === "resolve" ? "Resolution Note (Required)" : "Note / Message (Optional)"}
                    </label>
                    <input
                      type="text"
                      placeholder={
                        workflowAction === "resolve"
                          ? "Explain resolution steps provided to the citizen"
                          : "Optional status transition note"
                      }
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      className="w-full h-10 px-3 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {activeModal === "priority" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Select Priority</label>
                    <select
                      value={priorityId}
                      onChange={(e) => setPriorityId(e.target.value ? Number(e.target.value) : "")}
                      className="w-full h-10 px-3 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      <option value="">Select priority level…</option>
                      {priorities.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Reason (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Upgraded due to high impact"
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      className="w-full h-10 px-3 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200/50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeBulkAction}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 transition disabled:opacity-50 cursor-pointer"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Apply to {selectedIds.length} tickets</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
