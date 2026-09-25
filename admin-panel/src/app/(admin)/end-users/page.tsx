"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, Power } from "lucide-react";
import { api, EndUserRow } from "@/lib/api";
import { useApiData, useDebounced } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { RequirePermission } from "@/components/RequirePermission";
import { CsvImportPanel } from "@/components/CsvImportPanel";
import {
  Card, ErrorBanner, formatDateTime, inputClass, Modal, PageHeader, primaryButtonClass, secondaryButtonClass,
  StatusPill,
} from "@/components/ui";

const PAGE_SIZE = 25;

function EndUsersList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useSession();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  // "Import Citizens" quick action links here with ?import=1
  const [importOpen, setImportOpen] = useState(() => searchParams.get("import") === "1" && can("end_user.import"));
  const debouncedSearch = useDebounced(search.trim());

  const { data, error: loadError, reload } = useApiData(
    () => api.endUsers.list({ search: debouncedSearch || undefined, page, page_size: PAGE_SIZE }),
    [debouncedSearch, page],
  );
  const error = actionError ?? loadError;

  useEffect(() => {
    if (searchParams.get("import")) router.replace("/end-users");
  }, [searchParams, router]);

  const toggleActive = async (row: EndUserRow) => {
    if (!confirm(`${row.is_active ? "Deactivate" : "Reactivate"} ${row.name}?`)) return;
    try {
      await api.endUsers.update(row.id, { is_active: !row.is_active });
      setActionError(null);
      reload();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader
        title="Citizens"
        description="Registered end users who can sign in to the citizen portal with mobile + email + OTP."
        actions={
          <>
            <button
              className={secondaryButtonClass}
              title="Citizens in your scope, in the import format"
              onClick={() => api.endUsers.exportCsv(debouncedSearch || undefined).catch((err: Error) => setActionError(err.message))}
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            {can("end_user.import") && (
              <button className={primaryButtonClass} onClick={() => setImportOpen(true)}>
                <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
              </button>
            )}
          </>
        }
      />
      <input
        className={`${inputClass} max-w-xs`}
        placeholder="Search name, mobile, email or user ID"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      <ErrorBanner message={error} />

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400 uppercase text-[11px] tracking-wider">
              <th className="px-5 py-3 font-semibold">User ID</th>
              <th className="px-3 py-3 font-semibold">Name</th>
              <th className="px-3 py-3 font-semibold">Mobile</th>
              <th className="px-3 py-3 font-semibold">Email</th>
              <th className="px-3 py-3 font-semibold">Location</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Last Login</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {!data ? (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                  No citizens found in your scope.
                </td>
              </tr>
            ) : (
              data.items.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-mono text-[11px] text-slate-500">{row.external_id ?? "—"}</td>
                  <td className="px-3 py-3 font-bold text-slate-800">{row.name}</td>
                  <td className="px-3 py-3 text-slate-600">{row.mobile}</td>
                  <td className="px-3 py-3 text-slate-600">{row.email}</td>
                  <td className="px-3 py-3 text-slate-600">{row.location?.label ?? "—"}</td>
                  <td className="px-3 py-3">
                    <StatusPill active={row.is_active} />
                  </td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(row.last_login_at)}</td>
                  <td className="px-5 py-3 text-right">
                    {can("end_user.update") && (
                      <button
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                        title={row.is_active ? "Deactivate" : "Reactivate"}
                        onClick={() => toggleActive(row)}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
          <span>
            Page {page} of {totalPages} ({data.total} citizens)
          </span>
          <button className={secondaryButtonClass} disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <button className={secondaryButtonClass} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      )}

      {importOpen && (
        <Modal
          title="Import Citizens from CSV"
          description="Rows are matched by user_id (or mobile + email) and updated; new rows are created. Locations must already exist."
          onClose={() => setImportOpen(false)}
          wide
        >
          <CsvImportPanel
            columns={["user_id", "name", "mobile", "email", "country", "state", "district", "city", "area"]}
            sampleRows={[
              ["USR001", "Rahul Sharma", "9876543210", "rahul@example.com", "India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar"],
            ]}
            templateName="citizens-template.csv"
            onImport={api.endUsers.importCsv}
            onDone={reload}
          />
        </Modal>
      )}
    </>
  );
}

export default function EndUsersPage() {
  return (
    <RequirePermission anyOf={["end_user.view"]}>
      <Suspense>
        <EndUsersList />
      </Suspense>
    </RequirePermission>
  );
}
