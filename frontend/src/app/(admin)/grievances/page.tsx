"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle,
  Download,
  Eye,
  EyeOff,
  Lock,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import { api, GrievanceOptions, GrievanceSeverity, GrievanceStatus, GrievanceTargetType, StaffGrievance } from "@/lib/api";
import { useDocumentTitle } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import {
  Card,
  ErrorBanner,
  Field,
  inputClass,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  primaryButtonClass,
  secondaryButtonClass,
  TableMessage,
} from "@/components/ui";

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-blue-50 text-blue-700 border-blue-200",
  high: "bg-amber-50 text-amber-800 border-amber-200 font-semibold",
  critical: "bg-rose-50 text-rose-700 border-rose-200 font-bold",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  investigating: "Investigating",
  action_taken: "Action Taken",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-purple-50 text-purple-700 border-purple-200",
  under_review: "bg-sky-50 text-sky-700 border-sky-200",
  investigating: "bg-amber-50 text-amber-800 border-amber-200",
  action_taken: "bg-emerald-50 text-emerald-800 border-emerald-200",
  resolved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  dismissed: "bg-slate-100 text-slate-600 border-slate-200",
};

function FileGrievanceModal({
  options,
  onClose,
  onCreated,
}: {
  options: GrievanceOptions | null | undefined;
  onClose: () => void;
  onCreated: (msg: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [targetType, setTargetType] = useState<GrievanceTargetType>("colleague");
  const [accusedUserId, setAccusedUserId] = useState<number | "">("");
  const [category, setCategory] = useState("harassment");
  const [severity, setSeverity] = useState<GrievanceSeverity>("medium");
  const [incidentDate, setIncidentDate] = useState("");
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [locationId] = useState<number | "">("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      setError("Please enter a subject.");
      return;
    }
    if (!description.trim()) {
      setError("Please describe the incident in detail.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append("subject", subject.trim());
    formData.append("description", description.trim());
    formData.append("target_type", targetType);
    formData.append("category", category);
    formData.append("severity", severity);
    formData.append("is_anonymous", String(isAnonymous));
    if (accusedUserId) formData.append("accused_user_id", String(accusedUserId));
    if (incidentDate) formData.append("incident_date", incidentDate);
    if (departmentId) formData.append("department_id", String(departmentId));
    if (locationId) formData.append("location_id", String(locationId));

    files.forEach((f) => formData.append("files", f));

    try {
      const res = await api.grievances.file(formData);
      onCreated(`Grievance ${res.tracking_id} successfully submitted.`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Report a Workplace Issue"
      description="Report bad behavior, bullying, or rule-breaking. You are protected from any payback for reporting this."
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[78vh] overflow-y-auto pr-1">
        <ErrorBanner message={error} />

        <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 flex items-start gap-2.5">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-bold">Protection Guarantee:</span> The person you name will <strong>never</strong> see or know
            about this report.
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Who is this about?">
            <select
              required
              className={inputClass}
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as GrievanceTargetType)}
            >
              <option value="colleague">A Co-worker</option>
              <option value="superior">My Manager or Team Lead</option>
              <option value="management">Senior Management</option>
              <option value="department">A General Department Policy</option>
              <option value="other">Someone Else / External</option>
            </select>
          </Field>

          {targetType !== "department" && targetType !== "other" && options && (
            <Field label="Name of Person">
              <select
                className={inputClass}
                value={accusedUserId}
                onChange={(e) => setAccusedUserId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Select someone…</option>
                {options.colleagues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Type of Issue">
            <select required className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="harassment">Harassment</option>
              <option value="bullying">Bullying & Intimidation</option>
              <option value="discrimination">Discrimination (Bias / Favoritism)</option>
              <option value="corruption_bribery">Corruption & Bribery</option>
              <option value="retaliation">Retaliation for Past Disclosures</option>
              <option value="abuse_of_authority">Abuse of Authority / Coercion</option>
              <option value="policy_violation">Company Policy Violation</option>
              <option value="workplace_safety">Workplace Safety & Hostile Environment</option>
              <option value="other">Other</option>
            </select>
          </Field>

          <Field label="How Serious Is It?">
            <select
              required
              className={inputClass}
              value={severity}
              onChange={(e) => setSeverity(e.target.value as GrievanceSeverity)}
            >
              <option value="low">Low (minor issue or disagreement)</option>
              <option value="medium">Medium (happens often or is wrong)</option>
              <option value="high">High (severe bad behavior or money issues)</option>
              <option value="critical">Critical (safety risk, violence, severe rule-breaking)</option>
            </select>
          </Field>

          <Field label="When did this happen? (optional)">
            <input
              type="date"
              max={new Date().toISOString().split("T")[0]}
              className={inputClass}
              value={incidentDate}
              onChange={(e) => setIncidentDate(e.target.value)}
            />
          </Field>

          {options && (
            <Field label="Which Department? (optional)">
              <select
                className={inputClass}
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">None / General</option>
                {options.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <Field label="Short Title / Summary">
          <input
            required
            maxLength={200}
            className={inputClass}
            placeholder="A short sentence about what happened"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </Field>

        <Field label="What Happened?">
          <textarea
            required
            rows={4}
            maxLength={5000}
            className={inputClass}
            placeholder="Tell us the details: what happened, where, who else was there, etc."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        {/* Anonymity Checkbox */}
        <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          <div className="text-xs">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              {isAnonymous ? <EyeOff className="w-3.5 h-3.5 text-slate-700" /> : <Eye className="w-3.5 h-3.5 text-slate-500" />}
              Keep My Name Secret (Anonymous)
            </span>
            <p className="text-slate-500 mt-0.5">
              We will hide your name and email from everyone checking this report. You will be shown as &quot;Anonymous&quot;.
            </p>
          </div>
        </label>

        {/* Evidence Attachments */}
        <Field label="Files or Proof (Screenshots, Emails, PDFs, Audio)">
          <input
            type="file"
            multiple
            className="w-full text-xs text-slate-500 bg-white border border-slate-200 rounded-lg cursor-pointer file:cursor-pointer file:border-0 file:py-2 file:px-4 file:mr-4 file:bg-blue-50 file:text-blue-700 file:font-semibold hover:file:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
        </Field>

        <div className="pt-2 flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButtonClass} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Report"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function GrievanceDetailDrawer({
  grievanceId,
  options,
  onClose,
  onUpdated,
}: {
  grievanceId: number | string;
  options: GrievanceOptions | null | undefined;
  onClose: () => void;
  onUpdated: (msg: string) => void;
}) {
  const { can } = useSession();
  const canManage = can("grievance.manage");
  const [grievance, setGrievance] = useState<StaffGrievance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Actions
  const [actionTab, setActionTab] = useState<"none" | "assign" | "status" | "note">("none");
  const [investigatorId, setInvestigatorId] = useState<number | "">("");
  const [assignNote, setAssignNote] = useState("");
  const [newStatus, setNewStatus] = useState<GrievanceStatus>("investigating");
  const [statusMessage, setStatusMessage] = useState("");
  const [resolutionAction, setResolutionAction] = useState("");
  const [resolutionSummary] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [isConfidentialNote, setIsConfidentialNote] = useState(true);
  const [savingAction, setSavingAction] = useState(false);

  const fetchDetail = async () => {
    try {
      const g = await api.grievances.get(String(grievanceId));
      setGrievance(g);
      setLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchDetail();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grievanceId]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!investigatorId) return;
    setSavingAction(true);
    try {
      await api.grievances.assign(String(grievanceId), {
        investigator_id: Number(investigatorId),
        note: assignNote.trim() || undefined,
      });
      onUpdated("Investigator assigned successfully.");
      setActionTab("none");
      fetchDetail();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingAction(false);
    }
  };

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusMessage.trim()) {
      setError("Please provide a status update message.");
      return;
    }
    setSavingAction(true);
    try {
      await api.grievances.updateStatus(String(grievanceId), {
        status: newStatus,
        message: statusMessage.trim(),
        resolution_action: resolutionAction.trim() || undefined,
        resolution_summary: resolutionSummary.trim() || undefined,
      });
      onUpdated(`Status updated to ${STATUS_LABELS[newStatus]}.`);
      setActionTab("none");
      fetchDetail();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingAction(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setSavingAction(true);
    try {
      await api.grievances.addNote(String(grievanceId), {
        note: noteContent.trim(),
        is_confidential: isConfidentialNote,
      });
      onUpdated("Investigation note recorded.");
      setNoteContent("");
      setActionTab("none");
      fetchDetail();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingAction(false);
    }
  };

  return (
    <Modal
      title={grievance ? `${grievance.tracking_id} — ${grievance.subject}` : "Grievance Record"}
      description="Confidential investigation record."
      onClose={onClose}
      wide
    >
      <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
        <ErrorBanner message={error} />

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading grievance details…</div>
        ) : !grievance ? (
          <div className="py-12 text-center text-xs text-rose-500">Grievance not found or access denied.</div>
        ) : (
          <div className="space-y-4">
            {/* Meta overview bar */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${STATUS_COLORS[grievance.status]}`}>
                    {STATUS_LABELS[grievance.status]}
                  </span>
                  <span className={`text-xs px-2.5 py-1 rounded border ${SEVERITY_COLORS[grievance.severity]}`}>
                    {grievance.severity.toUpperCase()} Priority
                  </span>
                  <span className="text-xs text-slate-500 capitalize bg-white px-2 py-1 rounded border">
                    {grievance.category.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-xs text-slate-400">Filed {formatDateTime(grievance.created_at)}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200/60 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px] uppercase font-semibold">Reported By</span>
                  <span className="font-semibold text-slate-800">
                    {grievance.reporter.name}
                    {grievance.reporter.is_anonymous && (
                      <span className="ml-1 text-[10px] text-purple-700 bg-purple-50 border border-purple-200 px-1 rounded">
                        Anonymous
                      </span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] uppercase font-semibold">Subject / Accused</span>
                  <span className="font-semibold text-slate-800">
                    {grievance.accused_user
                      ? `${grievance.accused_user.name} (${grievance.accused_user.role})`
                      : "Department / Policy"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] uppercase font-semibold">Investigator</span>
                  <span className="font-semibold text-slate-800">
                    {grievance.assigned_investigator ? grievance.assigned_investigator.name : "Unassigned"}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Statement of Grievance</h4>
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                {grievance.description}
              </div>
            </div>

            {/* Attachments */}
            {grievance.attachments && grievance.attachments.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Evidence Attachments ({grievance.attachments.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {grievance.attachments.map((att) => (
                    <a
                      key={att.id}
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-between gap-2 text-xs text-slate-700 transition-colors"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate font-medium">{att.file_name}</span>
                      </div>
                      <Download className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Investigator Action Bar */}
            {canManage && (
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <button
                    type="button"
                    className={`${actionTab === "assign" ? primaryButtonClass : secondaryButtonClass} text-xs`}
                    onClick={() => setActionTab(actionTab === "assign" ? "none" : "assign")}
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Assign Investigator
                  </button>
                  <button
                    type="button"
                    className={`${actionTab === "status" ? primaryButtonClass : secondaryButtonClass} text-xs`}
                    onClick={() => setActionTab(actionTab === "status" ? "none" : "status")}
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Update Status / Resolve
                  </button>
                  <button
                    type="button"
                    className={`${actionTab === "note" ? primaryButtonClass : secondaryButtonClass} text-xs`}
                    onClick={() => setActionTab(actionTab === "note" ? "none" : "note")}
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Add Note
                  </button>
                </div>

                {actionTab === "assign" && options && (
                  <form onSubmit={handleAssign} className="p-3.5 rounded-xl border border-sky-200 bg-sky-50/50 space-y-3 mb-3">
                    <Field label="Choose Investigator">
                      <select
                        required
                        className={inputClass}
                        value={investigatorId}
                        onChange={(e) => setInvestigatorId(e.target.value ? Number(e.target.value) : "")}
                      >
                        <option value="">Select an investigator…</option>
                        {options.investigators
                          .filter((i) => i.id !== grievance.accused_user?.id)
                          .map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.name} ({inv.role})
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Assignment Note (optional)">
                      <input
                        maxLength={2000}
                        className={inputClass}
                        placeholder="Internal instructions for the investigator"
                        value={assignNote}
                        onChange={(e) => setAssignNote(e.target.value)}
                      />
                    </Field>
                    <div className="flex justify-end gap-2">
                      <button type="button" className={secondaryButtonClass} onClick={() => setActionTab("none")}>
                        Cancel
                      </button>
                      <button type="submit" className={primaryButtonClass} disabled={savingAction || !investigatorId}>
                        {savingAction ? "Assigning…" : "Confirm Assignment"}
                      </button>
                    </div>
                  </form>
                )}

                {actionTab === "status" && (
                  <form
                    onSubmit={handleStatusUpdate}
                    className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3 mb-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="New Status">
                        <select
                          required
                          className={inputClass}
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value as GrievanceStatus)}
                        >
                          <option value="under_review">Under Review</option>
                          <option value="investigating">Investigating</option>
                          <option value="action_taken">Action Taken</option>
                          <option value="resolved">Resolved</option>
                          <option value="dismissed">Dismissed (Unfounded / Withdrawn)</option>
                        </select>
                      </Field>
                      {(newStatus === "action_taken" || newStatus === "resolved") && (
                        <Field label="Resolution / Disciplinary Action">
                          <input
                            maxLength={100}
                            className={inputClass}
                            placeholder="e.g. Formal Warning, Counseling, Reassignment"
                            value={resolutionAction}
                            onChange={(e) => setResolutionAction(e.target.value)}
                          />
                        </Field>
                      )}
                    </div>
                    <Field label="Status Transition Explanation">
                      <textarea
                        required
                        rows={2}
                        maxLength={500}
                        className={inputClass}
                        placeholder="Summary of findings or explanation of this status change"
                        value={statusMessage}
                        onChange={(e) => setStatusMessage(e.target.value)}
                      />
                    </Field>
                    <div className="flex justify-end gap-2">
                      <button type="button" className={secondaryButtonClass} onClick={() => setActionTab("none")}>
                        Cancel
                      </button>
                      <button type="submit" className={primaryButtonClass} disabled={savingAction}>
                        {savingAction ? "Updating…" : "Update Status"}
                      </button>
                    </div>
                  </form>
                )}

                {actionTab === "note" && (
                  <form onSubmit={handleAddNote} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-3 mb-3">
                    <Field label="Investigation Note">
                      <textarea
                        required
                        rows={3}
                        maxLength={3000}
                        className={inputClass}
                        placeholder="Confidential interview notes, evidence verification notes, or updates"
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                      />
                    </Field>
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isConfidentialNote}
                        onChange={(e) => setIsConfidentialNote(e.target.checked)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span className="flex items-center gap-1">
                        <Lock className="w-3 h-3 text-slate-500" />
                        Confidential to Investigators (hide from reporter)
                      </span>
                    </label>
                    <div className="flex justify-end gap-2">
                      <button type="button" className={secondaryButtonClass} onClick={() => setActionTab("none")}>
                        Cancel
                      </button>
                      <button type="submit" className={primaryButtonClass} disabled={savingAction}>
                        {savingAction ? "Saving…" : "Save Note"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Timeline */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Investigation Timeline</h4>
              {grievance.events && grievance.events.length > 0 ? (
                <div className="divide-y divide-slate-100 border rounded-xl overflow-hidden bg-white">
                  {grievance.events.map((ev) => (
                    <div key={ev.id} className="p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span className="font-semibold text-slate-700">{ev.actor_name}</span>
                        <span>{formatDateTime(ev.created_at)}</span>
                      </div>
                      <div className="text-slate-800 font-medium">{ev.message}</div>
                      {ev.note && (
                        <div className="p-2.5 rounded-lg bg-slate-50 text-slate-700 font-mono text-[11px] mt-1 border">
                          {ev.is_confidential_note && (
                            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200 mr-1.5 uppercase">
                              Confidential Note
                            </span>
                          )}
                          {ev.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No events recorded yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function GrievancesPage() {
  useDocumentTitle("Staff Grievances");
  const { can } = useSession();
  const canManage = can("grievance.manage");
  const [view, setView] = useState<"my_filed" | "investigations" | "all">("my_filed");
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: options } = useApiData<GrievanceOptions>(() => api.grievances.options(), []);

  const {
    data,
    error: loadError,
    loading,
    reload,
  } = useApiData(
    () =>
      api.grievances.list({
        view,
        status_filter: statusFilter || undefined,
        severity: severityFilter || undefined,
        page,
      }),
    [view, statusFilter, severityFilter, page],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Workplace Issues"
        description="A safe and private place to report bad behavior, bullying, or rule-breaking at work."
        actions={
          <button className={primaryButtonClass} onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5" /> Report an Issue
          </button>
        }
      />

      <Notice message={notice} />
      <ErrorBanner message={loadError} />

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              view === "my_filed" ? "border-sky-600 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => {
              setView("my_filed");
              setPage(1);
            }}
          >
            My Reports
          </button>
          {canManage && (
            <>
              <button
                type="button"
                className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  view === "investigations"
                    ? "border-sky-600 text-sky-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
                onClick={() => {
                  setView("investigations");
                  setPage(1);
                }}
              >
                Issues I&apos;m Checking
              </button>
              <button
                type="button"
                className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  view === "all" ? "border-sky-600 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
                onClick={() => {
                  setView("all");
                  setPage(1);
                }}
              >
                All Reports
              </button>
            </>
          )}
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-2 pb-1">
          <select
            className={inputClass}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <button type="button" className={secondaryButtonClass} onClick={() => reload()} title="Refresh list">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Grievances list */}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-215 text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400 uppercase text-[11px] tracking-wider bg-slate-50/50">
              <th className="px-5 py-3 font-semibold">ID & Subject</th>
              <th className="px-3 py-3 font-semibold">Type & Seriousness</th>
              <th className="px-3 py-3 font-semibold">Person Reported</th>
              {view !== "my_filed" && <th className="px-3 py-3 font-semibold">Reporter</th>}
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Checked By</th>
              <th className="px-3 py-3 font-semibold">Date Reported</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <TableMessage colSpan={8}>Loading grievance records…</TableMessage>
            ) : !data || data.items.length === 0 ? (
              <TableMessage colSpan={8}>
                {view === "my_filed" ? "You have not reported any issues." : "No reports matching the selected filters."}
              </TableMessage>
            ) : (
              data.items.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50/70 align-middle">
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs font-bold text-sky-700">{g.tracking_id}</span>
                    <div className="font-medium text-slate-800 line-clamp-1 mt-0.5">{g.subject}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="capitalize font-medium text-slate-700 block">{g.category.replace(/_/g, " ")}</span>
                    <span
                      className={`inline-block mt-0.5 text-[9px] px-1.5 py-0.2 rounded border ${SEVERITY_COLORS[g.severity]}`}
                    >
                      {g.severity.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {g.accused_user ? (
                      <div>
                        <div className="font-semibold text-slate-800">{g.accused_user.name}</div>
                        <div className="text-[10px] text-slate-400">{g.accused_user.role}</div>
                      </div>
                    ) : (
                      <span className="text-slate-500 capitalize">{g.target_type}</span>
                    )}
                  </td>
                  {view !== "my_filed" && (
                    <td className="px-3 py-3 text-slate-700">
                      {g.reporter.is_anonymous ? (
                        <span className="text-purple-700 font-semibold bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded text-[10px]">
                          Anonymous
                        </span>
                      ) : (
                        g.reporter.name
                      )}
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_COLORS[g.status]}`}>
                      {STATUS_LABELS[g.status]}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {g.assigned_investigator ? g.assigned_investigator.name : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(g.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <button type="button" className={secondaryButtonClass} onClick={() => setSelectedId(g.tracking_id)}>
                      View Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {data && <Pagination page={page} pageSize={data.page_size} total={data.total} noun="grievances" onPage={setPage} />}

      {creating && (
        <FileGrievanceModal
          options={options}
          onClose={() => setCreating(false)}
          onCreated={(msg) => {
            setNotice(msg);
            reload();
          }}
        />
      )}

      {selectedId && (
        <GrievanceDetailDrawer
          grievanceId={selectedId}
          options={options}
          onClose={() => setSelectedId(null)}
          onUpdated={(msg) => {
            setNotice(msg);
            reload();
          }}
        />
      )}
    </div>
  );
}
