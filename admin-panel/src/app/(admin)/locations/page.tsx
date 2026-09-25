"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Download, FileSpreadsheet, Pencil, Plus, Power } from "lucide-react";
import { api, LocationNode, LocationType } from "@/lib/api";
import { useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { RequirePermission } from "@/components/RequirePermission";
import { CsvImportPanel } from "@/components/CsvImportPanel";
import {
  Card, ErrorBanner, Field, inputClass, Modal, PageHeader, primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";

type Dialog =
  | { kind: "add"; parent: LocationNode | null }
  | { kind: "rename"; node: LocationNode }
  | { kind: "import" };

function countDescendants(node: LocationNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function TreeRow({
  node,
  depth,
  expanded,
  toggle,
  onAdd,
  onRename,
  onToggleActive,
  canCreate,
  canUpdate,
  hasChildLevel,
}: {
  node: LocationNode;
  depth: number;
  expanded: Set<number>;
  toggle: (id: number) => void;
  onAdd: (parent: LocationNode) => void;
  onRename: (node: LocationNode) => void;
  onToggleActive: (node: LocationNode) => void;
  canCreate: boolean;
  canUpdate: boolean;
  hasChildLevel: (node: LocationNode) => boolean;
}) {
  const open = expanded.has(node.id);
  return (
    <>
      <div
        className={`group flex items-center gap-2 py-1.5 pr-3 rounded-lg hover:bg-slate-50 ${node.is_active ? "" : "opacity-50"}`}
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        <button
          type="button"
          onClick={() => toggle(node.id)}
          className={`w-5 h-5 flex items-center justify-center rounded text-slate-400 ${node.children.length ? "cursor-pointer hover:bg-slate-100" : "invisible"}`}
          aria-label={open ? "Collapse" : "Expand"}
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <span className="text-xs font-semibold text-slate-800">{node.name}</span>
        <span className="text-[10px] text-slate-400 uppercase tracking-wide">{node.type_name}</span>
        {node.children.length > 0 && (
          <span className="text-[10px] text-slate-400">({countDescendants(node)} below)</span>
        )}
        {!node.is_active && <span className="text-[10px] text-rose-500 font-semibold">inactive</span>}
        <div className="ml-auto hidden group-hover:flex items-center gap-1">
          {canCreate && hasChildLevel(node) && (
            <button className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer" title="Add child" onClick={() => onAdd(node)}>
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          {canUpdate && (
            <>
              <button className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer" title="Rename" onClick={() => onRename(node)}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                title={node.is_active ? "Deactivate" : "Reactivate"}
                onClick={() => onToggleActive(node)}
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      {open &&
        node.children.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            onAdd={onAdd}
            onRename={onRename}
            onToggleActive={onToggleActive}
            canCreate={canCreate}
            canUpdate={canUpdate}
            hasChildLevel={hasChildLevel}
          />
        ))}
    </>
  );
}

function NameDialog({
  title,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await onSubmit(name);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <ErrorBanner message={error} />
        <Field label="Name">
          <input required autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButtonClass}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LocationsTree() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useSession();
  // null = not touched yet: the first two levels start open
  const [expandedState, setExpanded] = useState<Set<number> | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  // "Import Locations" quick action links here with ?import=1
  const [dialog, setDialog] = useState<Dialog | null>(() =>
    searchParams.get("import") === "1" && can("location.import") ? { kind: "import" } : null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, error: loadError, reload } = useApiData(
    async () => {
      const [tree, types] = await Promise.all([api.locations.tree(showInactive), api.locations.types()]);
      return { tree, types };
    },
    [showInactive],
  );
  const tree: LocationNode[] = data?.tree ?? [];
  const types: LocationType[] = data?.types ?? [];
  const error = actionError ?? loadError;
  const expanded = expandedState ?? new Set(tree.flatMap((n) => [n.id, ...n.children.map((c) => c.id)]));

  useEffect(() => {
    if (searchParams.get("import")) router.replace("/locations");
  }, [searchParams, router]);

  const typeDepth = new Map(types.map((t) => [t.key, t.depth]));
  const maxDepth = types.length ? Math.max(...types.map((t) => t.depth)) : 0;
  const hasChildLevel = (node: LocationNode) => (typeDepth.get(node.type) ?? maxDepth) < maxDepth;

  const toggle = (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const toggleActive = async (node: LocationNode) => {
    if (!confirm(`${node.is_active ? "Deactivate" : "Reactivate"} ${node.name}? Locations below it are hidden with it.`)) return;
    try {
      await api.locations.update(node.id, { is_active: !node.is_active });
      setActionError(null);
      reload();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title="Locations"
        description={`Hierarchy: ${types.map((t) => t.name).join(" → ") || "…"}. Staff scopes and complaint routing use this tree.`}
        actions={
          <>
            <button
              className={secondaryButtonClass}
              title="Every path to a leaf location, in the import format"
              onClick={() => api.locations.exportCsv().catch((err: Error) => setActionError(err.message))}
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            {can("location.import") && (
              <button className={secondaryButtonClass} onClick={() => setDialog({ kind: "import" })}>
                <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
              </button>
            )}
            {can("location.create") && (
              <button className={primaryButtonClass} onClick={() => setDialog({ kind: "add", parent: null })}>
                <Plus className="w-3.5 h-3.5" /> Add {types[0]?.name ?? "Location"}
              </button>
            )}
          </>
        }
      />
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        Show inactive locations
      </label>
      <ErrorBanner message={error} />
      <Card className="p-3">
        {tree.length === 0 ? (
          <p className="text-xs text-slate-400 p-6 text-center">No locations yet. Import a CSV to build the tree.</p>
        ) : (
          tree.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              toggle={toggle}
              onAdd={(parent) => setDialog({ kind: "add", parent })}
              onRename={(n) => setDialog({ kind: "rename", node: n })}
              onToggleActive={toggleActive}
              canCreate={can("location.create")}
              canUpdate={can("location.update")}
              hasChildLevel={hasChildLevel}
            />
          ))
        )}
      </Card>

      {dialog?.kind === "add" && (
        <NameDialog
          title={dialog.parent ? `Add location under ${dialog.parent.name}` : `Add ${types[0]?.name ?? "location"}`}
          initial=""
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await api.locations.create(name, dialog.parent?.id ?? null);
            if (dialog.parent) setExpanded(new Set(expanded).add(dialog.parent.id));
            setDialog(null);
            reload();
          }}
        />
      )}
      {dialog?.kind === "rename" && (
        <NameDialog
          title={`Rename ${dialog.node.name}`}
          initial={dialog.node.name}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await api.locations.update(dialog.node.id, { name });
            setDialog(null);
            reload();
          }}
        />
      )}
      {dialog?.kind === "import" && (
        <Modal
          title="Import Location Hierarchy"
          description="Each row is a path from the top level down. Existing locations are reused; missing ones are created."
          onClose={() => setDialog(null)}
          wide
        >
          <CsvImportPanel
            columns={types.map((t) => t.key)}
            sampleRows={[
              ["India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar"],
              ["India", "Rajasthan", "Jaipur", "Jaipur", "Vaishali Nagar"],
            ]}
            templateName="locations-template.csv"
            onImport={api.locations.importCsv}
            onDone={reload}
          />
        </Modal>
      )}
    </>
  );
}

export default function LocationsPage() {
  return (
    <RequirePermission anyOf={["location.view"]}>
      <Suspense>
        <LocationsTree />
      </Suspense>
    </RequirePermission>
  );
}
