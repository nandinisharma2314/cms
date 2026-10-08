"use client";

import React from "react";
import { ShieldCheck } from "lucide-react";
import { useConfig } from "@/lib/portalConfig";
import { SupportContacts } from "@/components/portal/Brand/SupportContacts";
import { Dialog } from "@/components/portal/ui/Dialog";

export function NeedHelpModal({ onClose }: { onClose: () => void }) {
  const { support, otp } = useConfig();
  const hasContacts = Boolean(support.phone || support.email);
  const contact = otp.channels.map((c) => (c === "sms" ? "mobile number" : "email address")).join(" or ");
  const short = otp.channels.map((c) => (c === "sms" ? "number" : "email")).join(" or ");
  return (
    <Dialog title="Help signing in" icon={<ShieldCheck className="h-5 w-5 text-blue-600" />} onClose={onClose}>
      <div className="space-y-4 text-[14px] leading-relaxed text-slate-600">
        <p>You sign in with a one-time code sent to the {contact} registered for you. There is no password to remember.</p>
        <p>
          If your {short} isn&apos;t recognised, or the code doesn&apos;t arrive, contact support{hasContacts ? ":" : "."}
        </p>
        <SupportContacts />
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full rounded-2xl bg-blue-600 py-3 text-[15px] font-semibold text-white"
      >
        Got it
      </button>
    </Dialog>
  );
}
