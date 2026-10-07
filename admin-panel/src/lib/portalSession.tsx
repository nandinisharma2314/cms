"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Profile, UNAUTHORIZED_EVENT } from "./portalApi";

interface EndUserSession {
  profile: Profile;
  /** Whether the End User role grants a portal permission; the API enforces it too. */
  can: (permission: string) => boolean;
  setProfile: (profile: Profile) => void;
  logout: () => Promise<void>;
}

const EndUserContext = createContext<EndUserSession | null>(null);

/**
 * Restores the session (the access token lives only in memory, so after a
 * reload the refresh cookie is exchanged for a new one) and loads the profile.
 */
export function EndUserSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api.profile.me().then(
      (loaded: Profile) => active && setProfile(loaded),
      (err: Error & { status?: number }) => {
        if (!active) return;
        if (err.status === 401) router.replace("/login");
        else setError(err.message);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, router]);

  useEffect(() => {
    const onUnauthorized = () => router.replace("/login");
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router]);

  const logout = useCallback(async () => {
    await api.auth.logout();
    router.replace("/login");
  }, [router]);

  const value = useMemo<EndUserSession | null>(
    () =>
      profile && {
        profile,
        can: (permission: string) => profile.permissions.includes(permission),
        setProfile,
        logout,
      },
    [profile, logout],
  );

  if (!value) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
        {error ? (
          <div role="alert" className="max-w-sm space-y-3 text-center">
            <p className="text-[14px] text-slate-600">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setAttempt((n) => n + 1);
              }}
              className="rounded-xl bg-blue-600 px-4 py-2 text-[14px] font-semibold text-white"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span className="text-[13px] font-medium text-slate-500">Signing you in…</span>
          </div>
        )}
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
