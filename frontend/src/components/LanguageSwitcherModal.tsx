"use client";

import React, { useMemo, useState } from "react";
import { Check, Globe, Search, X } from "lucide-react";
import { Language, useI18n } from "@/lib/i18n";

export function LanguagePill() {
  const { currentLanguage, openLanguageModal } = useI18n();

  return (
    <button
      type="button"
      onClick={openLanguageModal}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 h-8 sm:h-9 text-[11px] sm:text-xs font-semibold rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-2xs cursor-pointer"
      title="Change Language / भाषा बदलें"
      aria-label={`Current language: ${currentLanguage.name}. Tap to change.`}
    >
      <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
      <span className="font-medium text-slate-900">{currentLanguage.nativeName}</span>
      <span className="text-[10px] text-slate-400 hidden xs:inline uppercase">({currentLanguage.code})</span>
    </button>
  );
}

export function LanguageSwitcherModal() {
  const { currentLanguage, languages, popularLanguages, setLanguage, isModalOpen, closeLanguageModal } = useI18n();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q),
    );
  }, [languages, query]);

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[88vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="language-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 id="language-modal-title" className="text-sm font-bold text-slate-900">
                Select Language / भाषा चुनें
              </h2>
              <p className="text-[11px] text-slate-500">Choose your preferred language</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeLanguageModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3.5 sm:p-4 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search language / भाषा खोजें..."
              className="w-full h-10 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* Popular chips */}
        {!query && (
          <div className="px-4 py-3 bg-slate-50/50 border-b border-slate-100 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Popular Languages / प्रमुख भाषाएं
            </p>
            <div className="flex flex-wrap gap-1.5">
              {popularLanguages.map((l) => {
                const isSelected = l.code === currentLanguage.code;
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLanguage(l.code)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span>{l.nativeName}</span>
                    <span className="text-[10px] opacity-75 ml-1 font-normal">({l.name})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Language list */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No language found / कोई भाषा नहीं मिली</div>
          ) : (
            filtered.map((l) => {
              const isSelected = l.code === currentLanguage.code;
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLanguage(l.code)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-colors cursor-pointer ${
                    isSelected ? "bg-blue-50 text-blue-900 font-semibold" : "hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-slate-900">{l.nativeName}</div>
                    <div className="text-[11px] text-slate-500">
                      {l.name} · <span className="font-mono text-[10px] uppercase text-slate-400">{l.code}</span>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <span>Current: <strong className="text-slate-800">{currentLanguage.nativeName} ({currentLanguage.name})</strong></span>
          <button
            type="button"
            onClick={closeLanguageModal}
            className="px-3 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
