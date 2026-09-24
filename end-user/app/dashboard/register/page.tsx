"use client";

import React, { useState, useRef } from "react";
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
import { apis } from "../../../lib/apis";

const DEPARTMENTS = [
  "Electricity",
  "Water Supply",
  "Sanitation",
  "Public Works",
  "Parks & Gardens",
];

const CATEGORIES: Record<string, string[]> = {
  Electricity: ["Street Light", "Power Cut", "Fallen Pole", "Other"],
  "Water Supply": ["No Water", "Leakage", "Contaminated Water", "Other"],
  Sanitation: ["Garbage Collection", "Drainage Issue", "Dead Animal", "Other"],
  "Public Works": ["Potholes", "Road Damage", "Footpath Issue", "Other"],
  "Parks & Gardens": ["Fallen Tree", "Park Maintenance", "Other"],
};

const PRIORITIES = [
  { val: "Low", color: "emerald", text: "Low" },
  { val: "Medium", color: "amber", text: "Medium" },
  { val: "High", color: "red", text: "High" },
  { val: "Critical", color: "red", text: "Critical" },
];

export default function RegisterComplaintPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    department: "",
    category: "",
    priority: "Low",
    title: "",
    description: "",
    country: "India",
    state: "Rajasthan",
    district: "Jaipur",
    city: "Jaipur",
    area: "Mansarovar",
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

  const handleNext = () => {
    if (step === 1) {
      if (!formData.department || !formData.category || !formData.title.trim() || !formData.description.trim()) {
        setError("Please fill in all required details in the form.");
        return;
      }
    }
    if (step === 2) {
      if (!formData.country || !formData.state || !formData.district || !formData.city || !formData.area) {
        setError("Please fill in all location fields.");
        return;
      }
    }
    setError("");
    setStep((prev) => prev + 1);
  };

  const handlePrev = () => {
    setError("");
    setStep((prev) => prev - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (step !== 3) {
      handleNext();
      return;
    }

    setLoading(true);
    setError("");

    if (!formData.department || !formData.category || !formData.title.trim() || !formData.description.trim()) {
      setError("Please fill in all required details in the form.");
      setLoading(false);
      return;
    }
    if (!formData.country || !formData.state || !formData.district || !formData.city || !formData.area) {
      setError("Please fill in all location fields.");
      setLoading(false);
      return;
    }

    try {
      const data = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        if (key === "additionalDetails") {
          data.append("additional_details", value as string);
        } else {
          data.append(key, value as string);
        }
      });

      files.forEach((file) => {
        data.append("files", file);
      });

      const response = await apis.complaints.registerComplaint(data);
      if (response.success) {
        setComplaintId(response.complaint_id);
        setStep(4);
      } else {
        setError(response.message || "Failed to submit complaint");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while submitting the complaint");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-80px)] overflow-y-auto bg-[#f4f7fe] flex flex-col font-sans relative pt-2 md:pb-2">
      <div
        className={`flex-1 max-w-[1400px] w-full mx-auto md:p-2 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-8 xl:gap-12 px-4 relative z-10`}
      >
        {/* Left Column */}
        <div className={`hidden lg:flex flex-col h-[calc(100vh-120px)] sticky top-6 self-start`}>
          <div className="flex flex-col w-full max-w-[420px] mx-auto h-full">
          {/* Breadcrumb */}
          <div className="inline-flex items-center gap-2 bg-indigo-50/80 rounded-full px-4 py-1.5 text-indigo-700 text-xs font-semibold w-fit mb-4">
            <Home size={14} />
            <span>Home</span>
            <span className="text-indigo-300">/</span>
            <span>Register Complaint</span>
          </div>

          <h1 className="text-3xl md:text-[2.25rem] font-extrabold text-slate-900 mb-2 tracking-tight leading-tight">
            {step === 4 ? (
              <>Complaint <span className="text-indigo-600">Registered</span></>
            ) : (
              <>Register a <span className="text-indigo-600">Complaint</span></>
            )}
          </h1>
          <p className="text-sm text-slate-500 font-medium mb-6">
            {step === 4 ? "Thank you for being an active citizen. We are on it!" : "Let us know the issue. We'll get it resolved."}
          </p>

          <div className="flex items-center gap-6 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-blue-600 rounded-full text-white flex items-center justify-center">
                <Check size={12} strokeWidth={3} />
              </div>
              <span className="text-sm font-semibold text-slate-700">Fast Response</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-blue-600 rounded-full text-white flex items-center justify-center">
                <Check size={12} strokeWidth={3} />
              </div>
              <span className="text-sm font-semibold text-slate-700">Track in Real-time</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-blue-600 rounded-full text-white flex items-center justify-center">
                <Check size={12} strokeWidth={3} />
              </div>
              <span className="text-sm font-semibold text-slate-700">Better Community</span>
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
              <div className="absolute inset-0 m-auto w-32 h-32 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-[2rem] rotate-3 flex items-center justify-center shadow-2xl shadow-blue-500/40 z-20 transition-transform duration-500 hover:rotate-12 hover:scale-110 cursor-pointer">
                <Globe size={56} className="text-white -rotate-3" />
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
          <div className="bg-white rounded-[1.5rem] p-4 flex items-center justify-between shadow-sm mt-auto pb-4 gap-2">
            <div className="flex flex-col items-center justify-center text-center flex-1">
              <div className="w-9 h-9 bg-indigo-50 rounded-full text-indigo-600 flex items-center justify-center mb-2">
                <Home size={16} />
              </div>
              <p className="text-xs font-bold text-slate-900 mb-0.5">Report Issues</p>
              <p className="text-[10px] text-slate-400 font-medium">Easy & Quick</p>
            </div>
            <div className="flex flex-col items-center justify-center text-center flex-1 border-l border-slate-100">
              <div className="w-9 h-9 bg-indigo-50 rounded-full text-indigo-600 flex items-center justify-center mb-2">
                <Clock size={16} />
              </div>
              <p className="text-xs font-bold text-slate-900 mb-0.5">Track Progress</p>
              <p className="text-[10px] text-slate-400 font-medium">Real-time Updates</p>
            </div>
            <div className="flex flex-col items-center justify-center text-center flex-1 border-l border-slate-100">
              <div className="w-9 h-9 bg-indigo-50 rounded-full text-indigo-600 flex items-center justify-center mb-2">
                <Users size={16} />
              </div>
              <p className="text-xs font-bold text-slate-900 mb-0.5">Better Community</p>
              <p className="text-[10px] text-slate-400 font-medium">Together We Build</p>
            </div>
          </div>
        </div>
      </div>

        {/* Right Column (Form Card) */}
        <div
          className={`bg-white rounded-[1.5rem] shadow-sm p-4 md:p-8 flex flex-col relative h-fit mt-0.5 ${
            step === 4 ? "w-full lg:max-w-2xl lg:mx-auto" : ""
          }`}
        >
          {step !== 4 ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 w-full animate-in fade-in">
              {/* Stepper */}
              <div className="flex items-center justify-between w-full mb-2 relative px-2">
                <div className="absolute top-[18px] left-[10%] right-[10%] h-[2px] bg-slate-100 -z-10" />
                {[ {id:1, label:"Details"}, {id:2, label:"Location"}, {id:3, label:"Review"}, {id:4, label:"Submit"} ].map((s) => (
                  <div key={s.id} className="flex flex-col items-center gap-2 bg-white relative z-10 px-2">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                      step >= s.id ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "bg-slate-50 text-slate-400"
                    }`}>
                      {step > s.id ? <Check size={16} strokeWidth={3} /> : s.id}
                    </div>
                    <div className={`text-xs ${step >= s.id ? "font-bold text-slate-900" : "font-semibold text-slate-400"}`}>
                      {s.label}
                    </div>
                    {step === s.id && <div className="absolute -bottom-2 w-full h-[2px] bg-blue-600" />}
                  </div>
                ))}
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
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
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
                    {formData.department &&
                      CATEGORIES[formData.department]?.map((c) => (
                        <option key={c} value={c}>
                          {c}
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
                    accept="image/*,application/pdf,.csv,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
                         <select value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})} className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none appearance-none">
                           <option value="India">India</option>
                         </select>
                       </div>
                       <ChevronDown size={16} className="text-slate-400" />
                     </div>

                     <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-1 pr-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 shadow-sm">
                       <div className="bg-blue-50 p-1.5 rounded-lg text-blue-500"><Map size={18} /></div>
                       <div className="flex-1">
                         <label className="text-[10px] font-bold text-slate-500">State <span className="text-red-500">*</span></label>
                         <select value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none appearance-none">
                           <option value="Rajasthan">Rajasthan</option>
                         </select>
                       </div>
                       <ChevronDown size={16} className="text-slate-400" />
                     </div>

                     <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-1 pr-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 shadow-sm">
                       <div className="bg-blue-50 p-1.5 rounded-lg text-blue-500"><Building size={18} /></div>
                       <div className="flex-1">
                         <label className="text-[10px] font-bold text-slate-500">District <span className="text-red-500">*</span></label>
                         <select value={formData.district} onChange={e => setFormData({...formData, district: e.target.value})} className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none appearance-none">
                           <option value="Jaipur">Jaipur</option>
                         </select>
                       </div>
                       <ChevronDown size={16} className="text-slate-400" />
                     </div>

                     <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-1 pr-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 shadow-sm">
                       <div className="bg-blue-50 p-1.5 rounded-lg text-blue-500"><Building2 size={18} /></div>
                       <div className="flex-1">
                         <label className="text-[10px] font-bold text-slate-500">City <span className="text-red-500">*</span></label>
                         <select value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none appearance-none">
                           <option value="Jaipur">Jaipur</option>
                         </select>
                       </div>
                       <ChevronDown size={16} className="text-slate-400" />
                     </div>

                     <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-1 pr-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 shadow-sm">
                       <div className="bg-blue-50 p-1.5 rounded-lg text-blue-500"><MapPin size={18} /></div>
                       <div className="flex-1">
                         <label className="text-[10px] font-bold text-slate-500">Area / Locality <span className="text-red-500">*</span></label>
                         <select value={formData.area} onChange={e => setFormData({...formData, area: e.target.value})} className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none appearance-none">
                           <option value="Mansarovar">Mansarovar</option>
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
                <>
                  {/* Desktop Layout (Hidden on Mobile) */}
                  <div className="hidden md:flex flex-col gap-3 text-sm text-slate-700 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">Review Your Complaint</h2>
                        <p className="text-[10px] text-slate-500 mt-0.5">Please check the information below.</p>
                      </div>
                      <button type="button" onClick={() => setStep(1)} className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold hover:bg-blue-100 transition-colors border border-blue-100">
                        <Edit3 size={12} /> Edit
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                       <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                         <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-1.5 text-xs"><FileText size={14} className="text-blue-500"/> Complaint Details</h3>
                         <div className="grid grid-cols-2 gap-y-2 gap-x-2 text-[10px]">
                           <div><span className="text-slate-500 block mb-0.5">Department</span><span className="font-semibold">{formData.department || "-"}</span></div>
                           <div><span className="text-slate-500 block mb-0.5">Category</span><span className="font-semibold">{formData.category || "-"}</span></div>
                           <div className="col-span-2"><span className="text-slate-500 block mb-0.5">Priority</span><span className="inline-flex items-center px-1.5 py-0.5 rounded font-bold bg-red-50 text-red-500">{formData.priority}</span></div>
                         </div>
                         <div className="mt-2 text-[10px]">
                           <span className="text-slate-500 block mb-0.5">Title</span><span className="font-semibold truncate block">{formData.title || "-"}</span>
                         </div>
                         <div className="mt-2 text-[10px]">
                           <span className="text-slate-500 block mb-0.5">Description</span><span className="font-semibold line-clamp-2">{formData.description || "-"}</span>
                         </div>
                       </div>
                       
                       <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col">
                         <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-1.5 text-xs"><MapPin size={14} className="text-blue-500"/> Location</h3>
                         <div className="grid grid-cols-2 gap-y-2 gap-x-2 text-[10px]">
                           <div><span className="text-slate-500 block mb-0.5">Country</span><span className="font-semibold">{formData.country || "-"}</span></div>
                           <div><span className="text-slate-500 block mb-0.5">State</span><span className="font-semibold">{formData.state || "-"}</span></div>
                           <div><span className="text-slate-500 block mb-0.5">District</span><span className="font-semibold">{formData.district || "-"}</span></div>
                           <div><span className="text-slate-500 block mb-0.5">City</span><span className="font-semibold">{formData.city || "-"}</span></div>
                           <div className="col-span-2"><span className="text-slate-500 block mb-0.5">Area / Locality</span><span className="font-semibold">{formData.area || "-"}</span></div>
                           {formData.additionalDetails && (
                             <div className="col-span-2"><span className="text-slate-500 block mb-0.5">Landmark</span><span className="font-semibold truncate block">{formData.additionalDetails}</span></div>
                           )}
                         </div>
                       </div>
                    </div>

                    <div className="flex gap-3">
                       {files.length > 0 && (
                         <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex-1">
                           <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-1.5 text-xs"><Paperclip size={14} className="text-blue-500"/> Attachments</h3>
                           <div className="flex items-center gap-2 overflow-x-auto pb-1">
                             {files.map((f, i) => (
                                <div key={i} className="flex items-center gap-1.5 text-[10px] font-medium text-slate-700 bg-white p-1.5 rounded-lg border border-slate-100 shrink-0">
                                  {f.type.startsWith('image/') ? <img src={URL.createObjectURL(f)} className="w-5 h-5 object-cover rounded" alt=""/> : <FileText size={12} className="text-blue-500"/>} 
                                  <span className="max-w-[80px] truncate">{f.name}</span>
                                </div>
                             ))}
                           </div>
                         </div>
                       )}
                       
                       <div className="flex items-center gap-2 bg-blue-50/50 p-3 rounded-xl border border-blue-100 flex-1">
                          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                            <ShieldCheck size={12} />
                          </div>
                          <p className="text-[10px] text-slate-600 font-medium leading-tight">
                            By submitting, you confirm that the information provided is true to the best of your knowledge.
                          </p>
                       </div>
                    </div>
                  </div>
                  
                  {/* Mobile Layout (Hidden on Desktop) */}
                  <div className="md:hidden flex flex-col gap-4 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Review Your Complaint</h2>
                      <p className="text-xs text-slate-500 mt-1">Please check the information below. You can go back and edit if needed.</p>
                    </div>
                    <button type="button" onClick={() => setStep(1)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-100">
                      <Edit3 size={12} /> Edit
                    </button>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col p-4">
                    {/* Items */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center shrink-0"><FileText size={16} /></div>
                        <div className="grid grid-cols-[100px_1fr] gap-2 w-full pt-1.5">
                          <span className="text-xs text-slate-500 font-medium">Department</span>
                          <span className="text-xs text-slate-900 font-semibold">{formData.department || "-"}</span>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center shrink-0"><LayoutGrid size={16} /></div>
                        <div className="grid grid-cols-[100px_1fr] gap-2 w-full pt-1.5">
                          <span className="text-xs text-slate-500 font-medium">Category</span>
                          <span className="text-xs text-slate-900 font-semibold">{formData.category || "-"}</span>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center shrink-0"><AlertCircle size={16} /></div>
                        <div className="grid grid-cols-[100px_1fr] gap-2 w-full pt-1">
                          <span className="text-xs text-slate-500 font-medium pt-0.5">Priority</span>
                          <div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-500">{formData.priority}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center shrink-0"><FileText size={16} /></div>
                        <div className="grid grid-cols-[100px_1fr] gap-2 w-full pt-1.5">
                          <span className="text-xs text-slate-500 font-medium">Title</span>
                          <span className="text-xs text-slate-900 font-semibold">{formData.title || "-"}</span>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center shrink-0"><FileText size={16} /></div>
                        <div className="grid grid-cols-[100px_1fr] gap-2 w-full pt-1.5">
                          <span className="text-xs text-slate-500 font-medium">Description</span>
                          <span className="text-xs text-slate-900 font-medium leading-relaxed">{formData.description || "-"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="h-px bg-slate-100 my-4"></div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center shrink-0"><MapPin size={16} /></div>
                        <div className="grid grid-cols-[100px_1fr] gap-2 w-full pt-1.5">
                          <span className="text-xs text-slate-500 font-medium">Location</span>
                          <span className="text-xs text-slate-900 font-medium">{[formData.country, formData.state, formData.district, formData.city, formData.area].filter(Boolean).join(" > ")}</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center shrink-0"><Building size={16} /></div>
                        <div className="grid grid-cols-[100px_1fr] gap-2 w-full pt-1.5">
                          <span className="text-xs text-slate-500 font-medium">Additional Details</span>
                          <span className="text-xs text-slate-900 font-medium">{formData.additionalDetails || "-"}</span>
                        </div>
                      </div>
                    </div>

                    {files.length > 0 && (
                      <>
                        <div className="h-px bg-slate-100 my-4"></div>
                        <div className="flex items-start gap-4">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center shrink-0"><Paperclip size={16} /></div>
                          <div className="grid grid-cols-[100px_1fr] gap-2 w-full pt-1.5">
                            <span className="text-xs text-slate-500 font-medium">Attachments ({files.length})</span>
                            <div className="flex items-center gap-3 overflow-x-auto pb-2">
                              {files.map((f, i) => (
                                <div key={i} className="flex flex-col gap-1 w-20 shrink-0">
                                  {f.type.startsWith('image/') ? (
                                    <img src={URL.createObjectURL(f)} className="w-20 h-14 object-cover rounded-lg border border-slate-200" alt={f.name} />
                                  ) : (
                                    <div className="w-20 h-14 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 border border-slate-200"><FileText size={20}/></div>
                                  )}
                                  <span className="text-[9px] font-semibold text-slate-700 truncate">{f.name}</span>
                                  <span className="text-[8px] text-slate-400">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-3 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                      <ShieldCheck size={16} />
                    </div>
                    <p className="text-xs text-slate-600 font-medium">
                      By submitting, you confirm that the information provided is true to the best of your knowledge.
                    </p>
                  </div>
                </div>
                </>
              )}
{error && <div className="text-red-500 text-xs font-bold text-center mt-2">{error}</div>}

              <div className="flex items-center gap-3 mt-1">
                {step > 1 && (
                  <button type="button" onClick={handlePrev} className="flex-[0.8] bg-slate-50 text-blue-600 font-bold py-2.5 rounded-xl flex items-center justify-center transition-all text-sm border border-slate-200 hover:bg-slate-100">
                    <ArrowLeft size={16} className="mr-2" /> Back
                  </button>
                )}
                {step < 3 ? (
                  <button type="button" onClick={handleNext} className="flex-[1.2] bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center transition-all shadow-lg shadow-blue-500/25 text-sm">
                    Next <ArrowRight size={16} className="ml-2" />
                  </button>
                ) : (
                  <button type="submit" disabled={loading} className="flex-[1.2] bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center transition-all shadow-lg shadow-blue-500/25 text-sm disabled:opacity-50">
                    {loading ? "Submitting..." : (
                      <>
                        <Send size={16} className="mr-2" /> Submit Complaint
                      </>
                    )}
                  </button>
                )}
              </div>
</form>
          ) : (
            <div className="flex flex-col items-center w-full animate-in fade-in py-4 lg:py-6">
              {/* Confetti & Check */}
              <div className="relative w-full flex justify-center mb-4 mt-2">
                <div className="absolute top-0 -ml-12 w-2 h-3 bg-amber-400 rounded-full rotate-45 opacity-80"></div>
                <div className="absolute top-2 ml-16 w-2 h-2 bg-blue-500 rounded-full opacity-80"></div>
                <div className="absolute top-8 -ml-16 w-2 h-2 bg-emerald-400 rounded-full opacity-80"></div>
                
                <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-xl shadow-emerald-500/30 z-10 relative border-4 border-white">
                  <Check size={32} className="text-white" strokeWidth={4} />
                </div>
                
                <button onClick={() => router.push("/dashboard")} className="absolute -top-4 right-0 md:hidden bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5">
                  <Home size={12} /> Go to Home
                </button>
              </div>

              <div className="text-center mb-4">
                <h2 className="text-xl md:text-2xl font-black text-slate-900 leading-tight mb-1">
                  Complaint Submitted Successfully!
                </h2>
                <p className="text-xs text-slate-500 px-4">
                  Your complaint has been registered. We'll keep you updated.
                </p>
              </div>

              <div className="bg-[#f0f4f8] w-full max-w-sm p-4 rounded-2xl flex items-center justify-between mb-5 border border-slate-100">
                <div className="flex flex-col items-start">
                  <p className="text-[10px] font-medium text-slate-500 mb-0.5">Complaint ID</p>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">{complaintId || "CMP-10231"}</h3>
                    <button className="text-blue-600 hover:bg-blue-100 p-1 rounded transition-colors bg-blue-50">
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 font-medium text-right max-w-[80px]">
                  {new Date().toLocaleString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true})}
                </p>
              </div>

              <div className="w-full text-left mb-5">
                <h3 className="text-sm font-extrabold text-slate-900 mb-3">What's Next?</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                   {/* Step 1 */}
                   <div className="flex flex-col gap-1.5 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                     <div className="flex items-center justify-between">
                       <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><Send size={12} /></div>
                       <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Completed</span>
                     </div>
                     <div>
                       <h4 className="text-xs font-bold text-slate-900">Assigned to Department</h4>
                       <p className="text-[10px] text-slate-500 mt-0.5">Forwarded to the {formData.department || "Electricity"} Department.</p>
                     </div>
                   </div>
                   
                   {/* Step 2 */}
                   <div className="flex flex-col gap-1.5 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                     <div className="flex items-center justify-between">
                       <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0"><Clock size={12} /></div>
                       <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">In Progress</span>
                     </div>
                     <div>
                       <h4 className="text-xs font-bold text-slate-900">Assigned to Agent</h4>
                       <p className="text-[10px] text-slate-500 mt-0.5">A field agent will be assigned shortly.</p>
                     </div>
                   </div>

                   {/* Step 3 */}
                   <div className="flex flex-col gap-1.5 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                     <div className="flex items-center justify-between">
                       <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"><BellRing size={12} /></div>
                       <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">Pending</span>
                     </div>
                     <div>
                       <h4 className="text-xs font-bold text-slate-900">Updates via Notifications</h4>
                       <p className="text-[10px] text-slate-500 mt-0.5">You'll receive updates in the app.</p>
                     </div>
                   </div>

                   {/* Step 4 */}
                   <div className="flex flex-col gap-1.5 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                     <div className="flex items-center justify-between">
                       <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"><CheckCircle2 size={12} /></div>
                       <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">Pending</span>
                     </div>
                     <div>
                       <h4 className="text-xs font-bold text-slate-900">Resolution</h4>
                       <p className="text-[10px] text-slate-500 mt-0.5">We'll notify you once resolved.</p>
                     </div>
                   </div>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-blue-50/50 p-3 rounded-xl border border-blue-100 w-full mb-5">
                <div className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Info size={10} />
                </div>
                <p className="text-[10px] text-slate-600 font-medium">
                  Track the status and view updates from the My Complaints section.
                </p>
              </div>

              <div className="flex w-full flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="w-full sm:flex-1 bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 font-bold py-2.5 rounded-xl flex items-center justify-center transition-all text-sm"
                >
                  View My Complaints
                </button>
                <button
                  onClick={() => {
                    setStep(1);
                    setFormData({...formData, title: "", description: ""});
                    setFiles([]);
                  }}
                  className="w-full sm:flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center transition-all shadow-lg shadow-blue-500/25 text-sm"
                >
                  Submit Another Complaint
                </button>
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
