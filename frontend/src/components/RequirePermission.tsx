"use client";

import React from "react";
import { ShieldAlert } from "lucide-react";
import { useSession } from "@/lib/session";
import { Card } from "./ui";

/** Renders children only when the user holds any of the given permissions. */
export function RequirePermission({ anyOf, children }: { anyOf: string[]; children: React.ReactNode }) {
  const { canAny } = useSession();
  if (canAny(...anyOf)) return <>{children}</>;
  return (
    <Card className="p-10 flex flex-col items-center text-center gap-2">
      <ShieldAlert className="w-8 h-8 text-slate-300" />
      <h2 className="text-sm font-bold text-slate-800">You don&apos;t have access to this page</h2>
      <p className="text-xs text-slate-500">Ask an administrator above you if you need it.</p>
    </Card>
  );
}
