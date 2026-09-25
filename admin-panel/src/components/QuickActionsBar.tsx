"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  UserPlus,
  Building,
  FileSpreadsheet,
  MapPinned,
  CheckCircle2,
  ChevronDown
} from "lucide-react";
import { api, Department, LocationNode } from "@/lib/api";
import { useSession } from "@/lib/session";
import { LocationPicker } from "./LocationPicker";
import { ErrorBanner, Field, inputClass, Modal, primaryButtonClass, secondaryButtonClass } from "./ui";

interface QuickAction {
  id: string;
  label: string;
  icon: React.ElementType;
  permission: string;
  href?: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

const actions: QuickAction[] = [
  {
    id: "register",
    label: "Register Complaint",
    icon: Plus,
    permission: "complaint.create",
    bgClass: "bg-[#eff6ff] hover:bg-[#dbeafe]",
    textClass: "text-[#2563eb]",
    borderClass: "border-blue-100",
  },
  {
    id: "users",
    label: "Add Staff User",
    icon: UserPlus,
    permission: "user.create",
    href: "/users?new=1",
    bgClass: "bg-[#f5f3ff] hover:bg-[#ede9fe]",
    textClass: "text-[#7c3aed]",
    borderClass: "border-purple-100",
  },
  {
    id: "department",
    label: "Add Department",
    icon: Building,
    permission: "department.create",
    href: "/departments?new=1",
    bgClass: "bg-[#ecfdf5] hover:bg-[#d1fae5]",
    textClass: "text-[#059669]",
    borderClass: "border-emerald-100",
  },
  {
    id: "import-citizens",
    label: "Import Citizens",
    icon: FileSpreadsheet,
    permission: "end_user.import",
    href: "/end-users?import=1",
    bgClass: "bg-[#fffbeb] hover:bg-[#fef3c7]",
    textClass: "text-[#d97706]",
    borderClass: "border-amber-100",
  },
  {
    id: "import-locations",
    label: "Import Locations",
    icon: MapPinned,
    permission: "location.import",
    href: "/locations?import=1",
    bgClass: "bg-[#fff1f2] hover:bg-[#ffe4e6]",
    textClass: "text-[#e11d48]",
    borderClass: "border-rose-100",
  },
];

const EMPTY_COMPLAINT = {
  title: "",
  department_id: null as number | null,
  category_id: null as number | null,
  location_id: null as number | null,
  priority: "Medium",
  description: "",
  citizen_name: "",
  citizen_phone: "",
};

export function QuickActionsBar({ onRefresh }: { onRefresh?: () => void }) {
  const { can } = useSession();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tree, setTree] = useState<LocationNode[]>([]);
  const [newComplaint, setNewComplaint] = useState(EMPTY_COMPLAINT);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const visible = actions.filter((a) => can(a.permission));

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownOpen && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  useEffect(() => {
    if (!registerOpen) return;
    Promise.all([api.departments.list(), api.locations.tree()])
      .then(([deps, locations]) => {
        setDepartments(deps.filter((d) => d.is_active));
        setTree(locations);
      })
      .catch((err) => setFormError((err as Error).message));
  }, [registerOpen]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleRegisterComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newComplaint.department_id === null || newComplaint.location_id === null) {
      setFormError("Choose a department and a location.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await api.complaints.quickCreate({
        ...newComplaint,
        department_id: newComplaint.department_id,
        location_id: newComplaint.location_id,
      });
      showToast(
        res.assignee
          ? `Complaint ${res.id} registered and assigned to ${res.assignee}`
          : `Complaint ${res.id} registered; waiting in the department queue`,
      );
      setRegisterOpen(false);
      setNewComplaint(EMPTY_COMPLAINT);
      if (onRefresh) onRefresh();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (visible.length === 0) return null;
  const selectedDepartment = departments.find((d) => d.id === newComplaint.department_id);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-xs rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg cursor-pointer transform hover:-translate-y-0.5"
      >
        <span>Quick Actions</span>
        <ChevronDown className="w-4 h-4" />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-3 w-52 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100/80 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {visible.map((act) => {
            const Icon = act.icon;
            const content = (
              <>
                <div className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-lg transition-colors ${act.bgClass}`}>
                  <Icon className={`w-3.5 h-3.5 ${act.textClass}`} />
                </div>
                <span className="text-xs font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">{act.label}</span>
              </>
            );
            const className = `group w-full flex items-center gap-3 px-3.5 py-2 hover:bg-slate-50 transition-colors cursor-pointer`;
            return act.href ? (
              <Link key={act.id} href={act.href} className={className} onClick={() => setDropdownOpen(false)}>
                {content}
              </Link>
            ) : (
              <button
                key={act.id}
                onClick={() => {
                  setDropdownOpen(false);
                  setRegisterOpen(true);
                }}
                className={className}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-none bg-slate-900 text-white shadow-2xl flex items-center gap-3 text-xs border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {registerOpen && (
        <Modal
          title="Register Complaint"
          description="Log a grievance on behalf of a citizen. It must fall inside your department/location scope."
          onClose={() => {
            setRegisterOpen(false);
            setFormError(null);
          }}
        >
          <form onSubmit={handleRegisterComplaint} className="space-y-3">
            <ErrorBanner message={formError} />
            <Field label="Complaint Title">
              <input
                required
                value={newComplaint.title}
                onChange={(e) => setNewComplaint({ ...newComplaint, title: e.target.value })}
                placeholder="e.g. Water logging in Sector 3"
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Department">
                <select
                  required
                  value={newComplaint.department_id ?? ""}
                  onChange={(e) =>
                    setNewComplaint({
                      ...newComplaint,
                      department_id: e.target.value ? Number(e.target.value) : null,
                      category_id: null,
                    })
                  }
                  className={inputClass}
                >
                  <option value="" disabled>
                    Select department
                  </option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Category">
                <select
                  value={newComplaint.category_id ?? ""}
                  disabled={!selectedDepartment}
                  onChange={(e) =>
                    setNewComplaint({ ...newComplaint, category_id: e.target.value ? Number(e.target.value) : null })
                  }
                  className={inputClass}
                >
                  <option value="">No category</option>
                  {selectedDepartment?.categories
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <Field label="Location">
              <LocationPicker
                tree={tree}
                value={newComplaint.location_id}
                onChange={(location_id) => setNewComplaint({ ...newComplaint, location_id })}
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Priority">
                <select
                  value={newComplaint.priority}
                  onChange={(e) => setNewComplaint({ ...newComplaint, priority: e.target.value })}
                  className={inputClass}
                >
                  {["Low", "Medium", "High", "Critical"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="Citizen Name">
                <input
                  value={newComplaint.citizen_name}
                  onChange={(e) => setNewComplaint({ ...newComplaint, citizen_name: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Citizen Mobile">
                <input
                  value={newComplaint.citizen_phone}
                  onChange={(e) => setNewComplaint({ ...newComplaint, citizen_phone: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Description">
              <textarea
                rows={2}
                value={newComplaint.description}
                onChange={(e) => setNewComplaint({ ...newComplaint, description: e.target.value })}
                placeholder="Details of the grievance..."
                className="w-full p-2 text-xs border border-slate-200 rounded-none focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </Field>
            <div className="pt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setRegisterOpen(false)} className={secondaryButtonClass}>
                Cancel
              </button>
              <button type="submit" disabled={submitting} className={primaryButtonClass}>
                {submitting ? "Submitting..." : "Submit Complaint"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
