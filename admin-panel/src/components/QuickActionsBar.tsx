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

  const visible = actions.filter((a) => can(a.permission));

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
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-bold text-slate-800">Quick Actions</h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {visible.map((act) => {
          const Icon = act.icon;
          const className = `flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl border ${act.borderClass} ${act.bgClass} transition-all duration-200 cursor-pointer shadow-sm hover:shadow hover:-translate-y-0.5`;
          const content = (
            <>
              <Icon className={`w-4 h-4 ${act.textClass}`} />
              <span className={`text-xs font-bold ${act.textClass} tracking-tight`}>{act.label}</span>
            </>
          );
          return act.href ? (
            <Link key={act.id} href={act.href} className={className}>
              {content}
            </Link>
          ) : (
            <button key={act.id} onClick={() => setRegisterOpen(true)} className={className}>
              {content}
            </button>
          );
        })}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-slate-900 text-white shadow-2xl flex items-center gap-3 text-xs border border-slate-700">
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
                className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
