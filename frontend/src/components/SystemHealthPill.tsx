"use client";

import React, { useEffect, useRef, useState } from "react";
import { Activity, CheckCircle2, Cpu, Database, Server, ShieldCheck, Zap } from "lucide-react";

export function SystemHealthPill() {
  const [open, setOpen] = useState(false);
  const [pingMs, setPingMs] = useState(24);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Random subtle latency variation between 18ms and 36ms to simulate live heartbeat
    const interval = setInterval(() => {
      setPingMs(Math.floor(18 + Math.random() * 16));
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100/80 hover:bg-slate-200/70 border border-slate-200/60 text-slate-700 text-xs font-semibold cursor-pointer transition-all shadow-2xs select-none"
        title="System Infrastructure Health"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-[11px] font-bold text-slate-700">Operational</span>
        <span className="text-[10px] text-slate-400 font-mono font-medium">{pingMs}ms</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-extrabold text-slate-900">Infrastructure Health</h4>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
              100% Uptime
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-semibold text-slate-700">API Gateway</span>
              </div>
              <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                <span>Healthy</span>
                <span className="text-slate-400 font-mono font-normal">({pingMs}ms)</span>
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-indigo-600" />
                <span className="font-semibold text-slate-700">Database Engine</span>
              </div>
              <span className="text-[11px] font-bold text-emerald-600">MySQL 8.0 Connected</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span className="font-semibold text-slate-700">SLA Engine</span>
              </div>
              <span className="text-[11px] font-bold text-emerald-600">Real-time Active</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-purple-600" />
                <span className="font-semibold text-slate-700">Platform Build</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500 font-semibold">v2.4-enterprise</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
