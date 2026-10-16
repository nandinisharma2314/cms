"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import enDict from "@/locales/en.json";
import hiDict from "@/locales/hi.json";
import mrDict from "@/locales/mr.json";
import guDict from "@/locales/gu.json";

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  popular?: boolean;
}

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", nativeName: "English", popular: true },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", popular: true },
  { code: "mr", name: "Marathi", nativeName: "मराठी", popular: true },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", popular: true },
];

const DICTIONARIES: Record<string, Record<string, string>> = {
  en: enDict as Record<string, string>,
  hi: hiDict as Record<string, string>,
  mr: mrDict as Record<string, string>,
  gu: guDict as Record<string, string>,
};

// Case-insensitive lookup caches
const LOWER_DICTS: Record<string, Map<string, string>> = {};
for (const [code, dict] of Object.entries(DICTIONARIES)) {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(dict)) {
    map.set(k.toLowerCase(), v);
  }
  LOWER_DICTS[code] = map;
}

export type TranslationParams = Record<string, string | number>;

interface I18nContextValue {
  currentLanguage: Language;
  languages: Language[];
  popularLanguages: Language[];
  setLanguage: (code: string) => void;
  t: (key: string, paramsOrFallback?: string | TranslationParams) => string;
  isModalOpen: boolean;
  openLanguageModal: () => void;
  closeLanguageModal: () => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [langCode, setLangCode] = useState<string>("en");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Clear any residual Google Translate cookies on start and load stored preference
  useEffect(() => {
    try {
      document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`;

      const stored = localStorage.getItem("app_language");
      if (stored && LANGUAGES.some((l) => l.code === stored)) {
        setLangCode(stored);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Set language locally
  const setLanguage = useCallback((code: string) => {
    const found = LANGUAGES.find((l) => l.code === code);
    if (!found) return;

    setLangCode(code);
    try {
      localStorage.setItem("app_language", code);
    } catch {
      // Ignore
    }
    setIsModalOpen(false);
  }, []);

  const currentLanguage = useMemo(() => {
    return LANGUAGES.find((l) => l.code === langCode) || LANGUAGES[0];
  }, [langCode]);

  const popularLanguages = useMemo(() => {
    return LANGUAGES.filter((l) => l.popular);
  }, []);

  // Pure local translation function - 100% reactive, zero DOM mutations
  const t = useCallback(
    (key: string, paramsOrFallback?: string | TranslationParams): string => {
      if (!key) return "";

      const interpolate = (template: string, params?: TranslationParams) => {
        if (!params) return template;
        let out = template;
        for (const [pKey, pVal] of Object.entries(params)) {
          out = out.replaceAll(`{${pKey}}`, String(pVal));
        }
        return out;
      };

      const params = typeof paramsOrFallback === "object" && paramsOrFallback !== null ? paramsOrFallback : undefined;
      const fallback = typeof paramsOrFallback === "string" ? paramsOrFallback : undefined;

      if (langCode === "en") {
        return interpolate(fallback || key, params);
      }

      const dict = DICTIONARIES[langCode];
      if (!dict) return interpolate(fallback || key, params);

      // 1. Direct match
      if (dict[key]) return interpolate(dict[key], params);

      // 2. Trimmed match
      const trimmed = key.trim();
      if (dict[trimmed]) return interpolate(dict[trimmed], params);

      // 3. Lowercase match
      const lower = LOWER_DICTS[langCode]?.get(trimmed.toLowerCase());
      if (lower) return interpolate(lower, params);

      return interpolate(fallback || key, params);
    },
    [langCode],
  );

  return (
    <I18nContext.Provider
      value={{
        currentLanguage,
        languages: LANGUAGES,
        popularLanguages,
        setLanguage,
        t,
        isModalOpen,
        openLanguageModal: () => setIsModalOpen(true),
        closeLanguageModal: () => setIsModalOpen(false),
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
