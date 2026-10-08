"use client";

import React from "react";
import { Clock, Mail, Phone } from "lucide-react";
import { useConfig } from "@/lib/portalConfig";

/** The organisation's support contacts from Settings. Renders nothing when none are set. */
export function SupportContacts({ className = "" }: { className?: string }) {
  const { support } = useConfig();
  if (!support.phone && !support.email) return null;
  return (
    <ul className={`space-y-2 text-[14px] text-slate-700 ${className}`}>
      {support.phone && (
        <li className="flex items-center gap-2">
          <Phone className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          <a href={`tel:${support.phone.replace(/[^\d+]/g, "")}`} className="font-semibold hover:text-blue-700">
            {support.phone}
          </a>
        </li>
      )}
      {support.email && (
        <li className="flex items-center gap-2">
          <Mail className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          <a href={`mailto:${support.email}`} className="font-semibold break-all hover:text-blue-700">
            {support.email}
          </a>
        </li>
      )}
      {support.hours && (
        <li className="flex items-center gap-2 text-slate-500">
          <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
          {support.hours}
        </li>
      )}
    </ul>
  );
}
