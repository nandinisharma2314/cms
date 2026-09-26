"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apis, EndUserProfile, clearSession, hasSession, UNAUTHORIZED_EVENT } from "./apis";

interface EndUserSession {
  profile: EndUserProfile;
  /** Whether the End User role grants a portal permission; the backend enforces it too. */
  can: (permission: string) => boolean;
  logout: () => Promise<void>;
}

const EndUserContext = createContext<EndUserSession | null>(null);

export function EndUserSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<EndUserProfile | null>(null);

  useEffect(() => {
    if (!hasSession()) {
      router.replace("/login");
      return;
    }
    apis.auth
      .me()
      .then(setProfile)
      .catch(() => {
        clearSession();
        router.replace("/login");
      });
  }, [router]);

  useEffect(() => {
    const onUnauthorized = () => router.replace("/login");
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router]);

  const value = useMemo<EndUserSession | null>(
    () =>
      profile && {
        profile,
        can: (permission: string) => profile.permissions.includes(permission),
        logout: async () => {
          await apis.auth.logout();
          router.replace("/login");
        },
      },
    [profile, router],
  );

  if (!value) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-500 font-medium">Checking session...</span>
        </div>
      </div>
    );
  }
  return <EndUserContext.Provider value={value}>{children}</EndUserContext.Provider>;
}

export function useEndUser(): EndUserSession {
  const session = useContext(EndUserContext);
  if (!session) throw new Error("useEndUser must be used inside <EndUserSessionProvider>");
  return session;
}
