"use client";

import { SessionProvider } from "@/lib/session";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export default function ChangePasswordPage() {
  return (
    <SessionProvider passwordChangePage>
      <ChangePasswordForm />
    </SessionProvider>
  );
}
