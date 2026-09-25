"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
  CheckCircle2,
  LayoutGrid,
  Landmark,
  UploadCloud,
  FileText,
  ArrowRight,
  Info,
  AlertCircle,
  Clock,
  Globe,
  Map,
  Building,
  Building2,
  MapPin,
  Edit3,
  Paperclip,
  ShieldCheck,
  Check,
  Copy,
  Navigation,
  BellRing,
  PartyPopper,
  X,
  Users,
  ChevronDown,
  Send,
  ArrowLeft
} from "lucide-react";
import { apis, LocationNode, PortalDepartment } from "../../../lib/apis";
import { useCitizen } from "../../../lib/citizenSession";

// Form fields for each level of the location tree, top down.
const LOCATION_FIELDS = ["country", "state", "district", "city", "area"] as const;

const PRIORITIES = [
  { val: "Low", color: "emerald", text: "Low" },
  { val: "Medium", color: "amber", text: "Medium" },
  { val: "High", color: "red", text: "High" },
  { val: "Critical", color: "red", text: "Critical" },
];

export default function RegisterComplaintPage() {
  const router = useRouter();
  const { profile } = useCitizen();
  const [departments, setDepartments] = useState<PortalDepartment[]>([]);
  const [locationTree, setLocationTree] = useState<LocationNode[]>([]);

  // Location defaults to the citizen's registered area.
  const homePath = profile.location?.path_names ?? [];
  const [formData, setFormData] = useState({
    department: "",
    category: "",
    priority: "Low",
    title: "",
    description: "",
    country: homePath[0] ?? "",
    state: homePath[1] ?? "",
    district: homePath[2] ?? "",
    city: homePath[3] ?? "",
    area: homePath[4] ?? "",
    additionalDetails: "",
  });


  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [complaintId, setComplaintId] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [step, setStep] = useState(1);

  useEffect(() => {
    Promise.all([apis.reference.departments(), apis.reference.locationTree()])
      .then(([deps, tree]) => {
        setDepartments(deps);
        setLocationTree(tree);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const selectedDepartment = departments.find((d) => d.name === formData.department);

  // Options for a level are the children of the node selected one level up.
  const locationOptions = (level: number): LocationNode[] => {
    let nodes = locationTree;
    for (let i = 0; i < level; i++) {
      const node = nodes.find((n) => n.name === formData[LOCATION_FIELDS[i]]);
      if (!node) return [];
      nodes = node.children;
    }
    return nodes;
  };

  // Deepest selected node, or null if the selection doesn't match the tree.
  const resolveLocation = (): LocationNode | null => {
    let nodes = locationTree;
    let found: LocationNode | null = null;
    for (const field of LOCATION_FIELDS) {
      if (!formData[field]) break;
      const node = nodes.find((n) => n.name === formData[field]);
      if (!node) return null;
      found = node;
      nodes = node.children;
    }
    return found;
  };

  const locationComplete = () =>
    LOCATION_FIELDS.every((field, level) => formData[field] || locationOptions(level).length === 0) &&
    resolveLocation() !== null;

  const setLocationLevel = (level: number, value: string) => {
    const next = { ...formData, [LOCATION_FIELDS[level]]: value };
    for (const deeper of LOCATION_FIELDS.slice(level + 1)) next[deeper] = "";
    setFormData(next);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (files.length + droppedFiles.length <= 5) {
        setFiles((prev) => [...prev, ...droppedFiles]);
      }
    }
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      if (files.length + selectedFiles.length <= 5) {
        setFiles((prev) => [...prev, ...selectedFiles]);
      }
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const canNavigateToStep = (targetStep: number) => {
    if (step === 4) return false;
    if (targetStep === step) return true;
    if (targetStep < step) return true;
    if (targetStep === 2) {
      return !!(formData.department && formData.category && formData.title.trim() && formData.description.trim());
    }
    if (targetStep === 3) {
      return !!(
        formData.department &&
        formData.category &&
        formData.title.trim() &&
        formData.description.trim() &&
        formData.country &&
        formData.state &&
        formData.district &&
        formData.city &&
        formData.area
      );
    }
    return false;
  };

  const handleStepClick = (targetStep: number) => {
    if (canNavigateToStep(targetStep)) {
      setError("");
      setStep(targetStep);
    }
  };

  const handleNext = () => {
    setError("");
    if (step === 1) {
      if (!formData.department) {
        setError("Please select a department.");
        return;
      }
      if (!formData.category) {
        setError("Please select a category.");
        return;
      }
      if (!formData.title.trim()) {
        setError("Please enter a complaint title.");
        return;
      }
      if (!formData.description.trim()) {
        setError("Please enter a complaint description.");
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!locationComplete()) {
        setError("Please fill in all location fields.");
        return;
      }
      setStep(3);
      return;
    }
  };

  const handlePrev = () => {
    setError("");
    setStep((prev) => Math.max(1, prev - 1));
  };

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    
    // Strict guard: submission ONLY happens from step 3 (Review step)
    if (step !== 3 || loading) {
      return;
    }

    if (!formData.department || !formData.category || !formData.title.trim() || !formData.description.trim()) {
      setError("Please fill in all required complaint details.");
      setStep(1);
      return;
    }
    const location = resolveLocation();
    if (!locationComplete() || !location || !selectedDepartment) {
      setError("Please fill in all location fields.");
      setLoading(false);
      return;
    }
    const category = selectedDepartment.categories.find((c) => c.name === formData.category);

    try {
      const data = new FormData();
      data.append("department_id", String(selectedDepartment.id));
      if (category) data.append("category_id", String(category.id));
      data.append("priority", formData.priority);
      data.append("title", formData.title);
      data.append("description", formData.description);
      data.append("location_id", String(location.id));
      data.append("additional_details", formData.additionalDetails);

      files.forEach((file) => {
        data.append("files", file);
      });

      const response = await apis.complaints.registerComplaint(data);
      setComplaintId(response.complaint_id);
      setStep(4);
    } catch (err) {
      setError((err as Error).message || "An error occurred while submitting the complaint");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-80px)] overflow-y-auto lg:overflow-hidden bg-[#f4f7fe] flex flex-col font-sans relative pt-2 md:pb-2">
      <div
        className={`flex-1 max-w-[1400px] w-full mx-auto md:p-2 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-8 xl:gap-12 px-4 relative z-10`}
      >
        {/* Left Column */}
        <div className={`hidden lg:flex flex-col h-[calc(100vh-120px)] sticky top-6 self-start justify-center`}>
          <div className="flex flex-col w-full max-w-[480px] mx-auto">
          {/* Breadcrumb */}
          <div className="inline-flex items-center gap-2 bg-indigo-50/80 rounded-full px-4 py-1.5 text-indigo-700 text-xs font-semibold w-fit mb-4">
            <Home size={14} />
            <span>Home</span>
            <span className="text-indigo-300">/</span>
            <span>Register Complaint</span>
          </div>

          <h1 className="text-3xl md:text-[2.25rem] font-extrabold text-slate-900 mb-2 tracking-tight leading-tight">
            Register a <span className="text-indigo-600">Complaint</span>
          </h1>
          <p className="text-sm text-slate-500 font-medium mb-6">
            Let us know the issue. We'll get it resolved.
          </p>

          <div className="flex items-center flex-wrap gap-x-5 gap-y-3 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-blue-600 rounded-full text-white flex items-center justify-center shrink-0">
                <Check size={12} strokeWidth={3} />
              </div>
              <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Fast Response</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-blue-600 rounded-full text-white flex items-center justify-center shrink-0">
                <Check size={12} strokeWidth={3} />
              </div>
              <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Track in Real-time</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-blue-600 rounded-full text-white flex items-center justify-center shrink-0">
                <Check size={12} strokeWidth={3} />
              </div>
              <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Better Community</span>
            </div>
          </div>

          {/* Interactive Illustration */}
          <div className="flex-1 flex items-center justify-center w-full relative my-12">
            <style>{`
              @keyframes float-1 {
                0%, 100% { transform: translateY(0) rotate(-6deg); }
                50% { transform: translateY(-15px) rotate(2deg); }
              }
              @keyframes float-2 {
                0%, 100% { transform: translateY(0) rotate(8deg); }
                50% { transform: translateY(-20px) rotate(-4deg); }
              }
              @keyframes float-3 {
                0%, 100% { transform: translateY(0) rotate(-4deg); }
                50% { transform: translateY(-12px) rotate(4deg); }
              }
              @keyframes float-4 {
                0%, 100% { transform: translateY(0) rotate(6deg); }
                50% { transform: translateY(-18px) rotate(-2deg); }
              }
              .anim-float-1 { animation: float-1 4s ease-in-out infinite; }
              .anim-float-2 { animation: float-2 5s ease-in-out infinite 1s; }
              .anim-float-3 { animation: float-3 4.5s ease-in-out infinite 0.5s; }
              .anim-float-4 { animation: float-4 5.5s ease-in-out infinite 1.5s; }
            `}</style>
            <div className="relative w-80 h-80">
              {/* Central Hub */}
              <div className="absolute inset-0 m-auto w-32 h-32 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-blue-500/40 z-20 transition-transform duration-500 hover:scale-110 cursor-pointer">
                <Globe size={56} className="text-white" />
              </div>
              
              {/* Orbiting Ring 1 */}
              <div className="absolute inset-0 m-auto w-[240px] h-[240px] border-[1.5px] border-indigo-200/60 rounded-full z-10"></div>
              
              {/* Orbiting Ring 2 (Dashed & Spinning) */}
              <div className="absolute inset-0 m-auto w-[320px] h-[320px] border-[2px] border-indigo-200/50 rounded-full z-10 border-dashed animate-[spin_40s_linear_infinite]"></div>

              {/* Floating Cards */}
              <div className="absolute top-2 left-2 w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-100/60 z-30 anim-float-1">
                <MapPin size={32} className="text-red-500" />
              </div>
              
              <div className="absolute bottom-6 right-0 w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-xl shadow-indigo-100/60 z-30 anim-float-2">
                <ShieldCheck size={40} className="text-emerald-500" />
              </div>

              <div className="absolute top-8 right-2 w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-100/60 z-30 anim-float-3">
                <AlertCircle size={28} className="text-amber-500" />
              </div>
              
              <div className="absolute bottom-4 left-6 w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-100/60 z-30 anim-float-4">
                <Users size={28} className="text-blue-500" />
              </div>
              
              {/* Background Glow */}
              <div className="absolute inset-0 m-auto w-48 h-48 bg-blue-400/20 rounded-full blur-[40px] z-0 animate-pulse"></div>
            </div>
          </div>

          {/* Bottom Info Cards */}
          <div className="bg-white/90 backdrop-blur-sm rounded-[2rem] px-6 py-6 flex items-center justify-between shadow-lg shadow-indigo-100/30 mt-8 gap-4 border border-white">
            <div className="flex flex-col items-center justify-center text-center flex-1">
              <div className="w-10 h-10 bg-indigo-50 rounded-full text-indigo-600 flex items-center justify-center mb-3">
                <Home size={18} />
              </div>
              <p className="text-sm font-bold text-slate-900 mb-0.5 whitespace-nowrap">Report Issues</p>
              <p className="text-[11px] text-slate-500 font-medium whitespace-nowrap">Easy & Quick</p>
            </div>
            <div className="w-px h-12 bg-slate-100"></div>
            <div className="flex flex-col items-center justify-center text-center flex-1">
              <div className="w-10 h-10 bg-indigo-50 rounded-full text-indigo-600 flex items-center justify-center mb-3">
                <Clock size={18} />
              </div>
              <p className="text-sm font-bold text-slate-900 mb-0.5 whitespace-nowrap">Track Progress</p>
              <p className="text-[11px] text-slate-500 font-medium whitespace-nowrap">Real-time Updates</p>
            </div>
            <div className="w-px h-12 bg-slate-100"></div>
            <div className="flex flex-col items-center justify-center text-center flex-1">
              <div className="w-10 h-10 bg-indigo-50 rounded-full text-indigo-600 flex items-center justify-center mb-3">
                <Users size={18} />
              </div>
              <p className="text-sm font-bold text-slate-900 mb-0.5 whitespace-nowrap">Community</p>
              <p className="text-[11px] text-slate-500 font-medium whitespace-nowrap">Together We Build</p>
            </div>
          </div>
          </div>
        </div>

        {/* Right Column (Form Card) */}
        <div
          className={`bg-white rounded-[1.5rem] shadow-sm p-3.5 md:px-6 md:py-3.5 flex flex-col justify-between relative mt-0.5 lg:h-[calc(100vh-120px)] ${
            step === 4 ? "w-full lg:max-w-2xl lg:mx-auto overflow-y-auto" : "overflow-hidden"
          }`}
        >
          {step !== 4 ? (
            <form onSubmit={(e) => e.preventDefault()} className="flex flex-col justify-between h-full gap-1.5 w-full animate-in fade-in overflow-hidden">
              {/* Stepper */}
              <div className="flex items-center justify-between w-full mb-1 relative px-2">
                <div className="absolute top-[16px] left-[10%] right-[10%] h-[2px] bg-slate-100 -z-10" />
                {[
                  { id: 1, label: "Details" },
                  { id: 2, label: "Location" },
                  { id: 3, label: "Review" },
                  { id: 4, label: "Submit" },
                ].map((s) => {
                  const isClickable = canNavigateToStep(s.id);
                  const isCurrent = step === s.id;
                  const isCompleted = step > s.id;

                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!isClickable}
                      onClick={() => handleStepClick(s.id)}
                      className={`flex flex-col items-center gap-1 bg-white relative z-10 px-2 transition-all ${
                        isClickable ? "cursor-pointer group" : "cursor-default"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                          isCurrent
                            ? "bg-blue-600 text-white shadow-md shadow-blue-200 ring-4 ring-blue-50"
                            : isCompleted
                            ? "bg-emerald-500 text-white shadow-sm group-hover:scale-105"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {isCompleted ? <Check size={14} strokeWidth={3} /> : s.id}
                      </div>
                      <div
                        className={`text-[11px] ${
                          isCurrent
                            ? "font-bold text-slate-900"
                            : isCompleted
                            ? "font-semibold text-slate-700 group-hover:text-blue-600"
                            : "font-semibold text-slate-400"
                        }`}
                      >
                        {s.label}
                      </div>
                      {isCurrent && (
                        <div className="absolute -bottom-1 w-full h-[2px] bg-blue-600 rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>

              {step === 1 && (
                <>
              {/* Department */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900">
                    Department <span className="text-red-500">*</span>
                  </label>
                  <button type="button" className="text-[11px] font-bold text-indigo-600 flex items-center gap-1 hover:text-indigo-700">
                    <LayoutGrid size={12} /> View Departments
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none bg-indigo-50 p-1.5 rounded-lg">
                    <Landmark size={14} />
                  </div>
                  <select
                    value={formData.department}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        department: e.target.value,
                        category: "",
                      })
                    }
                    className="w-full pl-12 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 appearance-none text-slate-700"
                  >
                    <option value="" disabled>
                      Select Department
                    </option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>

              {/* Category */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-900">
                  Category <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none bg-indigo-50 p-1.5 rounded-lg">
                    <LayoutGrid size={14} />
                  </div>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    disabled={!formData.department}
                    className="w-full pl-12 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 appearance-none text-slate-700 disabled:opacity-50 disabled:bg-slate-50"
                  >
                    <option value="" disabled>
                      Select Category
                    </option>
                    {selectedDepartment?.categories.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>

              {/* Priority */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-900">
                  Priority <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRIORITIES.map((p, index) => {
                    const isSelected = formData.priority === p.val;
                    const isRed = p.color === 'red';
                    const isAmber = p.color === 'amber';
                    const bgClass = isSelected
                      ? (isRed ? 'bg-red-50 border border-red-200 text-red-600' : isAmber ? 'bg-amber-50 border border-amber-200 text-amber-600' : 'bg-emerald-50 border border-emerald-200 text-emerald-600')
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-transparent';
                    const iconColor = isRed ? 'bg-red-500' : isAmber ? 'bg-amber-500' : 'bg-emerald-500';
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, priority: p.val })
                        }
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${bgClass}`}
                      >
                        {!isSelected ? (
                          <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center bg-slate-300 text-white text-[9px]`}>!</div>
                        ) : (
                          <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${iconColor} text-white`}>
                            <Check size={8} strokeWidth={4} />
                          </div>
                        )}
                        {p.text}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-900">
                  Title <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none bg-indigo-50 p-1.5 rounded-lg">
                    <FileText size={14} />
                  </div>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        title: e.target.value.slice(0, 100),
                      })
                    }
                    placeholder="Enter a short title (e.g. Street light not working)"
                    className="w-full pl-12 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none placeholder-slate-400"
                  />
                </div>
                <div className="text-right mt-0">
                  <span className="text-[10px] font-semibold text-slate-400">
                    {formData.title.length}/100
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-900">
                  Description <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-2.5 text-indigo-500 pointer-events-none bg-indigo-50 p-1.5 rounded-lg">
                    <FileText size={14} />
                  </div>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        description: e.target.value.slice(0, 500),
                      })
                    }
                    placeholder="Describe the issue in detail..."
                    className="w-full pl-12 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none placeholder-slate-400 min-h-[48px] resize-none"
                  />
                </div>
                <div className="text-right mt-0">
                  <span className="text-[10px] font-semibold text-slate-400">
                    {formData.description.length}/500
                  </span>
                </div>
              </div>

              {/* Add Photos */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <UploadCloud size={14} className="text-indigo-600" /> Add Photos / Attachments
                  </label>
                  <span className="text-[10px] font-semibold text-slate-400">
                    Max 5 files (10 MB each)
                  </span>
                </div>

                <div
                  className={`w-full border-2 border-dashed rounded-xl p-2 flex flex-col items-center justify-center text-center cursor-pointer transition-colors
                  ${
                    isDragging
                      ? "border-indigo-400 bg-indigo-50/50"
                      : "border-indigo-200/80 bg-[#f8faff] hover:bg-slate-50/50"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloud size={16} className="text-indigo-600 mb-1" />
                  <p className="text-xs font-bold text-slate-800 mb-0.5">
                    Tap to upload photos
                  </p>
                  <p className="text-[10px] font-semibold text-slate-400">
                    JPG, PNG or PDF (Max 10 MB each)
                  </p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.csv,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleFileSelect}
                  />
                </div>
                {files.length > 0 && (
                  <div className="flex flex-col gap-2 mt-2">
                    {files.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded-xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          {file.type.startsWith("image/") ? (
                            <img
                              src={URL.createObjectURL(file)}
                              alt="preview"
                              className="w-8 h-8 object-cover rounded-lg border border-slate-100"
                            />
                          ) : file.type.includes("pdf") || file.name.endsWith(".pdf") ? (
                            <div className="w-8 h-8 bg-red-50 text-red-600 rounded-lg flex items-center justify-center shrink-0 font-bold text-[8px]">
                              PDF
                            </div>
                          ) : (
                            <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                              <FileText size={14} />
                            </div>
                          )}
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-[11px] font-bold text-slate-700 truncate">
                              {file.name}
                            </span>
                            <span className="text-[9px] text-slate-400">
                              {(file.size / 1024).toFixed(1)} KB
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                          className="text-red-500 hover:bg-red-50 p-1.5 rounded-full transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
                </>
              )}

              {step === 2 && (
                <div className="flex flex-col gap-1.5 animate-in fade-in">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Select Location</h2>
                    <p className="text-xs text-slate-500 mt-1">Choose the location where the issue is occurring.</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                     <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-1 pr-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 shadow-sm">
                       <div className="bg-blue-50 p-1.5 rounded-lg text-blue-500"><Globe size={18} /></div>
                       <div className="flex-1">
                         <label className="text-[10px] font-bold text-slate-500">Country <span className="text-red-500">*</span></label>
                         <select value={formData.country} onChange={e => setLocationLevel(0, e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none appearance-none">
                           <option value="" disabled>Select</option>
                           {locationOptions(0).map((n) => <option key={n.id} value={n.name}>{n.name}</option>)}
                         </select>
                       </div>
                       <ChevronDown size={16} className="text-slate-400" />
                     </div>

                     <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-1 pr-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 shadow-sm">
                       <div className="bg-blue-50 p-1.5 rounded-lg text-blue-500"><Map size={18} /></div>
                       <div className="flex-1">
                         <label className="text-[10px] font-bold text-slate-500">State <span className="text-red-500">*</span></label>
                         <select value={formData.state} onChange={e => setLocationLevel(1, e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none appearance-none">
                           <option value="" disabled>Select</option>
                           {locationOptions(1).map((n) => <option key={n.id} value={n.name}>{n.name}</option>)}
                         </select>
                       </div>
                       <ChevronDown size={16} className="text-slate-400" />
                     </div>

                     <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-1 pr-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 shadow-sm">
                       <div className="bg-blue-50 p-1.5 rounded-lg text-blue-500"><Building size={18} /></div>
                       <div className="flex-1">
                         <label className="text-[10px] font-bold text-slate-500">District <span className="text-red-500">*</span></label>
                         <select value={formData.district} onChange={e => setLocationLevel(2, e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none appearance-none">
                           <option value="" disabled>Select</option>
                           {locationOptions(2).map((n) => <option key={n.id} value={n.name}>{n.name}</option>)}
                         </select>
                       </div>
                       <ChevronDown size={16} className="text-slate-400" />
                     </div>

                     <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-1 pr-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 shadow-sm">
                       <div className="bg-blue-50 p-1.5 rounded-lg text-blue-500"><Building2 size={18} /></div>
                       <div className="flex-1">
                         <label className="text-[10px] font-bold text-slate-500">City <span className="text-red-500">*</span></label>
                         <select value={formData.city} onChange={e => setLocationLevel(3, e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none appearance-none">
                           <option value="" disabled>Select</option>
                           {locationOptions(3).map((n) => <option key={n.id} value={n.name}>{n.name}</option>)}
                         </select>
                       </div>
                       <ChevronDown size={16} className="text-slate-400" />
                     </div>

                     <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-1 pr-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 shadow-sm">
                       <div className="bg-blue-50 p-1.5 rounded-lg text-blue-500"><MapPin size={18} /></div>
                       <div className="flex-1">
                         <label className="text-[10px] font-bold text-slate-500">Area / Locality <span className="text-red-500">*</span></label>
                         <select value={formData.area} onChange={e => setLocationLevel(4, e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none appearance-none">
                           <option value="" disabled>Select</option>
                           {locationOptions(4).map((n) => <option key={n.id} value={n.name}>{n.name}</option>)}
                         </select>
                       </div>
                       <ChevronDown size={16} className="text-slate-400" />
                     </div>

                     {/* Map Placeholder */}
                     <div className="relative w-full h-20 bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                        <div className="absolute inset-0 bg-green-50/50"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shadow-lg text-white opacity-90 border-4 border-blue-200">
                             <MapPin size={20} className="fill-blue-600 text-white" />
                          </div>
                        </div>
                        <div className="absolute bottom-3 left-3 bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100 flex items-center gap-2">
                          <Navigation size={12} className="text-slate-500" />
                          <span className="text-[10px] font-semibold text-slate-700 truncate max-w-[150px]">{formData.area}, {formData.city}, {formData.state}, {formData.country}</span>
                        </div>
                        <div className="absolute bottom-3 right-3 bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100 flex items-center gap-2 text-blue-600 font-bold cursor-pointer hover:bg-blue-50">
                          <Navigation size={12} />
                          <span className="text-[10px]">Use My Location</span>
                        </div>
                     </div>

                     <div className="mt-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-[11px] font-bold text-slate-900">Additional Location Details <span className="text-slate-400 font-normal">(Optional)</span></h3>
                        </div>
                        <p className="text-[9px] text-slate-500 mb-0.5">Add nearby landmarks or more details to help us find the exact location.</p>
                        
                        <div className="flex gap-3 bg-white border border-slate-200 rounded-xl p-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 shadow-sm">
                           <div className="bg-blue-50 p-1.5 rounded-lg text-blue-500 h-fit mt-0.5"><Building size={18} /></div>
                           <div className="flex-1 flex flex-col">
                             <textarea value={formData.additionalDetails} onChange={e => setFormData({...formData, additionalDetails: e.target.value.slice(0,200)})} placeholder="E.g. Near Mansarovar Metro Station, opposite City Mall..." className="w-full bg-transparent text-sm font-medium text-slate-900 outline-none resize-none min-h-[36px]" />
                             <div className="text-right text-[10px] text-slate-400 font-semibold mt-1">{formData.additionalDetails.length}/200</div>
                           </div>
                        </div>
                     </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="flex flex-col gap-2 text-sm text-slate-700 animate-in fade-in flex-1 justify-between overflow-hidden">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <div>
                      <h2 className="text-sm md:text-base font-bold text-slate-900 leading-tight">Review Your Complaint</h2>
                      <p className="text-[10px] text-slate-500">Verify your information before final submission. Click Edit on any card to modify.</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200/80 rounded-full text-[10px] font-bold shrink-0">
                      <Clock size={11} /> Step 3 of 4
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 flex-1 min-h-0">
                    {/* Column 1: Complaint Details */}
                    <div className="bg-slate-50/90 rounded-xl border border-slate-200/80 p-2.5 flex flex-col justify-between shadow-sm">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                              <FileText size={12} />
                            </div>
                            <h3 className="font-bold text-slate-900 text-xs">1. Complaint Details</h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="flex items-center gap-1 px-2 py-0.5 bg-white text-blue-600 rounded-md text-[10px] font-bold hover:bg-blue-50 transition-colors border border-blue-200 shadow-sm"
                          >
                            <Edit3 size={10} /> Edit Details
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 text-xs">
                          <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                            <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Department</span>
                            <span className="font-bold text-slate-800 text-xs truncate block">{formData.department || "-"}</span>
                          </div>
                          <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                            <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Category</span>
                            <span className="font-bold text-slate-800 text-xs truncate block">{formData.category || "-"}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between bg-white px-2 py-1 rounded-lg border border-slate-100">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Priority</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            formData.priority === 'Critical' || formData.priority === 'High'
                              ? 'bg-red-50 text-red-600 border border-red-200'
                              : formData.priority === 'Medium'
                              ? 'bg-amber-50 text-amber-600 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                          }`}>
                            {formData.priority}
                          </span>
                        </div>

                        <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                          <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Title</span>
                          <p className="font-bold text-slate-900 text-xs truncate">{formData.title || "-"}</p>
                        </div>

                        <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                          <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Description</span>
                          <p className="text-xs text-slate-700 leading-snug font-medium line-clamp-3">{formData.description || "-"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Location & Attachments */}
                    <div className="flex flex-col gap-2 justify-between">
                      {/* Location Details */}
                      <div className="bg-slate-50/90 rounded-xl border border-slate-200/80 p-2.5 shadow-sm flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-slate-200/60">
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                <MapPin size={12} />
                              </div>
                              <h3 className="font-bold text-slate-900 text-xs">2. Location Details</h3>
                            </div>
                            <button
                              type="button"
                              onClick={() => setStep(2)}
                              className="flex items-center gap-1 px-2 py-0.5 bg-white text-blue-600 rounded-md text-[10px] font-bold hover:bg-blue-50 transition-colors border border-blue-200 shadow-sm"
                            >
                              <Edit3 size={10} /> Edit Location
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5 text-xs mb-1.5">
                            <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Area</span>
                              <span className="font-bold text-slate-800 text-xs truncate block">{formData.area || "-"}</span>
                            </div>
                            <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">City</span>
                              <span className="font-bold text-slate-800 text-xs truncate block">{formData.city || "-"}</span>
                            </div>
                            <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">District / State</span>
                              <span className="font-bold text-slate-800 text-xs truncate block">{formData.district}, {formData.state}</span>
                            </div>
                            <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Country</span>
                              <span className="font-bold text-slate-800 text-xs truncate block">{formData.country || "India"}</span>
                            </div>
                          </div>

                          {formData.additionalDetails ? (
                            <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Landmark / Notes</span>
                              <p className="text-xs text-slate-700 font-medium truncate">{formData.additionalDetails}</p>
                            </div>
                          ) : (
                            <div className="bg-white/60 p-1 rounded-lg border border-dashed border-slate-200 text-center">
                              <span className="text-[9px] text-slate-400 font-medium">No additional landmark provided</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Attachments Section */}
                      <div className="bg-slate-50/90 rounded-xl border border-slate-200/80 p-2 shadow-sm">
                        <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-200/60">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                              <Paperclip size={12} />
                            </div>
                            <h3 className="font-bold text-slate-900 text-xs">
                              3. Attachments {files.length > 0 ? `(${files.length})` : ""}
                            </h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="flex items-center gap-1 px-2 py-0.5 bg-white text-blue-600 rounded-md text-[10px] font-bold hover:bg-blue-50 transition-colors border border-blue-200 shadow-sm"
                          >
                            <Edit3 size={10} /> {files.length > 0 ? "Edit" : "+ Add"}
                          </button>
                        </div>

                        {files.length > 0 ? (
                          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                            {files.map((f, i) => (
                              <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-white rounded-lg border border-slate-100 shadow-sm shrink-0">
                                {f.type.startsWith('image/') ? (
                                  <img src={URL.createObjectURL(f)} className="w-6 h-6 object-cover rounded border border-slate-100" alt={f.name} />
                                ) : (
                                  <div className="w-6 h-6 rounded bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                    <FileText size={12} />
                                  </div>
                                )}
                                <div className="flex flex-col max-w-[100px]">
                                  <span className="text-[10px] font-bold text-slate-800 truncate">{f.name}</span>
                                  <span className="text-[8px] text-slate-400 font-medium">{(f.size / 1024).toFixed(1)} KB</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-400 font-medium py-0.5 italic">No attachments uploaded (Optional)</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Full Width Confirmation Strip */}
                  <div className="flex items-center gap-2 bg-blue-50/80 px-3 py-1.5 rounded-xl border border-blue-100 text-[10px] text-slate-600 shrink-0">
                    <ShieldCheck size={14} className="text-blue-600 shrink-0" />
                    <p className="font-medium leading-tight">
                      Please confirm all details above are accurate. When ready, click <span className="font-bold text-slate-900">"Submit Complaint"</span> below.
                    </p>
                  </div>
                </div>
              )}

              {error && <div className="text-red-500 text-xs font-bold text-center mt-2 bg-red-50 py-1.5 px-3 rounded-lg border border-red-100">{error}</div>}

              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100">
                {step > 1 && (
                  <button
                    key="btn-prev"
                    type="button"
                    onClick={handlePrev}
                    className="flex-[0.8] bg-slate-50 text-blue-600 font-bold py-2.5 rounded-xl flex items-center justify-center transition-all text-sm border border-slate-200 hover:bg-slate-100"
                  >
                    <ArrowLeft size={16} className="mr-2" /> Back
                  </button>
                )}
                {step < 3 ? (
                  <button
                    key={`btn-next-${step}`}
                    type="button"
                    onClick={handleNext}
                    className="flex-[1.2] bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center transition-all shadow-lg shadow-blue-500/25 text-sm"
                  >
                    Next <ArrowRight size={16} className="ml-2" />
                  </button>
                ) : (
                  <button
                    key="btn-submit"
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    className="flex-[1.2] bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center transition-all shadow-lg shadow-blue-500/25 text-sm disabled:opacity-50"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Submitting Complaint...
                      </span>
                    ) : (
                      <>
                        <Send size={16} className="mr-2" /> Submit Complaint
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="flex flex-col items-center justify-center gap-6 w-full h-full animate-in fade-in pb-4">
              <div className="flex flex-col items-center w-full">
                {/* Confetti & Check */}
                <div className="relative w-full flex justify-center mb-6 mt-2">
                  <div className="absolute top-0 -ml-12 w-2 h-3 bg-amber-400 rounded-full rotate-45 opacity-80"></div>
                  <div className="absolute top-2 ml-20 w-3 h-3 bg-blue-500 rounded-full opacity-80"></div>
                  <div className="absolute top-10 -ml-20 w-3 h-3 bg-emerald-400 rounded-full opacity-80"></div>
                  
                  <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-xl shadow-emerald-500/30 z-10 relative border-4 border-white">
                    <Check size={40} className="text-white" strokeWidth={4} />
                  </div>
                  
                  <button onClick={() => router.push("/dashboard")} className="absolute -top-4 right-0 md:hidden bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5">
                    <Home size={12} /> Go to Home
                  </button>
                </div>

                <div className="text-center mb-6">
                  <h2 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight mb-2">
                    Complaint Submitted Successfully!
                  </h2>
                  <p className="text-sm text-slate-500 px-4">
                    Your complaint has been registered. We'll keep you updated.
                  </p>
                </div>

                <div className="bg-[#f0f4f8] w-full max-w-md p-5 rounded-2xl flex items-center justify-between mb-4 border border-slate-100">
                  <div className="flex flex-col items-start">
                    <p className="text-xs font-medium text-slate-500 mb-1">Complaint ID</p>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-black text-slate-900 tracking-tight">{complaintId || "CMP-10231"}</h3>
                      <button className="text-blue-600 hover:bg-blue-100 p-1.5 rounded-md transition-colors bg-blue-50">
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium text-right max-w-[90px]">
                    {new Date().toLocaleString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true})}
                  </p>
                </div>
              </div>

              <div className="w-full text-left">
                <h3 className="text-base font-extrabold text-slate-900 mb-4">What's Next?</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   {/* Step 1 */}
                   <div className="flex flex-col gap-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                     <div className="flex items-center justify-between">
                       <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><Send size={14} /></div>
                       <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Completed</span>
                     </div>
                     <div>
                       <h4 className="text-sm font-bold text-slate-900">Assigned to Department</h4>
                       <p className="text-xs text-slate-500 mt-0.5">Forwarded to the {formData.department || "Electricity"} Department.</p>
                     </div>
                   </div>
                   
                   {/* Step 2 */}
                   <div className="flex flex-col gap-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                     <div className="flex items-center justify-between">
                       <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0"><Clock size={14} /></div>
                       <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700">In Progress</span>
                     </div>
                     <div>
                       <h4 className="text-sm font-bold text-slate-900">Assigned to Agent</h4>
                       <p className="text-xs text-slate-500 mt-0.5">A field agent will be assigned shortly.</p>
                     </div>
                   </div>

                   {/* Step 3 */}
                   <div className="flex flex-col gap-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                     <div className="flex items-center justify-between">
                       <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"><BellRing size={14} /></div>
                       <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600">Pending</span>
                     </div>
                     <div>
                       <h4 className="text-sm font-bold text-slate-900">Updates via Notifications</h4>
                       <p className="text-xs text-slate-500 mt-0.5">You'll receive updates in the app.</p>
                     </div>
                   </div>

                   {/* Step 4 */}
                   <div className="flex flex-col gap-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                     <div className="flex items-center justify-between">
                       <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"><CheckCircle2 size={14} /></div>
                       <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600">Pending</span>
                     </div>
                     <div>
                       <h4 className="text-sm font-bold text-slate-900">Resolution</h4>
                       <p className="text-xs text-slate-500 mt-0.5">We'll notify you once resolved.</p>
                     </div>
                   </div>
                </div>
              </div>

              <div className="w-full flex flex-col gap-4">
                <div className="flex items-start gap-3 bg-blue-50/50 p-4 rounded-xl border border-blue-100 w-full">
                  <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Info size={12} />
                  </div>
                  <p className="text-xs text-slate-600 font-medium">
                    Track the status and view updates from the My Complaints section.
                  </p>
                </div>

                <div className="flex w-full flex-col sm:flex-row items-center gap-3">
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="w-full sm:flex-1 bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 font-bold py-3 md:py-3.5 rounded-xl flex items-center justify-center transition-all text-sm md:text-base"
                  >
                    View My Complaints
                  </button>
                  <button
                    onClick={() => {
                      setStep(1);
                      setFormData({...formData, title: "", description: ""});
                      setFiles([]);
                    }}
                    className="w-full sm:flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 md:py-3.5 rounded-xl flex items-center justify-center transition-all shadow-lg shadow-blue-500/25 text-sm md:text-base"
                  >
                    Submit Another Complaint
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Footer */}
      <footer className="w-full max-w-[1400px] mx-auto px-8 py-6 flex items-center justify-between text-[11px] font-semibold text-slate-400 mt-auto">
        <span>© 2025 CivicConnect. All rights reserved.</span>
        <span>— Your Voice Makes a Better Tomorrow —</span>
      </footer>
    </div>
  );
}
