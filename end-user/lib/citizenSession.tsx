"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apis, CitizenProfile, clearSession, hasSession, UNAUTHORIZED_EVENT } from "./apis";

interface CitizenSession {
  profile: CitizenProfile;
  logout: () => Promise<void>;
}

const CitizenContext = createContext<CitizenSession | null>(null);

export function CitizenSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<CitizenProfile | null>(null);

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

  const value = useMemo<CitizenSession | null>(
    () =>
      profile && {
        profile,
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
  return <CitizenContext.Provider value={value}>{children}</CitizenContext.Provider>;
}

export function useCitizen(): CitizenSession {
  const session = useContext(CitizenContext);
  if (!session) throw new Error("useCitizen must be used inside <CitizenSessionProvider>");
  return session;
}
