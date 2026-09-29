"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Building, ChevronDown, FileSpreadsheet, MapPinned, Plus, UserPlus, Zap } from "lucide-react";
import { useSession } from "@/lib/session";
import { RegisterComplaintDialog } from "./RegisterComplaintDialog";
import { Toast } from "./ui";

interface QuickAction {
  id: string;
  label: string;
  icon: React.ElementType;
  /** Shown when the user holds all of these. */
  permissions: string[];
  href?: string;
  tint: string;
}

const ACTIONS: QuickAction[] = [
  {
    id: "register",
    label: "Register complaint",
    icon: Plus,
    permissions: ["complaint.create"],
    tint: "bg-blue-50 text-blue-600",
  },
  {
    id: "users",
    label: "Add staff user",
    icon: UserPlus,
    permissions: ["user.create"],
    href: "/users?new=1",
    tint: "bg-violet-50 text-violet-600",
  },
  {
    id: "department",
    label: "Add department",
    icon: Building,
    permissions: ["department.create"],
    href: "/departments?new=1",
    tint: "bg-emerald-50 text-emerald-600",
  },
  {
    id: "import-end-users",
    label: "Import end users",
    icon: FileSpreadsheet,
    permissions: ["end_user.import"],
    href: "/end-users?import=1",
    tint: "bg-amber-50 text-amber-600",
  },
  {
    id: "import-locations",
    label: "Import locations",
    icon: MapPinned,
    permissions: ["location.import", "location.view"],
    href: "/locations?import=1",
    tint: "bg-rose-50 text-rose-600",
  },
];

export function QuickActionsBar() {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const visible = ACTIONS.filter((a) => a.permissions.every(can));

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (visible.length === 0) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-linear-to-r from-blue-600 to-indigo-600 text-white font-semibold text-xs rounded-xl hover:from-blue-700 hover:to-indigo-700 shadow-md cursor-pointer"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Zap className="w-4 h-4 sm:hidden" />
        <span className="hidden sm:inline">Quick actions</span>
        <ChevronDown className="w-4 h-4 hidden sm:block" />
        <span className="sr-only sm:hidden">Quick actions</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-3 w-56 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 py-2 z-50"
        >
          {visible.map((action) => {
            const Icon = action.icon;
            const content = (
              <>
                <span className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-lg ${action.tint}`}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="text-xs font-semibold text-slate-700">{action.label}</span>
              </>
            );
            const className = "w-full flex items-center gap-3 px-3.5 py-2 hover:bg-slate-50 cursor-pointer text-left";
            return action.href ? (
              <Link key={action.id} role="menuitem" href={action.href} className={className} onClick={() => setOpen(false)}>
                {content}
              </Link>
            ) : (
              <button
                key={action.id}
                role="menuitem"
                className={className}
                onClick={() => {
                  setOpen(false);
                  setRegistering(true);
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {registering && (
        <RegisterComplaintDialog
          onClose={() => setRegistering(false)}
          onCreated={(message) => {
            setRegistering(false);
            setToast(message);
          }}
        />
      )}
    </div>
  );
}
