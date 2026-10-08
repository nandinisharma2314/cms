"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import { useConfig } from "@/lib/portalConfig";
import { SupportContacts } from "@/components/portal/Brand/SupportContacts";
import { Dialog } from "@/components/portal/ui/Dialog";

export function AdminContactModal({ onClose }: { onClose: () => void }) {
  const { support } = useConfig();
  const hasContacts = Boolean(support.phone || support.email);

  return (
    <Dialog title="Account not found" icon={<AlertCircle className="h-5 w-5 text-amber-600" />} onClose={onClose}>
      <div className="space-y-4 text-[14px] leading-relaxed text-slate-600">
        <p>No registered account was found with this phone number or email address.</p>
        <p>
          To obtain your sign-in credentials or register your account, please contact the administrator{hasContacts ? ":" : "."}
        </p>
        <SupportContacts />
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full rounded-2xl bg-blue-600 py-3 text-[15px] font-semibold text-white transition-all hover:bg-blue-700 active:scale-[0.98]"
      >
        Got it
      </button>
    </Dialog>
  );
}
