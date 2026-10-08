"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  durationMs?: number;
}

const TOAST_EVENT = "cms-toast-notification";

export const toast = {
  success: (title: string, message?: string, durationMs = 4000) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(TOAST_EVENT, {
          detail: { id: Math.random().toString(36).substring(2, 9), type: "success", title, message, durationMs },
        }),
      );
    }
  },
  error: (title: string, message?: string, durationMs = 6000) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(TOAST_EVENT, {
          detail: { id: Math.random().toString(36).substring(2, 9), type: "error", title, message, durationMs },
        }),
      );
    }
  },
  info: (title: string, message?: string, durationMs = 4000) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(TOAST_EVENT, {
          detail: { id: Math.random().toString(36).substring(2, 9), type: "info", title, message, durationMs },
        }),
      );
    }
  },
  warning: (title: string, message?: string, durationMs = 5000) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(TOAST_EVENT, {
          detail: { id: Math.random().toString(36).substring(2, 9), type: "warning", title, message, durationMs },
        }),
      );
    }
  },
};

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />,
  error: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />,
  info: <Info className="w-5 h-5 text-blue-500 shrink-0" />,
};

const BORDERS: Record<ToastType, string> = {
  success: "border-emerald-200 bg-white/95 text-slate-800 shadow-emerald-500/5",
  error: "border-rose-200 bg-white/95 text-slate-800 shadow-rose-500/5",
  warning: "border-amber-200 bg-white/95 text-slate-800 shadow-amber-500/5",
  info: "border-blue-200 bg-white/95 text-slate-800 shadow-blue-500/5",
};

const PROGRESS_COLORS: Record<ToastType, string> = {
  success: "bg-emerald-500",
  error: "bg-rose-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const item = (e as CustomEvent<ToastItem>).detail;
      setToasts((prev) => [...prev, item]);

      const timer = setTimeout(() => {
        setToasts((current) => current.filter((t) => t.id !== item.id));
      }, item.durationMs || 4000);

      return () => clearTimeout(timer);
    };

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto relative flex items-start gap-3 p-3.5 rounded-2xl border shadow-xl backdrop-blur-md overflow-hidden animate-in slide-in-from-bottom-3 fade-in duration-200 transition-all ${BORDERS[t.type]}`}
        >
          {ICONS[t.type]}
          <div className="flex-1 min-w-0 pr-4">
            <h4 className="text-xs font-bold text-slate-900 leading-tight">{t.title}</h4>
            {t.message && <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{t.message}</p>}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div
            className={`absolute bottom-0 left-0 right-0 h-0.5 ${PROGRESS_COLORS[t.type]} animate-pulse`}
          />
        </div>
      ))}
    </div>
  );
}
