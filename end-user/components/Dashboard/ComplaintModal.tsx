"use client";

import React, { useEffect, useState } from"react";
import {
 X,
 Calendar,
 MapPin,
 Paperclip,
 Image as ImageIcon,
 FileText,
 Video,
 Building2,
 ExternalLink,
 Download,
 Eye,
 Table,
 FileCheck,
} from"lucide-react";
import { getPriorityStyles, getStatusStyles } from"@/lib/utils";

interface ComplaintModalProps {
 complaint: any;
 onClose: () => void;
}

export default function ComplaintModal({
 complaint,
 onClose,
}: ComplaintModalProps) {
 // Modal state for viewing enlarged attachment
 const [activePreview, setActivePreview] = useState<{
 url: string;
 name: string;
 type:"image" |"pdf" |"csv" |"video" |"other";
 } | null>(null);

 // CSV parsing state for preview
 const [csvData, setCsvData] = useState<{
 headers: string[];
 rows: string[][];
 } | null>(null);
 const [loadingCsv, setLoadingCsv] = useState(false);

 // Close on Escape key
 useEffect(() => {
 const handleEsc = (e: KeyboardEvent) => {
 if (e.key ==="Escape") {
 if (activePreview) {
 setActivePreview(null);
 } else {
 onClose();
 }
 }
 };
 window.addEventListener("keydown", handleEsc);
 return () => window.removeEventListener("keydown", handleEsc);
 }, [onClose, activePreview]);

 // Prevent background scrolling
 useEffect(() => {
 document.body.style.overflow ="hidden";
 return () => {
 document.body.style.overflow ="unset";
 };
 }, []);

 if (!complaint) return null;

 const backendUrl =
 process.env.NEXT_PUBLIC_BACKEND_URL ||"http://localhost:5000";

 const getFileUrl = (path: string) => {
 if (!path) return"";
 if (path.startsWith("http://") || path.startsWith("https://")) return path;
 return `${backendUrl}${path.startsWith("/") ?"" :"/"}${path}`;
 };

 const getFileKind = (
 file: any
 ):"image" |"pdf" |"csv" |"video" |"other" => {
 const type = (file.file_type ||"").toLowerCase();
 const name = (file.file_name || file.file_path ||"").toLowerCase();

 if (
 type.startsWith("image/") ||
 /\.(jpg|jpeg|png|webp|gif|svg|bmp)$/i.test(name)
 ) {
 return"image";
 }
 if (type.includes("pdf") || name.endsWith(".pdf")) {
 return"pdf";
 }
 if (type.includes("csv") || name.endsWith(".csv")) {
 return"csv";
 }
 if (
 type.startsWith("video/") ||
 /\.(mp4|webm|ogg|mov)$/i.test(name)
 ) {
 return"video";
 }
 return"other";
 };

 const handleOpenPreview = async (file: any) => {
 const kind = getFileKind(file);
 const url = getFileUrl(file.file_path);
 const name = file.file_name ||"Attachment";

 setActivePreview({ url, name, type: kind });

 if (kind ==="csv") {
 setLoadingCsv(true);
 setCsvData(null);
 try {
 const res = await fetch(url);
 const text = await res.text();
 const lines = text
 .split("\n")
 .map((l) => l.trim())
 .filter(Boolean);
 if (lines.length > 0) {
 const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g,""));
 const rows = lines
 .slice(1, 25)
 .map((line) => line.split(",").map((c) => c.replace(/^"|"$/g,"")));
 setCsvData({ headers, rows });
 }
 } catch (err) {
 console.error("Failed to parse CSV", err);
 } finally {
 setLoadingCsv(false);
 }
 }
 };

 const complaintId =
 complaint.generated_id || complaint.cmpId || complaint.id ||"N/A";
 const complaintLocation =
 complaint.location ||
 (complaint.area
 ? `${complaint.area}${complaint.city ? `, ${complaint.city}` :""}`
 :"Jaipur, Rajasthan");
 const complaintDate = complaint.created_at
 ? new Date(complaint.created_at).toLocaleDateString()
 : complaint.date ||"N/A";

 return (
 <>
 <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-12">
 {/* Backdrop */}
 <div
 className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
 onClick={onClose}
 />

 {/* Modal Container */}
 <div className="relative w-full max-w-3xl max-h-[90vh] bg-white shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 border border-slate-100">
 {/* Close Button */}
 <button
 onClick={onClose}
 className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-white/90 backdrop-blur text-slate-500 hover:text-slate-800 hover:bg-slate-100 shadow-sm border border-slate-200 transition-all cursor-pointer"
 aria-label="Close modal"
 >
 <X className="w-5 h-5" />
 </button>

 {/* Scrollable Content */}
 <div className="overflow-y-auto">
 {/* Header Section */}
 <div className="p-6 md:p-8 border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-blue-50/20">
 <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
 <div className="flex items-center gap-2">
 <span className="px-3 py-1 bg-slate-800 text-white text-xs font-mono font-bold tracking-wider">
 {complaintId}
 </span>
 <span
 className={`px-3 py-1 text-xs font-bold uppercase tracking-wider ${getStatusStyles(
 complaint.status
 )}`}
 >
 {complaint.status ||"Submitted"}
 </span>
 </div>
 <span
 className={`px-3 py-1 text-xs font-bold uppercase tracking-wider shadow-xs ${getPriorityStyles(
 complaint.priority
 )}`}
 >
 {complaint.priority ||"Normal"} Priority
 </span>
 </div>

 {/* Explicit Title Block */}
 <div className="mb-4">
 <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
 <FileText className="w-3.5 h-3.5 text-blue-600" />
 <span>Complaint Title</span>
 </div>
 <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 leading-tight">
 {complaint.title ||"Untitled Complaint"}
 </h1>
 </div>

 {/* Meta details bar */}
 <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600 pt-2 border-t border-slate-100">
 <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 border border-slate-200 shadow-2xs">
 <Building2 className="w-3.5 h-3.5 text-blue-600" />
 <span className="font-semibold text-slate-800">
 {complaint.department ||"General"}
 </span>
 </div>
 {complaint.category && (
 <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 border border-slate-200 shadow-2xs">
 <span className="text-slate-400">Category:</span>
 <span className="font-semibold text-slate-800">
 {complaint.category}
 </span>
 </div>
 )}
 <div className="flex items-center gap-1.5">
 <MapPin className="w-3.5 h-3.5 text-slate-400" />
 <span>{complaintLocation}</span>
 </div>
 <div className="flex items-center gap-1.5">
 <Calendar className="w-3.5 h-3.5 text-slate-400" />
 <span>{complaintDate}</span>
 </div>
 </div>
 </div>

 {/* Description Section */}
 <div className="p-6 md:p-8 border-b border-slate-100">
 <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
 Description
 </h3>
 <div className="bg-slate-50/70 p-4 border border-slate-100">
 <p className="text-slate-700 leading-relaxed text-sm md:text-base whitespace-pre-wrap">
 {complaint.description ||
"No description provided for this complaint."}
 </p>
 </div>
 {complaint.additional_details && (
 <div className="mt-3">
 <span className="text-xs font-semibold text-slate-400">
 Landmark / Details:
 </span>
 <p className="text-xs text-slate-600 mt-0.5">
 {complaint.additional_details}
 </p>
 </div>
 )}
 </div>

 {/* Attachments Section with Previews */}
 <div className="p-6 md:p-8 bg-slate-50/40">
 <div className="flex items-center justify-between mb-4">
 <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
 <Paperclip className="w-4 h-4 text-blue-600" />
 Attached Documents & Photos (
 {(complaint.attachments || []).length})
 </h3>
 <span className="text-xs text-slate-400 font-medium">
 Click any attachment to preview
 </span>
 </div>

 {complaint.attachments && complaint.attachments.length > 0 ? (
 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
 {complaint.attachments.map((file: any, index: number) => {
 const kind = getFileKind(file);
 const fileUrl = getFileUrl(file.file_path);
 const fileName = file.file_name ||"Attachment";

 return (
 <div
 key={index}
 onClick={() => handleOpenPreview(file)}
 className="group relative bg-white border border-slate-200 overflow-hidden hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer flex flex-col"
 >
 {/* Thumbnail / Visual Area */}
 {kind ==="image" ? (
 <div className="relative w-full h-36 bg-slate-100 overflow-hidden flex items-center justify-center">
 <img
 src={fileUrl}
 alt={fileName}
 className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
 onError={(e) => {
 (e.target as HTMLElement).style.display =
"none";
 }}
 />
 <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
 <span className="px-2.5 py-1 bg-white/90 rounded-full text-xs font-bold text-slate-800 flex items-center gap-1 shadow-xs">
 <Eye className="w-3.5 h-3.5" /> View Photo
 </span>
 </div>
 </div>
 ) : kind ==="pdf" ? (
 <div className="w-full h-36 bg-red-50/60 flex flex-col items-center justify-center gap-2 border-b border-red-100">
 <div className="w-12 h-12 bg-red-100 text-red-600 flex items-center justify-center shadow-xs">
 <FileText className="w-6 h-6" />
 </div>
 <span className="px-2 py-0.5 bg-red-200/60 text-red-700 text-[10px] font-bold uppercase tracking-wider">
 PDF Document
 </span>
 </div>
 ) : kind ==="csv" ? (
 <div className="w-full h-36 bg-emerald-50/60 flex flex-col items-center justify-center gap-2 border-b border-emerald-100">
 <div className="w-12 h-12 bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-xs">
 <Table className="w-6 h-6" />
 </div>
 <span className="px-2 py-0.5 bg-emerald-200/60 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
 CSV Spreadsheet
 </span>
 </div>
 ) : kind ==="video" ? (
 <div className="w-full h-36 bg-purple-50/60 flex flex-col items-center justify-center gap-2 border-b border-purple-100">
 <div className="w-12 h-12 bg-purple-100 text-purple-600 flex items-center justify-center shadow-xs">
 <Video className="w-6 h-6" />
 </div>
 <span className="px-2 py-0.5 bg-purple-200/60 text-purple-700 text-[10px] font-bold uppercase tracking-wider">
 Video Recording
 </span>
 </div>
 ) : (
 <div className="w-full h-36 bg-slate-50 flex flex-col items-center justify-center gap-2 border-b border-slate-100">
 <div className="w-12 h-12 bg-slate-200 text-slate-600 flex items-center justify-center shadow-xs">
 <FileCheck className="w-6 h-6" />
 </div>
 <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider">
 Document
 </span>
 </div>
 )}

 {/* File Details Footer */}
 <div className="p-3 flex items-center justify-between gap-2 bg-white">
 <p
 className="text-xs font-semibold text-slate-700 truncate group-hover:text-blue-600 transition-colors"
 title={fileName}
 >
 {fileName}
 </p>
 <span className="text-slate-400 group-hover:text-blue-600 transition-colors">
 <Eye className="w-4 h-4 shrink-0" />
 </span>
 </div>
 </div>
 );
 })}
 </div>
 ) : (
 <div className="text-sm text-slate-400 italic bg-white p-6 border border-slate-200 border-dashed text-center">
 No files or documents attached to this complaint.
 </div>
 )}
 </div>
 </div>
 </div>
 </div>

 {/* ========================================================= */}
 {/* ATTACHMENT FULL PREVIEW LIGHTBOX MODAL */}
 {/* ========================================================= */}
 {activePreview && (
 <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
 <div className="relative w-full max-w-4xl max-h-[92vh] bg-white shadow-2xl flex flex-col overflow-hidden border border-slate-800/20">
 {/* Preview Header */}
 <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-4">
 <div className="flex items-center gap-2 min-w-0">
 {activePreview.type ==="image" && (
 <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" />
 )}
 {activePreview.type ==="pdf" && (
 <FileText className="w-4 h-4 text-red-400 shrink-0" />
 )}
 {activePreview.type ==="csv" && (
 <Table className="w-4 h-4 text-emerald-400 shrink-0" />
 )}
 {activePreview.type ==="video" && (
 <Video className="w-4 h-4 text-purple-400 shrink-0" />
 )}
 <h4 className="text-sm font-semibold truncate">
 {activePreview.name}
 </h4>
 </div>

 <div className="flex items-center gap-2 shrink-0">
 <a
 href={activePreview.url}
 target="_blank"
 rel="noopener noreferrer"
 className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
 >
 <ExternalLink className="w-3.5 h-3.5" /> Open / Download
 </a>
 <button
 onClick={() => setActivePreview(null)}
 className="w-8 h-8 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition"
 aria-label="Close preview"
 >
 <X className="w-4 h-4" />
 </button>
 </div>
 </div>

 {/* Preview Body */}
 <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-slate-100 min-h-[300px] max-h-[78vh]">
 {activePreview.type ==="image" && (
 <img
 src={activePreview.url}
 alt={activePreview.name}
 className="max-w-full max-h-[74vh] object-contain shadow-sm"
 />
 )}

 {activePreview.type ==="pdf" && (
 <iframe
 src={activePreview.url}
 title={activePreview.name}
 className="w-full h-[72vh] bg-white border border-slate-300"
 />
 )}

 {activePreview.type ==="csv" && (
 <div className="w-full h-[72vh] bg-white p-4 overflow-auto border border-slate-200">
 {loadingCsv ? (
 <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2">
 <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
 Loading spreadsheet data...
 </div>
 ) : csvData && csvData.headers.length > 0 ? (
 <table className="w-full text-left text-xs border-collapse">
 <thead>
 <tr className="bg-slate-100 sticky top-0 border-b border-slate-200">
 {csvData.headers.map((h, i) => (
 <th key={i} className="p-2 font-bold text-slate-700">
 {h}
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {csvData.rows.map((row, rIdx) => (
 <tr
 key={rIdx}
 className="border-b border-slate-100 hover:bg-slate-50"
 >
 {row.map((cell, cIdx) => (
 <td key={cIdx} className="p-2 text-slate-600">
 {cell}
 </td>
 ))}
 </tr>
 ))}
 </tbody>
 </table>
 ) : (
 <p className="text-center text-slate-400 py-10">
 Could not display preview table. Please use"Open /
 Download" above.
 </p>
 )}
 </div>
 )}

 {activePreview.type ==="video" && (
 <video
 src={activePreview.url}
 controls
 autoPlay
 className="max-w-full max-h-[72vh] shadow-sm"
 />
 )}

 {activePreview.type ==="other" && (
 <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
 <div className="w-16 h-16 bg-blue-100 text-blue-600 flex items-center justify-center">
 <FileText className="w-8 h-8" />
 </div>
 <div>
 <h5 className="font-bold text-slate-800 text-base">
 {activePreview.name}
 </h5>
 <p className="text-xs text-slate-500 mt-1">
 Direct browser preview is not supported for this document
 type.
 </p>
 </div>
 <a
 href={activePreview.url}
 download
 target="_blank"
 rel="noopener noreferrer"
 className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
 >
 <Download className="w-4 h-4" /> Download File
 </a>
 </div>
 )}
 </div>
 </div>
 </div>
 )}
 </>
 );
}
