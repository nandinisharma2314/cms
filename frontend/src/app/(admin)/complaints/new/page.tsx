"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building,
  Building2,
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
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Tag,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { api, ClassificationOptions } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useApiData } from "@/lib/hooks";
import { attachmentProblem } from "@/lib/attachments";
import { LocationPicker } from "@/components/LocationPicker";
import { PriorityBadge } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

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
  const { t } = useI18n();
  return (
    <div className="sticky top-6 hidden h-[calc(100vh-120px)] flex-col justify-center self-start lg:flex">
      <div className="mx-auto flex w-full max-w-120 flex-col">
        <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-indigo-50/80 px-4 py-1.5 text-xs font-semibold text-indigo-700">
          <Home size={14} aria-hidden="true" /> {t("Home")} <span className="text-indigo-300">/</span> {t("New Complaint")}
        </div>
        <h1 className="mb-2 text-4xl font-extrabold leading-tight tracking-tight text-slate-900">
          {t("Register complaint")}
        </h1>
        <p className="mb-6 text-sm font-medium text-slate-500">
          {t("Tell us what's wrong. It will automatically be routed to the right team for the selected workplace.")}
        </p>
        <ul className="mb-6 flex flex-wrap gap-x-5 gap-y-3">
          {[t("Goes straight to the right team"), t("Updates as they happen"), t("Staff tracking enabled")].map((text) => (
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

function DepartmentDropdown({
  departments,
  selectedId,
  onSelect,
  disabled,
}: {
  departments: ClassificationOptions["departments"];
  selectedId: number | null;
  onSelect: (id: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { t } = useI18n();
  const selectedDepartment = departments.find((d) => d.id === selectedId);

  const filtered = useMemo(() => {
    if (!query.trim()) return departments;
    const q = query.toLowerCase();
    return departments.filter((d) => d.name.toLowerCase().includes(q));
  }, [departments, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled || !departments.length}
        onClick={() => {
          setOpen(!open);
          setQuery("");
        }}
        className={`w-full rounded-xl border bg-white py-2.5 pl-12 pr-10 text-[13px] font-medium text-left transition-all flex items-center justify-between cursor-pointer disabled:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed ${
          open
            ? "border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm"
            : "border-slate-200 hover:border-slate-300"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <FieldIcon>
          <Landmark size={14} aria-hidden="true" />
        </FieldIcon>
        <span className={`truncate ${selectedDepartment ? "font-semibold text-slate-800" : "text-slate-400"}`}>
          {selectedDepartment ? selectedDepartment.name : (departments.length ? t("Choose a department") : t("Loading departments…"))}
        </span>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`transition-transform duration-200 ${open ? "rotate-180 text-indigo-600" : ""}`}
          />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/10 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
          {/* Search Header */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/70 flex items-center gap-2">
            <Search size={14} className="text-slate-400 ml-1.5 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search department…")}
              className="w-full bg-transparent text-xs text-slate-800 placeholder:text-slate-400 outline-none py-1"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-slate-400 hover:text-slate-600 p-1"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
            <span className="text-[10px] font-bold text-slate-500 px-2 py-0.5 bg-white rounded-md border border-slate-200 shrink-0">
              {filtered.length} {filtered.length === 1 ? t("dept") : t("depts")}
            </span>
          </div>

          {/* Department List */}
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5" role="listbox">
            {filtered.length === 0 ? (
              <div className="py-7 text-center text-xs text-slate-400">
                {t("No department matching")} &ldquo;{query}&rdquo;
              </div>
            ) : (
              filtered.map((d) => {
                const isSelected = d.id === selectedId;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      onSelect(d.id);
                      setOpen(false);
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer group ${
                      isSelected
                        ? "bg-indigo-50 text-indigo-950 font-semibold border border-indigo-100"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600"
                        }`}
                      >
                        <Building2 size={15} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs truncate">{d.name}</div>
                        <div className="text-[11px] text-slate-400 font-normal">
                          {d.categories.length} {d.categories.length === 1 ? "category" : "categories"}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white shrink-0 ml-2">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryDropdown({
  department,
  selectedId,
  onSelect,
  disabled,
}: {
  department: ClassificationOptions["departments"][number] | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { t } = useI18n();
  const categories = department?.categories ?? [];
  const selectedCategory = categories.find((c) => c.id === selectedId);

  const filtered = useMemo(() => {
    if (!query.trim()) return categories;
    const q = query.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled || !department}
        onClick={() => {
          setOpen(!open);
          setQuery("");
        }}
        className={`w-full rounded-xl border bg-white py-2.5 pl-12 pr-10 text-[13px] font-medium text-left transition-all flex items-center justify-between cursor-pointer disabled:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed ${
          open
            ? "border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm"
            : "border-slate-200 hover:border-slate-300"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <FieldIcon>
          <LayoutGrid size={14} aria-hidden="true" />
        </FieldIcon>
        <span className={`truncate ${selectedCategory ? "font-semibold text-slate-800" : "text-slate-400"}`}>
          {selectedCategory ? selectedCategory.name : (department ? t("Choose a category") : t("Select a department first"))}
        </span>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`transition-transform duration-200 ${open ? "rotate-180 text-indigo-600" : ""}`}
          />
        </div>
      </button>

      {open && department && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/10 overflow-hidden">
          {categories.length > 4 && (
            <div className="p-2.5 border-b border-slate-100 bg-slate-50/70 flex items-center gap-2">
              <Search size={14} className="text-slate-400 ml-1.5 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Search category…")}
                className="w-full bg-transparent text-xs text-slate-800 placeholder:text-slate-400 outline-none py-1"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-slate-400 hover:text-slate-600 p-1"
                  aria-label="Clear search"
                >
                  <X size={13} />
                </button>
              )}
              <span className="text-[10px] font-bold text-slate-500 px-2 py-0.5 bg-white rounded-md border border-slate-200 shrink-0">
                {filtered.length}
              </span>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5" role="listbox">
            {filtered.length === 0 ? (
              <div className="py-7 text-center text-xs text-slate-400">
                {t("No category matching")} &ldquo;{query}&rdquo;
              </div>
            ) : (
              filtered.map((c) => {
                const isSelected = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onSelect(c.id);
                      setOpen(false);
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer group ${
                      isSelected
                        ? "bg-indigo-50 text-indigo-950 font-semibold border border-indigo-100"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600"
                        }`}
                      >
                        <Tag size={14} />
                      </div>
                      <span className="text-xs truncate">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <PriorityBadge priority={c.default_priority} />
                      {isSelected && (
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white shrink-0">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminRegisterComplaintPage() {
  const { t } = useI18n();
  useDocumentTitle(t("New Complaint"));
  const router = useRouter();
  const { me, can } = useSession();
  const { limits, attachments } = useConfig();
  const fileInput = useRef<HTMLInputElement>(null);

  const canAttach = attachments.allowed_types.length > 0 && (attachments.max_per_complaint ?? 0) > 0;
  const maxFiles = attachments.max_per_complaint ?? 0;

  const { data: options, error: loadError } = useApiData(() => api.complaints.classificationOptions(), []);

  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ id: string; assignee: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  // Set default location to user's primary location or first scoped location when available
  useEffect(() => {
    if (locationId === null) {
      if (me?.primary_location?.id) {
        setLocationId(me.primary_location.id);
      } else if (me?.scopes && me.scopes.length > 0) {
        const scopeLoc = me.scopes.find((s) => s.location?.id)?.location;
        if (scopeLoc?.id) {
          setLocationId(scopeLoc.id);
        }
      }
    }
  }, [me, locationId]);

  const departments = useMemo(
    () => options?.departments ?? [],
    [options],
  );
  const department = departments.find((d) => d.id === departmentId) ?? null;
  const category = department?.categories.find((c) => c.id === categoryId) ?? null;

  // Selected location display name
  const effectiveLocationId = locationId ?? me?.primary_location?.id ?? null;
  const { data: locationPath } = useApiData(
    () => (effectiveLocationId ? api.locations.path(effectiveLocationId) : Promise.resolve([])),
    [effectiveLocationId],
  );
  const locationDisplayName = useMemo(() => {
    if (locationPath && locationPath.length > 0) {
      return locationPath.map((l) => l.name).join(" > ");
    }
    return me?.primary_location?.label || me?.primary_location?.name || null;
  }, [locationPath, me]);

  const previews = useMemo(() => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((url) => url && URL.revokeObjectURL(url)), [previews]);

  const detailsValid = Boolean(department && category && title.trim() && description.trim() && effectiveLocationId !== null);

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
    if (!department || !category) return setError("Choose the department and category.");
    if (effectiveLocationId === null) return setError("Choose a workplace location.");
    if (!title.trim() || !description.trim()) return setError("Fill in the title and description.");
    setStep(2);
  };

  const submit = async () => {
    if (!department || !category || effectiveLocationId === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.complaints.create({
        title,
        description,
        additional_details: details.trim() || null,
        department_id: department.id,
        category_id: category.id,
        location_id: effectiveLocationId,
        files,
      });
      setCreated(result);
      setStep(3);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Only roles below Super Admin can register complaints
  if (me?.is_super_admin) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 min-h-[60vh]">
        <div className="max-w-md rounded-2xl bg-white p-7 text-center shadow-lg border border-slate-100">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-3.5">
            <ShieldAlert size={32} />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Registration Not Allowed</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Super Admin cannot register complaints. Only staff roles below Super Admin (such as Admin, Manager, Supervisor, Agent) or end users are permitted to register complaints.
          </p>
          <Link
            href="/complaints"
            className="mt-5 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            View all complaints
          </Link>
        </div>
      </div>
    );
  }

  if (!can("complaint.create")) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 min-h-[60vh]">
        <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-lg border border-slate-100">
          <h1 className="text-lg font-bold text-slate-900">Permission denied</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Your account does not have permission to register new complaints.
          </p>
          <Link
            href="/complaints"
            className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
          >
            Back to complaints
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col bg-[#f4f7fe] pb-32 md:pb-6 font-sans -mx-4 sm:-mx-6 lg:-mx-8 -mt-6 lg:-mt-7 md:py-2">
      <div className="relative z-10 mx-auto grid w-full max-w-350 flex-1 grid-cols-1 gap-8 md:px-4 lg:grid-cols-[1fr_1.4fr] xl:gap-12">
        <Aside />

        <div className="relative flex h-fit flex-col bg-white p-4 shadow-sm md:rounded-3xl md:px-6 md:py-5">
          {/* Mobile Header */}
          <div className="mb-4 pt-4 flex items-center justify-between border-b border-slate-100 pb-3 lg:hidden">
            <Link
              href="/complaints"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft size={16} />
              <span>{t("Back")}</span>
            </Link>
            <h1 className="text-base font-bold text-slate-900">{t("New Complaint")}</h1>
            <div className="w-12" aria-hidden="true" />
          </div>

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
                    className="flex flex-col items-center gap-1 bg-white px-2 cursor-pointer disabled:cursor-not-allowed"
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
                      {t(s.label)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {step === 1 && (
            <div className="flex flex-col gap-3">
              {/* Department */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-900">
                  {t("Department")} <span className="text-red-500">*</span>
                </label>
                <DepartmentDropdown
                  departments={departments}
                  selectedId={departmentId}
                  onSelect={(id) => {
                    setDepartmentId(id);
                    setCategoryId(null);
                  }}
                  disabled={!departments.length}
                />
              </div>

              {/* Category */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-900">
                  {t("Category")} <span className="text-red-500">*</span>
                </label>
                <CategoryDropdown
                  department={department}
                  selectedId={categoryId}
                  onSelect={(id) => setCategoryId(id)}
                  disabled={!department}
                />
                {category && (
                  <p className="text-[12px] text-slate-500">
                    {t("Priority:")} <span className="font-semibold text-slate-700">{t(category.default_priority.name)}</span>
                  </p>
                )}
              </div>

              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="title" className="text-xs font-bold text-slate-900">
                  {t("Title")} <span className="text-red-500">*</span>
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
                    placeholder={t("A short summary of the problem")}
                    className={fieldBox}
                  />
                </div>
                <Counter value={title} max={limits.title} />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="description" className="text-xs font-bold text-slate-900">
                  {t("Description")} <span className="text-red-500">*</span>
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
                    placeholder={t("What happened, since when, and anything else that helps")}
                    className={`${fieldBox} min-h-24 resize-y`}
                  />
                </div>
                <Counter value={description} max={limits.description} />
              </div>

              {/* Workplace / Location Section */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900">
                    {t("Workplace / Location")} <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowLocationPicker(!showLocationPicker)}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                  >
                    {showLocationPicker ? t("Done selecting") : locationDisplayName ? t("Change location") : t("Choose location")}
                  </button>
                </div>

                {!showLocationPicker && locationDisplayName ? (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-xs">
                    <div className="flex items-center gap-2.5">
                      <MapPin size={16} className="text-blue-600 shrink-0" aria-hidden="true" />
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{locationDisplayName}</span>
                        <span className="text-[11px] text-slate-500">
                          {t("Complaint routing will use this workplace location.")}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3 space-y-2">
                    <LocationPicker
                      value={effectiveLocationId}
                      onChange={(id) => {
                        setLocationId(id);
                      }}
                    />
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => setShowLocationPicker(false)}
                        className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        {t("Confirm Location")}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Room / Desk / Landmark */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="details" className="text-xs font-bold text-slate-900">
                  {t("Room / Desk / Landmark")} <span className="font-normal text-slate-400">{t("(optional)")}</span>
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
                    placeholder={t("e.g. Room 204, 2nd floor desk near printer, or any specific spot")}
                    className={`${fieldBox} resize-none`}
                  />
                </div>
                <Counter value={details} max={limits.additional_details} />
              </div>

              {/* File Uploads */}
              {canAttach && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <UploadCloud size={14} className="text-indigo-600" aria-hidden="true" /> {t("Photos and documents (optional)")}
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
                    className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-3 text-center transition-colors disabled:opacity-50 cursor-pointer ${
                      dragging ? "border-indigo-400 bg-indigo-50/50" : "border-indigo-200/80 bg-[#f8faff] hover:bg-slate-50/50"
                    }`}
                  >
                    <UploadCloud size={18} className="mb-1 text-indigo-600" aria-hidden="true" />
                    <span className="text-xs font-bold text-slate-800">{t("Tap to choose files, or drop them here")}</span>
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
                              // eslint-disable-next-line @next/next/no-img-element -- local preview of chosen file
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
                            className="rounded-full p-1.5 text-red-500 hover:bg-red-50 cursor-pointer"
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

          {/* Step 2: Review */}
          {step === 2 && department && category && (
            <div className="flex flex-col gap-3 text-sm text-slate-700">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div>
                  <h2 className="text-[15px] font-bold text-slate-900">{t("Check your complaint")}</h2>
                  <p className="text-[12px] text-slate-500">{t("Edit anything that isn't right, then submit it.")}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                  <Clock size={11} aria-hidden="true" /> {t("Step 2 of 2")}
                </span>
              </div>
              {[
                {
                  title: t("Details"),
                  icon: FileText,
                  goTo: 1 as Step,
                  rows: [
                    [t("Department"), department.name],
                    [t("Category"), category.name],
                    [t("Starting Priority"), t(category.default_priority.name)],
                    [t("Title"), title],
                    [t("Description"), description],
                  ],
                },
                {
                  title: t("Location"),
                  icon: MapPin,
                  goTo: 1 as Step,
                  rows: [
                    [t("Workplace / Location"), locationDisplayName || t("Selected location")],
                    ...(details.trim() ? [[t("Room / Desk / Landmark"), details]] : []),
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
                      className="flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-bold text-blue-600 shadow-sm hover:bg-blue-50 cursor-pointer"
                    >
                      <Edit3 size={10} aria-hidden="true" /> {t("Edit")}
                    </button>
                  </div>
                  <dl className="grid gap-1.5">
                    {card.rows.map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-slate-100 bg-white p-2">
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
                        <dd className="whitespace-pre-wrap text-[13px] font-semibold text-slate-800 break-words">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              {canAttach && (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-3 shadow-sm">
                  <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <Paperclip size={13} className="text-blue-600" aria-hidden="true" /> {t("Files")} ({files.length})
                  </h3>
                  <p className="text-[12px] text-slate-500">
                    {files.length ? files.map((f) => f.name).join(", ") : t("No files attached.")}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Done */}
          {step === 3 && created && (
            <div className="flex flex-col items-center gap-5 py-4 text-center">
              <div>
                <h2 className="text-2xl font-black text-slate-900 md:text-3xl">{t("Complaint registered")}</h2>
                <p className="mt-2 text-sm text-slate-500 font-medium">
                  {created.assignee
                    ? `${t("Registered and routed to")} ${created.assignee}.`
                    : t("Registered; it has been routed to the department queue.")}
                </p>
              </div>
              <div className="flex w-full max-w-md items-center justify-between rounded-2xl border border-slate-100 bg-[#f0f4f8] p-5">
                <div className="text-left">
                  <p className="mb-1 text-xs font-medium text-slate-500">{t("Complaint ID")}</p>
                  <p className="font-mono text-xl font-black tracking-tight text-slate-900">{created.id}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(created.id).then(
                      () => setCopied(true),
                      () => setError("Copying isn't allowed here; note down the ID instead."),
                    )
                  }
                  className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-100 cursor-pointer"
                >
                  {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{" "}
                  {copied ? t("Copied") : t("Copy")}
                </button>
              </div>
              <p className="text-[12px] text-slate-400">{t("Registered")} {formatDateTime(new Date().toISOString())}</p>
              <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => router.push(`/complaints/${encodeURIComponent(created.id)}`)}
                  className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 cursor-pointer transition-colors"
                >
                  {t("View complaint")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreated(null);
                    setStep(1);
                    setTitle("");
                    setDescription("");
                    setDetails("");
                    setFiles([]);
                    setCategoryId(null);
                  }}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  {t("Register another")}
                </button>
              </div>
            </div>
          )}

          {(error || loadError) && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-center text-xs font-bold text-red-600"
            >
              {error || loadError}
            </p>
          )}

          {step < 3 && (
            <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-3 relative z-0">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep(1);
                  }}
                  className="flex flex-[0.8] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-bold text-blue-600 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  <ArrowLeft size={16} className="mr-2" aria-hidden="true" /> {t("Back")}
                </button>
              )}
              {step === 1 ? (
                <button
                  type="button"
                  onClick={next}
                  className="flex flex-[1.2] items-center justify-center rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-700 cursor-pointer transition-colors"
                >
                  {t("Next")} <ArrowRight size={16} className="ml-2" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="flex flex-[1.2] items-center justify-center rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {submitting ? (
                    t("Sending…")
                  ) : (
                    <>
                      <Send size={16} className="mr-2" aria-hidden="true" /> {t("Send complaint")}
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
