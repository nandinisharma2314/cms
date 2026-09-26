"use client";

import React from "react";
import Link from "next/link";
import { User } from "lucide-react";
import { useEndUser } from "@/lib/endUserSession";

function greetingFor(hour: number) {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

/** Top of the home screen: a time-of-day greeting and, on phones, a profile shortcut. */
export default function Greeting() {
  const { profile } = useEndUser();

  return (
    <div className="flex items-start justify-between gap-4 px-2">
      <div className="min-w-0">
        <p className="text-[15px] text-slate-600">{greetingFor(new Date().getHours())},</p>
        <h1 className="mt-0.5 text-[24px] font-extrabold leading-tight tracking-tight text-[#0b1a3f]">
          {profile.name} <span aria-hidden="true">👋</span>
        </h1>
        <p className="mt-1.5 max-w-[230px] text-[14px] leading-snug text-slate-500 md:max-w-none">
          Together for a cleaner, safer and better community.
        </p>
      </div>
      <Link
        href="/dashboard/profile"
        aria-label="Profile"
        className="md:hidden flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#dce9fd] text-blue-600 transition-transform active:scale-95"
      >
        <User className="h-6 w-6" strokeWidth={2.2} />
      </Link>
    </div>
  );
}
