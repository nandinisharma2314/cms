"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  FileText,
  Flame,
  FolderTree,
  Gift,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPin,
  PlusCircle,
  Search,
  Settings,
  Shield,
  Sliders,
  Sparkles,
  Trophy,
  User,
  UserCheck,
  UserX,
  Users,
  X,
  Zap,
} from "lucide-react";
import { api, ComplaintData } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useDebounced } from "@/lib/hooks";
import { PriorityBadge, StatusBadge } from "./ui";

export const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

export function openCommandPalette() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
  }
}

interface CommandItem {
  id: string;
  category: "Navigation" | "Actions" | "Complaints";
  title: string;
  description?: string;
  icon: React.ReactNode;
  badge?: string;
  onSelect: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const { me, can, setMe, logout } = useSession();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [complaintResults, setComplaintResults] = useState<ComplaintData[]>([]);
  const [loadingComplaints, setLoadingComplaints] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounced(query.trim());

  // Keyboard shortcut listener: Ctrl + Space (or Cmd + Space) & Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + Spacebar or Meta + Spacebar
      if ((e.ctrlKey || e.metaKey) && (e.code === "Space" || e.key === " ")) {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };

    const handleCustomOpen = () => {
      setOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, handleCustomOpen);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, handleCustomOpen);
    };
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Search complaints when query is typed
  useEffect(() => {
    if (!open || !debouncedQuery) {
      setComplaintResults([]);
      setLoadingComplaints(false);
      return;
    }

    let isMounted = true;
    setLoadingComplaints(true);

    api.complaints
      .list({ search: debouncedQuery, page_size: 5 })
      .then((res) => {
        if (isMounted) {
          setComplaintResults(res.items);
          setLoadingComplaints(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setComplaintResults([]);
          setLoadingComplaints(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [open, debouncedQuery]);

  // Static items list based on permissions
  const staticItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    // Navigation Items
    items.push({
      id: "nav-dashboard",
      category: "Navigation",
      title: "Executive Dashboard",
      description: "Overview metrics, SLA trends, and recent complaints",
      icon: <LayoutDashboard className="w-4 h-4 text-blue-600" />,
      onSelect: () => router.push("/"),
    });

    if (can("complaint.view")) {
      items.push({
        id: "nav-complaints",
        category: "Navigation",
        title: "All Complaints",
        description: "Full directory of municipal grievances & tickets",
        icon: <FileText className="w-4 h-4 text-emerald-600" />,
        onSelect: () => router.push("/complaints"),
      });

      items.push({
        id: "nav-escalated",
        category: "Navigation",
        title: "Escalated Complaints",
        description: "Tickets flagged for manager intervention or SLA breach",
        icon: <Zap className="w-4 h-4 text-amber-600" />,
        onSelect: () => router.push("/escalated"),
      });
    }

    if (can("rewards.view")) {
      items.push({
        id: "nav-rewards",
        category: "Navigation",
        title: "Rewards & Leaderboard",
        description: "Employee points, monthly quests, perks and certificates",
        icon: <Trophy className="w-4 h-4 text-amber-500" />,
        onSelect: () => router.push("/rewards"),
      });

      items.push({
        id: "nav-dept-cup",
        category: "Navigation",
        title: "Department Championship Cup",
        description: "Inter-department ranking & SLA turnaround trophy",
        icon: <Building2 className="w-4 h-4 text-indigo-600" />,
        onSelect: () => router.push("/rewards"),
      });

      items.push({
        id: "nav-scorecard",
        category: "Navigation",
        title: "Public Civic Scorecard",
        description: "Citywide grievance turnaround & satisfaction index",
        icon: <CheckCircle2 className="w-4 h-4 text-teal-600" />,
        onSelect: () => router.push("/rewards"),
      });
    }

    items.push({
      id: "nav-team",
      category: "Navigation",
      title: "Team Hierarchy & Structure",
      description: "Department managers, supervisors, and field technicians",
      icon: <Users className="w-4 h-4 text-purple-600" />,
      onSelect: () => router.push("/my-team"),
    });

    if (can("sla.manage") || me.is_super_admin) {
      items.push({
        id: "nav-sla",
        category: "Navigation",
        title: "SLA Policies & Timers",
        description: "Response and resolution targets by priority level",
        icon: <Clock className="w-4 h-4 text-rose-500" />,
        onSelect: () => router.push("/sla"),
      });
    }

    if (can("department.manage") || me.is_super_admin) {
      items.push({
        id: "nav-departments",
        category: "Navigation",
        title: "Departments & Categories",
        description: "Configure municipal operational divisions",
        icon: <Building2 className="w-4 h-4 text-sky-600" />,
        onSelect: () => router.push("/departments"),
      });
    }

    if (can("location.manage") || me.is_super_admin) {
      items.push({
        id: "nav-locations",
        category: "Navigation",
        title: "Locations & Zones Tree",
        description: "Geographic areas, wards, and service districts",
        icon: <MapPin className="w-4 h-4 text-red-500" />,
        onSelect: () => router.push("/locations"),
      });
    }

    if (can("role.manage") || me.is_super_admin) {
      items.push({
        id: "nav-roles",
        category: "Navigation",
        title: "Roles & Permissions",
        description: "Access control matrix and staff role assignment",
        icon: <Shield className="w-4 h-4 text-indigo-500" />,
        onSelect: () => router.push("/roles"),
      });
    }

    if (can("audit.view") || me.is_super_admin) {
      items.push({
        id: "nav-audit",
        category: "Navigation",
        title: "System Audit Logs",
        description: "Immutable history of operational actions and security events",
        icon: <FolderTree className="w-4 h-4 text-slate-600" />,
        onSelect: () => router.push("/audit-logs"),
      });
    }

    if (can("settings.manage") || me.is_super_admin) {
      items.push({
        id: "nav-settings",
        category: "Navigation",
        title: "Enterprise Settings",
        description: "Organization branding, SMS/Email OTP, and attachments",
        icon: <Settings className="w-4 h-4 text-slate-700" />,
        onSelect: () => router.push("/settings"),
      });
    }

    // Action Items
    if (can("complaint.create")) {
      items.push({
        id: "action-register",
        category: "Actions",
        title: "Register New Complaint",
        description: "Quickly file a citizen ticket or grievance",
        icon: <PlusCircle className="w-4 h-4 text-blue-600" />,
        badge: "New Ticket",
        onSelect: () => router.push("/complaints"),
      });
    }

    if (can("rewards.manage") || me.is_super_admin) {
      items.push({
        id: "action-adjust-points",
        category: "Actions",
        title: "Adjust Staff Reward Points",
        description: "Manually award bonus or apply penalty deduction",
        icon: <Award className="w-4 h-4 text-amber-600" />,
        badge: "Admin",
        onSelect: () => router.push("/rewards"),
      });
    }

    if (can("complaint.receive")) {
      items.push({
        id: "action-toggle-availability",
        category: "Actions",
        title: me.is_available ? "Set Status to Busy / Away" : "Set Status to Available",
        description: me.is_available
          ? "Pause automatic ticket assignment to you"
          : "Resume receiving auto-assigned complaints",
        icon: me.is_available ? (
          <UserX className="w-4 h-4 text-rose-500" />
        ) : (
          <UserCheck className="w-4 h-4 text-emerald-600" />
        ),
        badge: me.is_available ? "Available" : "Away",
        onSelect: async () => {
          try {
            const updated = await api.auth.setAvailability(!me.is_available);
            setMe(updated);
          } catch {
            // ignore
          }
        },
      });
    }

    items.push({
      id: "action-change-password",
      category: "Actions",
      title: "Change Account Password",
      description: "Update your login password credential",
      icon: <KeyRound className="w-4 h-4 text-slate-500" />,
      onSelect: () => router.push("/change-password"),
    });

    items.push({
      id: "action-sign-out",
      category: "Actions",
      title: "Sign Out",
      description: "Securely end your current session",
      icon: <LogOut className="w-4 h-4 text-rose-600" />,
      onSelect: () => logout(),
    });

    return items;
  }, [can, me, router, setMe, logout]);

  // Combined filtered items (complaints + matched static items)
  const allFilteredItems = useMemo<CommandItem[]>(() => {
    const q = query.toLowerCase().trim();

    // 1. Complaint results
    const complaints: CommandItem[] = complaintResults.map((c) => ({
      id: `complaint-${c.id}`,
      category: "Complaints",
      title: `${c.id}: ${c.title}`,
      description: `${c.department} • ${c.status_label}`,
      icon: <FileText className="w-4 h-4 text-blue-600" />,
      badge: c.status_label,
      onSelect: () => router.push(`/complaints/${encodeURIComponent(c.id)}`),
    }));

    // 2. Filtered static items
    const filteredStatic = staticItems.filter((item) => {
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
      );
    });

    return [...complaints, ...filteredStatic];
  }, [query, complaintResults, staticItems, router]);

  // Keyboard navigation through items
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < allFilteredItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : allFilteredItems.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = allFilteredItems[activeIndex];
      if (current) {
        current.onSelect();
        setOpen(false);
      }
    }
  };

  // Auto-scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <Search className="w-5 h-5 text-slate-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none font-medium"
            placeholder="Type a command, page name, or complaint ticket ID…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          {query ? (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400 select-none">
              <kbd className="px-2 py-0.5 rounded-md bg-white border border-slate-200 shadow-2xs font-mono text-[10px] text-slate-600">
                Ctrl + Space
              </kbd>
            </div>
          )}
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
          {loadingComplaints && (
            <div className="px-4 py-2 text-xs text-slate-400 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
              Searching tickets…
            </div>
          )}

          {allFilteredItems.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Compass className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-600">No matching commands or tickets found</p>
              <p className="text-xs text-slate-400">Try searching for &quot;Complaints&quot;, &quot;Rewards&quot;, &quot;CMP-&quot;, or &quot;Team&quot;</p>
            </div>
          ) : (
            allFilteredItems.map((item, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <div
                  key={item.id}
                  data-index={idx}
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-blue-50 text-blue-900 border-l-3 border-blue-600 font-semibold"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected ? "bg-white shadow-2xs" : "bg-slate-100"
                      }`}
                    >
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 truncate">{item.title}</span>
                        {item.badge && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-[11px] text-slate-500 truncate">{item.description}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Command Palette Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50/80 text-[11px] text-slate-400 select-none">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono font-bold text-slate-600">
                ↑
              </kbd>{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono font-bold text-slate-600">
                ↓
              </kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono font-bold text-slate-600">
                ↵
              </kbd>{" "}
              Select
            </span>
          </div>
          <div>
            <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono font-bold text-slate-600">
              ESC
            </kbd>{" "}
            Close
          </div>
        </div>
      </div>
    </div>
  );
}
