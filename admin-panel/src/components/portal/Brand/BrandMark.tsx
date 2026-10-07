"use client";

import React from "react";
import { LayoutGrid } from "lucide-react";
import { useConfig } from "@/lib/portalConfig";
import { initials } from "@/lib/portalFormat";

/** The product name and organisation name from Settings; only what is configured is shown. */
export function BrandMark({ size = "md", showText = true }: { size?: "md" | "lg"; showText?: boolean }) {
  const { product_name, organisation_name } = useConfig();
  const box = size === "lg" ? "h-12 w-12 text-[15px] rounded-2xl" : "h-10 w-10 text-[13px] rounded-xl";
  return (
    <div className="flex min-w-0 items-center gap-3 select-none">
      <div
        className={`${box} flex shrink-0 items-center justify-center bg-linear-to-br from-sky-400 to-blue-600 font-extrabold text-white shadow-md shadow-blue-600/25`}
        aria-hidden="true"
      >
        {product_name ? initials(product_name) : <LayoutGrid className="h-5 w-5" />}
      </div>
      {showText && (product_name || organisation_name) && (
        <div className="min-w-0 text-left">
          {product_name && <div className="truncate text-[17px] font-extrabold leading-tight text-[#0b1a3f]">{product_name}</div>}
          {organisation_name && <div className="truncate text-[12px] leading-tight text-slate-500">{organisation_name}</div>}
        </div>
      )}
    </div>
  );
}
