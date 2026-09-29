"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Me, UNAUTHORIZED_EVENT } from "./api";

interface Session {
  me: Me;
  /** Whether the signed-in user holds a permission (the backend enforces it too). */
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  setMe: (me: Me) => void;
}

const SessionContext = createContext<Session | null>(null);

/** Where to go after signing in again: only paths inside this app. */
export function loginPath(current: string | null): string {
  return current && current.startsWith("/") && !current.startsWith("//") && current !== "/"
    ? `/login?next=${encodeURIComponent(current)}`
    : "/login";
}

/**
 * Restores the session (the access token is only in memory, so after a reload
 * the refresh cookie is exchanged for a new one) and loads the profile.
 * Accounts that must replace their password are sent to /change-password
 * unless `passwordChangePage` is set.
 */
export function SessionProvider({
  children,
  passwordChangePage = false,
}: {
  children: React.ReactNode;
  passwordChangePage?: boolean;
}) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // me() refreshes the session from the cookie when there is no access token yet
    let active = true;
    api.auth.me().then(
      (loaded) => active && setMe(loaded),
      (err: Error & { status?: number }) => {
        if (!active) return;
        if (err.status === 401) router.replace(loginPath(window.location.pathname));
        else setError(err.message);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, router]);

  useEffect(() => {
    if (!me) return;
    if (me.must_change_password && !passwordChangePage) router.replace("/change-password");
  }, [me, passwordChangePage, router]);

  useEffect(() => {
    const onUnauthorized = () => router.replace(loginPath(window.location.pathname));
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router]);

  const logout = useCallback(async () => {
    await api.auth.logout();
    router.replace("/login");
  }, [router]);

  const reload = useCallback(async () => {
    setMe(await api.auth.me());
  }, []);

  const value = useMemo<Session | null>(() => {
    if (!me) return null;
    const permissions = new Set(me.permissions);
    return {
      me,
      can: (permission) => permissions.has(permission),
      canAny: (...list) => list.some((p) => permissions.has(p)),
      logout,
      reload,
      setMe,
    };
  }, [me, logout, reload]);

  if (!value || (value.me.must_change_password && !passwordChangePage)) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
        {error ? (
          <div role="alert" className="max-w-sm text-center space-y-3">
            <p className="text-xs text-slate-600">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setAttempt((n) => n + 1);
              }}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-500 font-medium">Checking your session…</span>
          </div>
        )}
      </div>
    );
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}
