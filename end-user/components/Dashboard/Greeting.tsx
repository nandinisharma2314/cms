"use client";

import React from "react";
import Link from "next/link";
import { User } from "lucide-react";
import { useConfig } from "@/lib/config";
import { currentHour } from "@/lib/format";
import { useEndUser } from "@/lib/session";

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Top of the home screen: a time-of-day greeting and, on phones, a profile shortcut. */
export default function Greeting() {
  const { profile } = useEndUser();
  const { product_name } = useConfig();

  return (
    <div className="flex items-start justify-between gap-4 px-2">
      <div className="min-w-0">
        <p className="text-[15px] text-slate-600">{greetingFor(currentHour())},</p>
        <h1 className="mt-0.5 text-[24px] font-extrabold leading-tight tracking-tight text-[#0b1a3f]">
          {profile.name} <span aria-hidden="true">👋</span>
        </h1>
        <p className="mt-1.5 max-w-57.5 text-[14px] leading-snug text-slate-500 md:max-w-none">
          {product_name ? `Welcome to ${product_name}. ` : ""}Here is where your complaints stand.
        </p>
      </div>
      <Link
        href="/dashboard/profile"
        aria-label="Profile"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#dce9fd] text-blue-600 transition-transform active:scale-95 md:hidden"
      >
        <User className="h-6 w-6" strokeWidth={2.2} />
      </Link>
    </div>
  );
}
