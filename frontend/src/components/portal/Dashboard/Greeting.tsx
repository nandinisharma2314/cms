 
"use client";

import React from "react";
import Link from "next/link";
import { User, Plus } from "lucide-react";
import { currentHour } from "@/lib/portalFormat";
import { resolveAvatarUrl } from "@/lib/portalApi";
import { useEndUser } from "@/lib/portalSession";

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Top of the home screen: a time-of-day greeting and, on phones, a profile shortcut. */
export default function Greeting() {
  const { profile } = useEndUser();

  let assignedRole = "Representative";
  let assignedName = profile.agent_name;
  if (profile.agent_name && profile.agent_name.includes(" (")) {
    const parts = profile.agent_name.split(" (");
    assignedName = parts[0];
    assignedRole = parts[1].replace(")", "");
  }

  return (
    <div className="flex items-start justify-between gap-4 px-2">
      <div className="min-w-0">
        <p className="text-[15px] text-slate-600">{greetingFor(currentHour())},</p>
        <h1 className="mt-0.5 text-[24px] font-bold leading-tight tracking-tight text-gray-800">
          {profile.name} <span aria-hidden="true">👋</span>
        </h1>
        {profile.agent_name && (
          <p className="mt-1 text-[13px] font-medium text-amber-500">
            {assignedRole}: <span className="text-amber-500">{assignedName}</span>
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/register"
          className="hidden items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 active:scale-95 md:flex"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
          Register complaint
        </Link>
      </div>
    </div>
  );
}
