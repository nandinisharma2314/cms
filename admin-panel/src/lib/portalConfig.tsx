"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { api, PublicConfig } from "./api";
import { setDisplayTimeZone } from "./format";

const ConfigContext = createContext<PublicConfig | null>(null);

/**
 * Loads GET /public/config (branding, phone format, limits, shared UI
 * defaults) once, before anything else renders. Nothing here is built in:
 * what the organisation has not configured is null and the UI leaves it out.
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
      (err: Error) => active && setError(err.message),
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        {error ? (
          <div role="alert" className="max-w-sm space-y-3 text-center">
            <p className="text-[15px] font-semibold text-slate-800">We couldn&apos;t load the app</p>
            <p className="text-[13px] text-slate-500">{error}</p>
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
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-label="Loading" />
        )}
      </div>
    );
  }
  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export function useConfig(): PublicConfig {
  const config = useContext(ConfigContext);
  if (!config) throw new Error("useConfig must be used inside <ConfigProvider>");
  return config;
}

/** Sets the browser tab title: "<page> · <product name>" (the product name only when configured). */
export function useDocumentTitle(page: string) {
  const { product_name } = useConfig();
  useEffect(() => {
    document.title = [page, product_name].filter(Boolean).join(" · ");
  }, [page, product_name]);
}
