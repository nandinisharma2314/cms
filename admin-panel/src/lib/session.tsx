"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearTokens, hasAccessToken, Me, UNAUTHORIZED_EVENT } from "./api";

interface Session {
  me: Me;
  /** Whether the signed-in user holds a permission (the backend enforces it too). */
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  const reload = useCallback(async () => {
    setMe(await api.auth.me());
  }, []);

  useEffect(() => {
    if (!hasAccessToken()) {
      router.replace("/login");
      return;
    }
    api.auth.me().then(setMe).catch(() => {
      clearTokens();
      router.replace("/login");
    });
  }, [router]);

  useEffect(() => {
    const onUnauthorized = () => router.replace("/login");
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router]);

  const logout = useCallback(async () => {
    await api.auth.logout();
    router.replace("/login");
  }, [router]);

  const value = useMemo<Session | null>(() => {
    if (!me) return null;
    const permissions = new Set(me.permissions);
    return {
      me,
      can: (permission) => permissions.has(permission),
      canAny: (...list) => list.some((p) => permissions.has(p)),
      logout,
      reload,
    };
  }, [me, logout, reload]);

  if (!value) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-500 font-medium">Checking session...</span>
        </div>
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
