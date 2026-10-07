"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { api, Complaint, StatusGroup } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { formatDateTime, shortPlace } from "@/lib/format";
import { useEndUser } from "@/lib/session";
import { departmentDot, GROUP_PILLS, TONE_PILLS } from "@/lib/status";

const CARD = " bg-white shadow-[0_2px_14px_-6px_rgba(15,23,42,0.12)]";
const GROUPS: (StatusGroup | "")[] = ["", "open", "in_progress", "resolved", "rejected"];

function isGroup(value: string | null): value is StatusGroup {
  return value !== null && (GROUPS as string[]).includes(value) && value !== "";
}

function ComplaintsList({ initialGroup, initialSearch }: { initialGroup: StatusGroup | ""; initialSearch: string }) {
  useDocumentTitle("My complaints");
  const { ui } = useConfig();
  const canCreate = useEndUser().can("portal.complaint.create");
  const [group, setGroup] = useState<StatusGroup | "">(initialGroup);
  const [search, setSearch] = useState(initialSearch);
  const [term, setTerm] = useState(initialSearch.trim());
  const [items, setItems] = useState<Complaint[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Wait for typing to pause before searching.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), ui.search_debounce_ms);
    return () => clearTimeout(timer);
  }, [search, ui.search_debounce_ms]);

  useEffect(() => {
    let active = true;
    api.complaints.list({ group, search: term || undefined, page: 1, page_size: ui.default_page_size }).then(
      (result) => {
        if (!active) return;
        setItems(result.items);
        setTotal(result.total);
        setPage(1);
        setError(null);
      },
      (err: Error) => active && setError(err.message),
    );
    return () => {
      active = false;
    };
  }, [group, term, ui.default_page_size]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const result = await api.complaints.list({
        group,
        search: term || undefined,
        page: page + 1,
        page_size: ui.default_page_size,
      });
      setItems((prev) => [...(prev ?? []), ...result.items]);
      setTotal(result.total);
      setPage(page + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="flex-1 md:min-h-0 md:overflow-y-auto">
      <div className="flex-col gap-3 p-2 pb-2 md:px-4">

        <div className={`${CARD} space-y-3 p-3 md:p-4`}>
          <label className="relative block">
            <span className="sr-only">Search my complaints</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or complaint ID"
              className="h-11 w-full  border border-slate-200 bg-slate-50 pl-10 pr-4 text-[15px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <div className="flex gap-2 relative overflow-x-auto pb-0.5" role="tablist" aria-label="Status">
            {GROUPS.map((value) => (
              <button
                key={value || "all"}
                type="button"
                role="tab"
                aria-selected={group === value}
                onClick={() => setGroup(value)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  group === value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {value ? GROUP_PILLS[value].label : "All"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className={`${CARD} p-4 text-[14px] text-red-600`}>
            {error}
          </p>
        )}

        {(items !== null || !error) && (
        <section className={`${CARD} overflow-hidden`}>
          {items === null ? (
            <ul className="animate-pulse divide-y divide-slate-100" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="space-y-2 p-4">
                  <span className="block h-3.5 w-2/3 rounded bg-slate-200" />
                  <span className="block h-3 w-1/2 rounded bg-slate-100" />
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-[15px] font-semibold text-[#0b1a3f]">
                {term || group ? "Nothing matches" : "No complaints yet"}
              </p>
              <p className="mt-1 text-[13px] text-slate-500">
                {term || group ? "Try another search or status." : "When you register a complaint, you can follow it here."}
              </p>
              {canCreate && !term && !group && (
                <Link
                  href="/dashboard/register"
                  className="mt-4 inline-block  bg-blue-600 px-4 py-2 text-[14px] font-semibold text-white"
                >
                  Register a complaint
                </Link>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/complaints/${encodeURIComponent(c.id)}`}
                    className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50/70 md:px-5"
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${departmentDot(c.department)}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-[#0b1a3f]">{c.title}</span>
                      <span className="mt-1 block truncate text-[12.5px] text-slate-500">
                        {c.id} · {c.department}
                        {c.category ? ` · ${c.category}` : ""} · {shortPlace(c.location_detail)}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${GROUP_PILLS[c.status_group].className}`}
                        >
                          {c.status_label}
                        </span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${TONE_PILLS[c.priority.tone]}`}>
                          {c.priority.name}
                        </span>
                        <span className="text-[12px] text-slate-400">{formatDateTime(c.created_at)}</span>
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2.4} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}

        {items && items.length > 0 && (
          <div className="flex flex-col items-center gap-2 pb-2 text-[13px] text-slate-500">
            <span>
              Showing {items.length} of {total}
            </span>
            {items.length < total && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className=" border border-slate-200 bg-white px-5 py-2 font-semibold text-blue-600 hover:bg-slate-50 disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Show more"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ComplaintsRoute() {
  // The home tiles and the header search link here; a new link starts a fresh list.
  const params = useSearchParams();
  const group = params.get("group");
  return (
    <ComplaintsList
      key={params.toString()}
      initialGroup={isGroup(group) ? group : ""}
      initialSearch={params.get("search") ?? ""}
    />
  );
}

export default function MyComplaintsPage() {
  return (
    <Suspense>
      <ComplaintsRoute />
    </Suspense>
  );
}
