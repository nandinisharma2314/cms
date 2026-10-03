"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Edit3,
  FileText,
  Globe,
  Home,
  Landmark,
  LayoutGrid,
  MapPin,
  Paperclip,
  Send,
  ShieldCheck,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { api, ComplaintDetail, PortalDepartment } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useEndUser } from "@/lib/session";
import { attachmentProblem } from "@/lib/attachments";

type Step = 1 | 2 | 3;

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "Details" },
  { id: 2, label: "Review" },
  { id: 3, label: "Done" },
];

const fieldBox =
  "w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-12 pr-4 text-[13px] font-medium text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:opacity-60";

function FieldIcon({ children, top = false }: { children: React.ReactNode; top?: boolean }) {
  return (
    <span
      className={`pointer-events-none absolute left-3 rounded-lg bg-indigo-50 p-1.5 text-indigo-500 ${top ? "top-2.5" : "top-1/2 -translate-y-1/2"}`}
    >
      {children}
    </span>
  );
}

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className="block text-right text-[11px] font-semibold text-slate-400">
      {value.length}/{max}
    </span>
  );
}

/** The decorative column next to the form on large screens. */
function Aside() {
  return (
    <div className="sticky top-6 hidden h-[calc(100vh-120px)] flex-col justify-center self-start lg:flex">
      <div className="mx-auto flex w-full max-w-120 flex-col">
        <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-indigo-50/80 px-4 py-1.5 text-xs font-semibold text-indigo-700">
          <Home size={14} aria-hidden="true" /> Home <span className="text-indigo-300">/</span> New complaint
        </div>
        <h1 className="mb-2 text-4xl font-extrabold leading-tight tracking-tight text-slate-900">
          Register a <span className="text-indigo-600">complaint</span>
        </h1>
        <p className="mb-6 text-sm font-medium text-slate-500">
          Tell us what&apos;s wrong. It will automatically be routed to the right team for your workplace.
        </p>
        <ul className="mb-6 flex flex-wrap gap-x-5 gap-y-3">
          {["Goes straight to the right team", "Updates as they happen", "Reply any time"].map((text) => (
            <li key={text} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                <Check size={12} strokeWidth={3} aria-hidden="true" />
              </span>
              {text}
            </li>
          ))}
        </ul>
        <div className="relative my-12 flex flex-1 items-center justify-center" aria-hidden="true">
          <div className="relative h-80 w-80">
            <div className="absolute inset-0 z-20 m-auto flex h-32 w-32 items-center justify-center rounded-4xl bg-linear-to-tr from-indigo-600 to-blue-500 shadow-2xl shadow-blue-500/40">
              <Globe size={56} className="text-white" />
            </div>
            <div className="absolute inset-0 z-10 m-auto h-60 w-60 rounded-full border-[1.5px] border-indigo-200/60" />
            <div className="absolute inset-0 z-10 m-auto h-80 w-80 animate-[spin_40s_linear_infinite] rounded-full border-2 border-dashed border-indigo-200/50" />
            <div className="absolute left-2 top-2 z-30 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-xl shadow-indigo-100/60">
              <MapPin size={32} className="text-red-500" />
            </div>
            <div className="absolute bottom-6 right-0 z-30 flex h-20 w-20 items-center justify-center rounded-3xl bg-white shadow-xl shadow-indigo-100/60">
              <ShieldCheck size={40} className="text-emerald-500" />
            </div>
            <div className="absolute right-2 top-8 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-xl shadow-indigo-100/60">
              <AlertCircle size={28} className="text-amber-500" />
            </div>
            <div className="absolute bottom-4 left-6 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-xl shadow-indigo-100/60">
              <Users size={28} className="text-blue-500" />
            </div>
            <div className="absolute inset-0 z-0 m-auto h-48 w-48 animate-pulse rounded-full bg-blue-400/20 blur-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterComplaintPage() {
  useDocumentTitle("New complaint");
  const router = useRouter();
  const { profile, can } = useEndUser();
  const { limits, attachments } = useConfig();
  const canAttach =
    can("portal.complaint.attach") && attachments.allowed_types.length > 0 && (attachments.max_per_complaint ?? 0) > 0;
  const maxFiles = attachments.max_per_complaint ?? 0;

  const [departments, setDepartments] = useState<PortalDepartment[] | null>(null);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<ComplaintDetail | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.reference.departments().then(
      (deps) => setDepartments(deps),
      (err: Error) => setError(err.message),
    );
  }, []);

  const department = departments?.find((d) => d.id === departmentId) ?? null;
  const category = department?.categories.find((c) => c.id === categoryId) ?? null;

  // Previews for chosen images, released when the choice changes.
  const previews = useMemo(() => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((url) => url && URL.revokeObjectURL(url)), [previews]);

  const detailsValid = Boolean(department && category && title.trim() && description.trim());

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const problem = attachmentProblem(picked, maxFiles - files.length, attachments);
    if (problem) return setError(problem);
    setError(null);
    setFiles([...files, ...picked]);
  };

  const next = () => {
    setError(null);
    if (!detailsValid)
      return setError("Choose the department and category, and fill in the title and description.");
    if (!profile.location)
      return setError("No workplace location is assigned to your employee account. Please contact an administrator.");
    setStep(2);
  };

  const submit = async () => {
    if (!department || !category) return;
    if (!profile.location) {
      setError("No workplace location is assigned to your employee account. Please contact an administrator.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      setCreated(
        await api.complaints.create({
          department_id: department.id,
          category_id: category.id,
          location_id: profile.location.id,
          title,
          description,
          additional_details: details,
          files,
        }),
      );
      setStep(3);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!can("portal.complaint.create")) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-[0_2px_14px_-6px_rgba(15,23,42,0.12)]">
          <h1 className="text-[17px] font-bold text-[#0b1a3f]">New complaints are turned off</h1>
          <p className="mt-2 text-[14px] leading-snug text-slate-500">
            Your account can&apos;t register new complaints right now. You can still follow your existing ones.
          </p>
          <Link
            href="/dashboard/complaints"
            className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-2 text-[14px] font-semibold text-white"
          >
            My complaints
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col bg-[#f4f7fe] pb-0 font-sans md:py-2">
      <div className="relative z-10 mx-auto grid w-full max-w-350 flex-1 grid-cols-1 gap-8 md:px-4 lg:grid-cols-[1fr_1.4fr] xl:gap-12">
        <Aside />

        <div className="relative flex h-fit flex-col bg-white p-4 shadow-sm md:rounded-3xl md:px-6 md:py-5">
          {/* Stepper */}
          <ol className="relative mb-4 flex w-full items-center justify-between px-2">
            <div className="absolute left-[15%] right-[15%] top-4 z-0 h-0.5 bg-slate-100" aria-hidden="true">
              <div
                className="h-full bg-blue-600 transition-all duration-500 ease-in-out"
                style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
              />
            </div>
            {STEPS.map((s) => {
              const current = step === s.id;
              const done = step > s.id;
              const reachable = step !== 3 && s.id < 3 && (s.id <= step || (s.id === 2 && detailsValid));
              return (
                <li key={s.id} className="relative z-10">
                  <button
                    type="button"
                    disabled={!reachable}
                    aria-current={current ? "step" : undefined}
                    onClick={() => {
                      setError(null);
                      setStep(s.id);
                    }}
                    className="flex flex-col items-center gap-1 bg-white px-2"
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                        current && s.id !== 3
                          ? "bg-blue-600 text-white shadow-md shadow-blue-200 ring-4 ring-blue-50"
                          : current && s.id === 3
                            ? "bg-emerald-500 text-white shadow-md shadow-emerald-200 ring-4 ring-emerald-50"
                            : done
                              ? "bg-emerald-500 text-white"
                              : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {done || (current && s.id === 3) ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : s.id}
                    </span>
                    <span
                      className={`text-[11px] ${current ? "font-bold text-slate-900" : done ? "font-semibold text-slate-700" : "font-semibold text-slate-400"}`}
                    >
                      {s.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {step === 1 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="department" className="text-xs font-bold text-slate-900">
                  Department <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <FieldIcon>
                    <Landmark size={14} aria-hidden="true" />
                  </FieldIcon>
                  <select
                    id="department"
                    value={departmentId ?? ""}
                    disabled={!departments}
                    onChange={(e) => {
                      setDepartmentId(e.target.value ? Number(e.target.value) : null);
                      setCategoryId(null);
                    }}
                    className={`${fieldBox} appearance-none pr-10`}
                  >
                    <option value="" disabled>
                      {departments ? "Choose a department" : "Loading…"}
                    </option>
                    {departments?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                    <ChevronDown size={16} aria-hidden="true" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="category" className="text-xs font-bold text-slate-900">
                  Category <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <FieldIcon>
                    <LayoutGrid size={14} aria-hidden="true" />
                  </FieldIcon>
                  <select
                    id="category"
                    value={categoryId ?? ""}
                    disabled={!department}
                    onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                    className={`${fieldBox} appearance-none pr-10`}
                  >
                    <option value="" disabled>
                      Choose a category
                    </option>
                    {department?.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                    <ChevronDown size={16} aria-hidden="true" />
                  </div>
                </div>
                {category && (
                  <p className="text-[12px] text-slate-500">
                    Complaints like this are handled with {category.priority.toLowerCase()} priority.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="title" className="text-xs font-bold text-slate-900">
                  Title <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <FieldIcon>
                    <FileText size={14} aria-hidden="true" />
                  </FieldIcon>
                  <input
                    id="title"
                    maxLength={limits.title}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="A short summary of the problem"
                    className={fieldBox}
                  />
                </div>
                <Counter value={title} max={limits.title} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="description" className="text-xs font-bold text-slate-900">
                  Description <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <FieldIcon top>
                    <FileText size={14} aria-hidden="true" />
                  </FieldIcon>
                  <textarea
                    id="description"
                    rows={4}
                    maxLength={limits.description}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What happened, since when, and anything else that helps"
                    className={`${fieldBox} min-h-24 resize-y`}
                  />
                </div>
                <Counter value={description} max={limits.description} />
              </div>

              {/* Assigned Location Badge */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-900">Workplace / Location</label>
                <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-xs">
                  <MapPin size={16} className="text-blue-600 shrink-0" aria-hidden="true" />
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-800">
                      {profile.location?.label || profile.location?.name || "No location assigned"}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Complaints are automatically routed based on your employee profile location.
                    </span>
                  </div>
                </div>
              </div>

              {/* Optional Room / Desk / Landmark */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="details" className="text-xs font-bold text-slate-900">
                  Room / Desk / Landmark <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <div className="relative">
                  <FieldIcon top>
                    <Building size={14} aria-hidden="true" />
                  </FieldIcon>
                  <textarea
                    id="details"
                    rows={2}
                    maxLength={limits.additional_details}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="e.g. Room 204, 2nd floor desk near printer, or any specific spot"
                    className={`${fieldBox} resize-none`}
                  />
                </div>
                <Counter value={details} max={limits.additional_details} />
              </div>

              {canAttach && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <UploadCloud size={14} className="text-indigo-600" aria-hidden="true" /> Photos and documents (optional)
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">
                      Up to {maxFiles}
                      {attachments.max_mb ? `, ${attachments.max_mb} MB each` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      addFiles(e.dataTransfer.files);
                    }}
                    onClick={() => fileInput.current?.click()}
                    disabled={files.length >= maxFiles}
                    className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-3 text-center transition-colors disabled:opacity-50 ${
                      dragging ? "border-indigo-400 bg-indigo-50/50" : "border-indigo-200/80 bg-[#f8faff] hover:bg-slate-50/50"
                    }`}
                  >
                    <UploadCloud size={18} className="mb-1 text-indigo-600" aria-hidden="true" />
                    <span className="text-xs font-bold text-slate-800">Tap to choose files, or drop them here</span>
                    <span className="text-[11px] font-semibold uppercase text-slate-400">
                      {attachments.allowed_types.join(", ")}
                    </span>
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    className="hidden"
                    accept={attachments.allowed_types.map((t) => `.${t}`).join(",")}
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  {files.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-2">
                      {files.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-2 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            {previews[index] ? (
                              // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
                              <img
                                src={previews[index]!}
                                alt=""
                                className="h-8 w-8 rounded-lg border border-slate-100 object-cover"
                              />
                            ) : (
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                                <FileText size={14} aria-hidden="true" />
                              </span>
                            )}
                            <span className="min-w-0">
                              <span className="block truncate text-[12px] font-bold text-slate-700">{file.name}</span>
                              <span className="text-[11px] text-slate-400">{formatBytes(file.size)}</span>
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setFiles(files.filter((_, i) => i !== index))}
                            aria-label={`Remove ${file.name}`}
                            className="rounded-full p-1.5 text-red-500 hover:bg-red-50"
                          >
                            <X size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && department && category && (
            <div className="flex flex-col gap-3 text-sm text-slate-700">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div>
                  <h2 className="text-[15px] font-bold text-slate-900">Check your complaint</h2>
                  <p className="text-[12px] text-slate-500">Edit anything that isn&apos;t right, then send it.</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                  <Clock size={11} aria-hidden="true" /> Step 2 of 2
                </span>
              </div>
              {[
                {
                  title: "Details",
                  icon: FileText,
                  goTo: 1 as Step,
                  rows: [
                    ["Department", department.name],
                    ["Category", category.name],
                    ["Title", title],
                    ["Description", description],
                  ],
                },
                {
                  title: "Location",
                  icon: MapPin,
                  goTo: 1 as Step,
                  rows: [
                    ["Assigned Workplace", profile.location?.label || profile.location?.name || "Assigned location"],
                    ...(details.trim() ? [["Room / Desk / Landmark", details]] : []),
                  ],
                },
              ].map((card) => (
                <div key={card.title} className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <card.icon size={13} className="text-blue-600" aria-hidden="true" /> {card.title}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setStep(card.goTo)}
                      className="flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-bold text-blue-600 shadow-sm hover:bg-blue-50"
                    >
                      <Edit3 size={10} aria-hidden="true" /> Edit
                    </button>
                  </div>
                  <dl className="grid gap-1.5">
                    {card.rows.map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-slate-100 bg-white p-2">
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
                        <dd className="whitespace-pre-wrap text-[13px] font-semibold text-slate-800 wrap-break-word">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              {canAttach && (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-3 shadow-sm">
                  <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <Paperclip size={13} className="text-blue-600" aria-hidden="true" /> Files ({files.length})
                  </h3>
                  <p className="text-[12px] text-slate-500">
                    {files.length ? files.map((f) => f.name).join(", ") : "No files attached."}
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 3 && created && (
            <div className="flex flex-col items-center gap-5 py-4 text-center">
              <div>
                <h2 className="text-2xl font-black text-slate-900 md:text-3xl">Complaint registered</h2>
                <p className="mt-2 text-sm text-slate-500">
                  {created.status === "ASSIGNED"
                    ? "It has gone to the team that handles it."
                    : "It is waiting for the right team to pick it up."}{" "}
                  We&apos;ll keep you updated here.
                </p>
              </div>
              <div className="flex w-full max-w-md items-center justify-between rounded-2xl border border-slate-100 bg-[#f0f4f8] p-5">
                <div className="text-left">
                  <p className="mb-1 text-xs font-medium text-slate-500">Complaint ID</p>
                  <p className="font-mono text-xl font-black tracking-tight text-slate-900">{created.id}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(created.id).then(
                      () => setCopied(true),
                      () => setError("Copying isn't allowed here; note the ID down instead."),
                    )
                  }
                  className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-100"
                >
                  {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{" "}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-[12px] text-slate-400">Registered {formatDateTime(created.created_at)}</p>
              <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/complaints/${encodeURIComponent(created.id)}`)}
                  className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700"
                >
                  Follow this complaint
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard")}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Back to home
                </button>
              </div>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-center text-xs font-bold text-red-600"
            >
              {error}
            </p>
          )}

          {step < 3 && (
            <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-3">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep(1);
                  }}
                  className="flex flex-[0.8] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-bold text-blue-600 hover:bg-slate-100"
                >
                  <ArrowLeft size={16} className="mr-2" aria-hidden="true" /> Back
                </button>
              )}
              {step === 1 ? (
                <button
                  type="button"
                  onClick={next}
                  className="flex flex-[1.2] items-center justify-center rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-700"
                >
                  Next <ArrowRight size={16} className="ml-2" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="flex flex-[1.2] items-center justify-center rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? (
                    "Sending…"
                  ) : (
                    <>
                      <Send size={16} className="mr-2" aria-hidden="true" /> Send complaint
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
