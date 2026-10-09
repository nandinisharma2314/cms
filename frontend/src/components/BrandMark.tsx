"use client";

import React from "react";
import { LayoutGrid } from "lucide-react";
import { useConfig } from "@/lib/config";
import { initials } from "@/lib/format";
import { resolveFileUrl } from "@/lib/api";

/** The organisation's product name and name from Settings; only what is configured is shown. */
export function BrandMark({ compact = false, theme = "dark" }: { compact?: boolean; theme?: "dark" | "light" }) {
  const { product_name, organisation_name, logo_url } = useConfig();
  const dark = theme === "dark";
  return (
    <div className="flex items-center gap-3 min-w-0 select-none">
      <div
        className="w-9 h-9 shrink-0 rounded-xl overflow-hidden bg-linear-to-br from-sky-400 to-blue-600 text-white flex items-center justify-center text-xs font-extrabold shadow-md shadow-blue-900/30"
        aria-hidden="true"
      >
        {logo_url ? (
          <img src={resolveFileUrl(logo_url)!} alt="Logo" className="w-full h-full object-cover" />
        ) : product_name ? (
          initials(product_name)
        ) : (
          <LayoutGrid className="w-4 h-4" />
        )}
      </div>
      {!compact && (product_name || organisation_name) && (
        <div className="min-w-0">
          {product_name && (
            <div className={`text-sm font-bold leading-tight truncate ${dark ? "text-white" : "text-slate-900"}`}>
              {product_name}
            </div>
          )}
          {organisation_name && (
            <div className={`text-[11px] leading-tight truncate ${dark ? "text-slate-400" : "text-slate-500"}`}>
              {organisation_name}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
