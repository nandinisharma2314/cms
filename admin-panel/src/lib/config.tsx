"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, PublicConfig } from "./api";
import { setDisplayTimeZone } from "./format";

const ConfigContext = createContext<{ config: PublicConfig; reload: () => void } | null>(null);

/**
 * Loads GET /public/config (branding, formats, limits, shared UI defaults)
 * before anything else renders, and again on `useReloadConfig()` (after
 * Settings are saved). Nothing here is built in: what the organisation has
 * not configured is null and the UI leaves it out.
 */
export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api.config().then(
      (loaded) => {
        if (!active) return;
        setDisplayTimeZone(loaded.timezone);
        setConfig(loaded);
      },
      // A failed reload keeps the configuration already shown.
      (err: Error) => active && setError(err.message),
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  const value = useMemo(() => (config ? { config, reload: () => setAttempt((n) => n + 1) } : null), [config]);

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        {error ? (
          <div role="alert" className="max-w-sm text-center space-y-3">
            <p className="text-sm font-semibold text-slate-800">The application could not start</p>
            <p className="text-xs text-slate-500">{error}</p>
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
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" aria-label="Loading" />
        )}
      </div>
    );
  }
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

function useConfigContext() {
  const context = useContext(ConfigContext);
  if (!context) throw new Error("useConfig must be used inside <ConfigProvider>");
  return context;
}

export function useConfig(): PublicConfig {
  return useConfigContext().config;
}

/** Fetches the configuration again, e.g. after the Settings page saved new values. */
export function useReloadConfig(): () => void {
  return useConfigContext().reload;
}

/** Sets the browser tab title: "<page> · <product name>" (the product name only when configured). */
export function useDocumentTitle(page: string) {
  const { product_name } = useConfig();
  useEffect(() => {
    document.title = [page, product_name ? `${product_name} Admin` : null].filter(Boolean).join(" · ");
  }, [page, product_name]);
}
