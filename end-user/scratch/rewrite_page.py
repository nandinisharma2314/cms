import re

with open('app/dashboard/register/page.tsx', 'r') as f:
    original = f.read()

# I will write a completely new file based on the pieces from the original

new_content = """"use client";

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
  Users
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
  {
    id: "Low_Red",
    val: "Low",
    icon: AlertCircle,
    color: "text-red-500",
    bg: "bg-red-50 hover:bg-red-100",
    text: "Low",
    checked: false,
  },
  {
    id: "Low",
    val: "Low",
    icon: CheckCircle2,
    color: "text-emerald-500",
    bg: "bg-emerald-50 border border-emerald-200",
    text: "Low",
    checked: true,
  },
  {
    id: "Medium",
    val: "Medium",
    icon: AlertCircle,
    color: "text-amber-500",
    bg: "bg-amber-50 hover:bg-amber-100",
    text: "Medium",
    checked: false,
  },
  {
    id: "High",
    val: "High",
    icon: AlertCircle,
    color: "text-red-500",
    bg: "bg-red-50 hover:bg-red-100",
    text: "High",
    checked: false,
  },
  {
    id: "Critical",
    val: "Critical",
    icon: AlertCircle,
    color: "text-red-600",
    bg: "bg-red-50 hover:bg-red-100",
    text: "Critical",
    checked: false,
  },
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        setIsSubmitted(true);
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
    <div className="min-h-[calc(100vh-80px)] bg-[#f8faff] flex flex-col font-sans relative pt-6 md:pb-6">
      <div
        className={`flex-1 max-w-[1400px] w-full mx-auto md:p-6 grid ${
          isSubmitted ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[1fr_1.4fr]"
        } gap-8 xl:gap-12 px-4 relative z-10`}
      >
        {/* Left Column */}
        <div className={`${isSubmitted ? "hidden" : "hidden lg:flex"} flex-col h-full sticky top-6 self-start`}>
          {/* Breadcrumb */}
          <div className="inline-flex items-center gap-2 bg-indigo-50/80 rounded-full px-4 py-1.5 text-indigo-700 text-xs font-semibold w-fit mb-8">
            <Home size={14} />
            <span>Home</span>
            <span className="text-indigo-300">/</span>
            <span>Register Complaint</span>
          </div>

          <h1 className="text-4xl md:text-[2.75rem] font-extrabold text-slate-900 mb-4 tracking-tight leading-tight">
            Register a <span className="text-indigo-600">Complaint</span>
          </h1>
          <p className="text-base text-slate-500 font-medium mb-8">
            Let us know the issue. We'll get it resolved.
          </p>

          <div className="flex items-center gap-6 mb-10">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-indigo-600 rounded-full text-white flex items-center justify-center">
                <CheckCircle2 size={12} />
              </div>
              <span className="text-sm font-semibold text-slate-700">Fast Response</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-indigo-600 rounded-full text-white flex items-center justify-center">
                <CheckCircle2 size={12} />
              </div>
              <span className="text-sm font-semibold text-slate-700">Track in Real-time</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-indigo-600 rounded-full text-white flex items-center justify-center">
                <CheckCircle2 size={12} />
              </div>
              <span className="text-sm font-semibold text-slate-700">Better Community</span>
            </div>
          </div>

          {/* Illustration */}
          <div className="flex-1 flex items-center justify-center w-full relative mb-12">
            <img
              src="/brain/3087247c-2c79-4bca-8a9e-6669a52bbdd6/civic_illustration_redesign_1790187293731.jpg"
              alt="Civic Illustration"
              className="w-[85%] object-contain"
              style={{ maxHeight: "320px", mixBlendMode: "multiply" }}
            />
          </div>

          {/* Bottom Info Cards */}
          <div className="grid grid-cols-3 gap-4 mt-auto pb-4">
            <div className="bg-white rounded-3xl p-5 flex flex-col items-center justify-center text-center shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-50">
              <div className="w-10 h-10 bg-indigo-50 rounded-full text-indigo-600 flex items-center justify-center mb-3">
                <Home size={18} />
              </div>
              <p className="text-sm font-bold text-slate-900 mb-1">Report Issues</p>
              <p className="text-[11px] text-slate-400 font-medium">Easy & Quick</p>
            </div>
            <div className="bg-white rounded-3xl p-5 flex flex-col items-center justify-center text-center shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-50">
              <div className="w-10 h-10 bg-indigo-50 rounded-full text-indigo-600 flex items-center justify-center mb-3">
                <Clock size={18} />
              </div>
              <p className="text-sm font-bold text-slate-900 mb-1">Track Progress</p>
              <p className="text-[11px] text-slate-400 font-medium">Real-time Updates</p>
            </div>
            <div className="bg-white rounded-3xl p-5 flex flex-col items-center justify-center text-center shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-50">
              <div className="w-10 h-10 bg-indigo-50 rounded-full text-indigo-600 flex items-center justify-center mb-3">
                <Users size={18} />
              </div>
              <p className="text-sm font-bold text-slate-900 mb-1">Better Community</p>
              <p className="text-[11px] text-slate-400 font-medium">Together We Build</p>
            </div>
          </div>
        </div>

        {/* Right Column (Form Card) */}
        <div
          className={`bg-white rounded-[2rem] shadow-[0_8px_30px_-4px_rgba(0,0,0,0.05)] border border-slate-100 p-8 lg:p-10 flex flex-col relative h-fit ${
            isSubmitted ? "max-w-md mx-auto w-full mt-10" : ""
          }`}
        >
          {!isSubmitted ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-8 w-full animate-in fade-in">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Complaint Details</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Please provide the details of your issue.
                </p>
              </div>

              {/* Department */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-900">
                    Department <span className="text-red-500">*</span>
                  </label>
                  <button type="button" className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:text-indigo-700">
                    <LayoutGrid size={14} /> View Departments
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none">
                    <Landmark size={18} />
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
                    className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 appearance-none text-slate-700"
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
                </div>
              </div>

              {/* Category */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-900">
                  Category <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none">
                    <LayoutGrid size={18} />
                  </div>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    disabled={!formData.department}
                    className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 appearance-none text-slate-700 disabled:opacity-50 disabled:bg-slate-50"
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
                </div>
              </div>

              {/* Priority */}
              <div className="flex flex-col gap-3">
                <label className="text-sm font-bold text-slate-900">
                  Priority <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-3 flex-wrap">
                  {PRIORITIES.map((p) => {
                    const isSelected = formData.priority === p.val;
                    const isThisSelected = isSelected && (p.id === "Low" ? p.text === "Low" : true);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, priority: p.val })
                        }
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                          isThisSelected && p.id === "Low"
                            ? p.bg
                            : p.bg + " opacity-80"
                        } ${p.color}`}
                      >
                        <p.icon size={14} />
                        {p.text}
                        {p.id === "Low" && p.checked && (
                           <Check size={14} className="ml-1 opacity-70" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-900">
                  Title <span className="text-red-500">*</span>
                </label>
                <div className="relative pb-5">
                  <div className="absolute left-4 top-3.5 text-indigo-500 pointer-events-none">
                    <FileText size={18} />
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
                    className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none placeholder-slate-400"
                  />
                  <span className="absolute bottom-0 right-4 text-[11px] font-semibold text-slate-400">
                    {formData.title.length}/100
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-900">
                  Description <span className="text-red-500">*</span>
                </label>
                <div className="relative pb-5">
                  <div className="absolute left-4 top-4 text-indigo-500 pointer-events-none">
                    <FileText size={18} />
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
                    className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none placeholder-slate-400 min-h-[100px] resize-none"
                  />
                  <span className="absolute bottom-0 right-4 text-[11px] font-semibold text-slate-400">
                    {formData.description.length}/500
                  </span>
                </div>
              </div>

              {/* Add Photos */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <UploadCloud size={16} className="text-indigo-600" /> Add Photos / Attachments
                  </label>
                  <span className="text-xs font-semibold text-slate-400">
                    Max 5 files (10 MB each)
                  </span>
                </div>

                <div
                  className={`w-full border-2 border-dashed rounded-3xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors
                  ${
                    isDragging
                      ? "border-indigo-400 bg-indigo-50/50"
                      : "border-indigo-200/60 bg-white hover:bg-slate-50/50"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloud size={32} className="text-indigo-600 mb-2" />
                  <p className="text-sm font-bold text-slate-800 mb-1">
                    Tap to upload photos
                  </p>
                  <p className="text-xs font-semibold text-slate-400">
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
                  <div className="flex flex-col gap-2 mt-3">
                    {files.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          {file.type.startsWith("image/") ? (
                            <img
                              src={URL.createObjectURL(file)}
                              alt="preview"
                              className="w-10 h-10 object-cover rounded-lg border border-slate-100"
                            />
                          ) : file.type.includes("pdf") || file.name.endsWith(".pdf") ? (
                            <div className="w-10 h-10 bg-red-50 text-red-600 rounded-lg flex items-center justify-center shrink-0 font-bold text-[10px]">
                              PDF
                            </div>
                          ) : (
                            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                              <FileText size={18} />
                            </div>
                          )}
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-xs font-bold text-slate-700 truncate">
                              {file.name}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {(file.size / 1024).toFixed(1)} KB
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                          className="text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="w-full h-px bg-slate-100 my-4" />

              <div>
                <h3 className="text-xl font-bold text-slate-900">Location Details</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Choose the location where the issue is occurring.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                   <label className="text-sm font-bold text-slate-900">Country / State</label>
                   <div className="flex gap-4">
                     <select disabled className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-700 opacity-70">
                       <option>India</option>
                     </select>
                     <select disabled className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-700 opacity-70">
                       <option>Rajasthan</option>
                     </select>
                   </div>
                </div>

                <div className="flex flex-col gap-2">
                   <label className="text-sm font-bold text-slate-900">City / District</label>
                   <div className="flex gap-4">
                     <select disabled className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-700 opacity-70">
                       <option>Jaipur</option>
                     </select>
                     <select disabled className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-700 opacity-70">
                       <option>Jaipur</option>
                     </select>
                   </div>
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-slate-900">Area / Locality <span className="text-red-500">*</span></label>
                  <select
                    value={formData.area}
                    onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                    className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none text-slate-700"
                  >
                    <option>Mansarovar</option>
                    <option>Vaishali Nagar</option>
                    <option>Malviya Nagar</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <label className="text-sm font-bold text-slate-900">Additional Details</label>
                  <textarea
                    value={formData.additionalDetails}
                    onChange={(e) => setFormData({ ...formData, additionalDetails: e.target.value.slice(0, 200) })}
                    placeholder="E.g. Near Mansarovar Metro Station..."
                    className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none placeholder-slate-400 min-h-[80px] resize-none"
                  />
                </div>
              </div>

              <div className="flex items-start gap-3 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 mt-4">
                <ShieldCheck size={20} className="text-indigo-600 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-700 font-medium leading-relaxed">
                  By submitting, you confirm that the information provided is true to the best of your knowledge.
                </p>
              </div>

              {error && <div className="text-red-500 text-sm font-bold text-center mt-2">{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/25 text-base disabled:opacity-50"
              >
                {loading ? "Submitting..." : "Submit Complaint"} <ArrowRight size={18} />
              </button>
            </form>
          ) : (
            <div className="flex flex-col items-center gap-6 w-full animate-in fade-in py-10">
              <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center shadow-xl shadow-emerald-500/30">
                <Check size={48} className="text-white" strokeWidth={3} />
              </div>

              <div className="text-center">
                <h2 className="text-3xl font-black text-slate-900 leading-tight">
                  Complaint Submitted
                  <br />
                  Successfully!
                </h2>
                <p className="text-base text-slate-500 mt-3 px-4">
                  We'll keep you updated on the progress.
                </p>
              </div>

              <div className="bg-indigo-50 w-full p-6 rounded-3xl flex flex-col items-center justify-center border border-indigo-100 mt-2">
                <p className="text-sm font-semibold text-slate-500">Complaint ID</p>
                <div className="flex items-center gap-3 mt-2">
                  <h3 className="text-2xl font-black text-indigo-900">{complaintId || "CMP-12345"}</h3>
                  <button className="text-indigo-600 hover:bg-indigo-100 p-2 rounded-full transition-colors">
                    <Copy size={18} />
                  </button>
                </div>
              </div>

              <div className="flex w-full items-center gap-4 mt-8">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="flex-[1] bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold py-3.5 rounded-2xl flex items-center justify-center transition-all text-sm"
                >
                  Home
                </button>
                <button
                  onClick={() => setIsSubmitted(false)}
                  className="flex-[1.2] bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center transition-all shadow-lg shadow-blue-500/25 text-sm"
                >
                  Submit Another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Footer */}
      <footer className="w-full max-w-[1400px] mx-auto px-8 py-6 flex items-center justify-between text-xs font-semibold text-slate-400 mt-auto">
        <span>© 2025 CivicConnect. All rights reserved.</span>
        <span>— Your Voice Makes a Better Tomorrow —</span>
      </footer>
    </div>
  );
}
"""

with open('app/dashboard/register/page.tsx', 'w') as f:
    f.write(new_content)

print("Rewrite complete!")
