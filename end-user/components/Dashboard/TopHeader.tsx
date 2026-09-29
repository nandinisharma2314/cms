"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, FileText, LogOut, Search, User } from "lucide-react";
import { initials } from "@/lib/format";
import { useEndUser } from "@/lib/session";
import { BrandMark } from "@/components/Brand/BrandMark";

/** Top bar on larger screens (and on phone pages other than home). */
export function TopHeader({ hideOnMobile = false }: { hideOnMobile?: boolean }) {
  const router = useRouter();
  const { profile, logout } = useEndUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header
      className={`sticky top-0 z-30 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-2 md:px-8 md:py-3 lg:px-12 ${
        hideOnMobile ? "hidden md:flex" : "flex"
      }`}
    >
      <Link href="/dashboard" className="min-w-0 transition-opacity hover:opacity-80" aria-label="Home">
        <BrandMark />
      </Link>

      <div className="flex shrink-0 items-center gap-3 md:gap-5">
        <form
          role="search"
          className="relative hidden md:flex"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/dashboard/complaints?search=${encodeURIComponent(search.trim())}`);
          }}
        >
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search my complaints"
            aria-label="Search my complaints"
            className="h-10 w-64 rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 lg:w-80"
          />
        </form>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="flex items-center gap-3 rounded-xl p-1 pr-2 transition-colors hover:bg-slate-50"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-label="Account menu"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-md shadow-blue-600/20">
              {initials(profile.name)}
            </span>
            <span className="hidden flex-col items-start text-left md:flex">
              <span className="max-w-40 truncate text-sm font-bold leading-tight text-slate-800">{profile.name}</span>
              <span className="mt-0.5 text-[11px] font-medium leading-tight text-slate-500">{profile.role.name}</span>
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 md:block" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-lg">
              <div className="border-b border-slate-100 bg-slate-50/50 p-4">
                <div className="truncate text-sm font-bold text-slate-800">{profile.name}</div>
                <div className="mt-1 truncate text-xs text-slate-500">{profile.email}</div>
              </div>
              <div className="flex flex-col gap-1 p-2">
                <Link
                  href="/dashboard/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600"
                >
                  <User className="h-4 w-4" /> My profile
                </Link>
                <Link
                  href="/dashboard/complaints"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600"
                >
                  <FileText className="h-4 w-4" /> My complaints
                </Link>
              </div>
              <div className="border-t border-slate-100 p-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
