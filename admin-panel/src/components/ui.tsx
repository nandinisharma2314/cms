"use client";

import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { ComplaintStatus, PriorityRef } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { STATUS_BADGE, TONE_BADGE } from "@/lib/status";

/** Input styling without a width, for fields sized by the caller. */
export const fieldClass =
  "h-9 px-3 text-xs border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400";

export const inputClass =
  "w-full h-9 px-3 text-xs border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400";

export const textareaClass =
  "w-full p-2.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";

export const primaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50";

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50";

export const dangerButtonClass =
  "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40";

export const iconButtonClass =
  "p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50";

export function tabClass(active: boolean) {
  return `px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer whitespace-nowrap ${
    active ? "bg-blue-600 border-blue-600 text-white shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
  }`;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="text-xs text-slate-500 font-medium mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] ${className}`}>
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
      <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
      <span>{message}</span>
    </div>
  );
}

export function Notice({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2"
    >
      <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
      <span>{message}</span>
    </div>
  );
}

/**
 * A confirmation in the corner of the screen that goes away after the configured
 * time. Rendered into <body> so no filtered or transformed ancestor can misplace it.
 */
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const { ui } = useConfig();
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current(), ui.toast_seconds * 1000);
    return () => clearTimeout(timer);
  }, [message, ui.toast_seconds]);
  return createPortal(
    <div className="fixed bottom-6 right-6 left-6 sm:left-auto z-50 sm:max-w-sm shadow-2xl">
      <Notice message={message} />
    </div>,
    document.body,
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="block text-slate-600 mb-1 font-medium">{label}</span>
      {children}
      {error
        ? <span className="block text-[11px] text-red-500 mt-1 font-semibold">{error}</span>
        : hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
        active ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-100 text-slate-500 border-slate-200"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function PriorityBadge({
  priority,
  className = "",
}: {
  priority: Pick<PriorityRef, "name" | "tone">;
  className?: string;
}) {
  return (
    <span
      className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-md whitespace-nowrap ${TONE_BADGE[priority.tone]} ${className}`}
    >
      {priority.name}
    </span>
  );
}

export function StatusBadge({ status, label }: { status: ComplaintStatus; label: string }) {
  return (
    <span className={`inline-block px-2.5 py-1 text-[11px] font-semibold rounded-md whitespace-nowrap ${STATUS_BADGE[status]}`}>
      {label}
    </span>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400" role="status">
      <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      {label}
    </div>
  );
}

/** Previous / next with "page x of y (n items)". Hidden when everything fits on one page. */
export function Pagination({
  page,
  pageSize,
  total,
  noun,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize && page === 1) return null;
  return (
    <nav className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500" aria-label="Pagination">
      <span>
        Page {page} of {pages} ({total.toLocaleString()} {noun})
      </span>
      <button className={secondaryButtonClass} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <button className={secondaryButtonClass} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog with focus management: focus moves into it (the first field, or the
 * dialog itself), Tab stays inside, Escape closes it, and focus returns to
 * what was focused before.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), select, textarea");
    (first ?? dialog)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const [head, tail] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  // Rendered into <body>: an ancestor with a filter or transform (e.g. the blurred header) would
  // otherwise become the box that "fixed" positions against, and the dialog would be cut off.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`relative w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} max-h-[92vh] overflow-y-auto bg-white rounded-2xl p-5 sm:p-6 shadow-2xl border border-slate-100 focus:outline-none`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 ${iconButtonClass} hover:text-slate-600 hover:bg-slate-100`}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
        <h2 id={titleId} className="text-sm font-bold text-slate-900 pr-8">
          {title}
        </h2>
        {description && <p className="text-xs text-slate-500 mt-1 pr-8">{description}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** A table row spanning all columns, for loading / empty states. */
export function TableMessage({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-8 text-center text-xs text-slate-400">
        {children}
      </td>
    </tr>
  );
}
