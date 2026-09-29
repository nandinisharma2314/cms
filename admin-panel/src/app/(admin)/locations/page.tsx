"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Download, FileSpreadsheet, Layers, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { api, LocationLevel, LocationNode } from "@/lib/api";
import { useConfig, useDocumentTitle } from "@/lib/config";
import { useAction, useApiData } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { CsvImportPanel } from "@/components/CsvImportPanel";
import { RequirePermission } from "@/components/RequirePermission";
import {
  Card,
  ErrorBanner,
  Field,
  iconButtonClass,
  inputClass,
  Modal,
  PageHeader,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";

type Dialog =
  { kind: "add"; parent: LocationNode | null } | { kind: "rename"; node: LocationNode } | { kind: "import" } | { kind: "levels" };

function countDescendants(node: LocationNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

interface RowActions {
  onAdd: (parent: LocationNode) => void;
  onRename: (node: LocationNode) => void;
  onToggleActive: (node: LocationNode) => void;
  onDelete: (node: LocationNode) => void;
  canCreate: boolean;
  canUpdate: boolean;
  hasChildLevel: (node: LocationNode) => boolean;
}

function TreeRow({
  node,
  depth,
  expanded,
  toggle,
  actions,
}: {
  node: LocationNode;
  depth: number;
  expanded: Set<number>;
  toggle: (id: number) => void;
  actions: RowActions;
}) {
  const open = expanded.has(node.id);
  return (
    <>
      <div
        className={`group flex flex-wrap items-center gap-2 py-1.5 pr-3 rounded-lg hover:bg-slate-50 ${node.is_active ? "" : "opacity-60"}`}
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        <button
          type="button"
          onClick={() => toggle(node.id)}
          className={`w-5 h-5 flex items-center justify-center rounded text-slate-400 ${node.children.length ? "cursor-pointer hover:bg-slate-100" : "invisible"}`}
          aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
          aria-expanded={open}
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <span className="text-xs font-semibold text-slate-800">{node.name}</span>
        <span className="text-[10px] text-slate-400 uppercase tracking-wide">{node.type_name}</span>
        {node.children.length > 0 && <span className="text-[10px] text-slate-400">({countDescendants(node)} below)</span>}
        {!node.is_active && <span className="text-[10px] text-rose-600 font-semibold">inactive</span>}
        <div className="ml-auto flex items-center gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
          {actions.canCreate && actions.hasChildLevel(node) && node.is_active && (
            <button
              className={iconButtonClass}
              aria-label={`Add a location under ${node.name}`}
              title="Add below"
              onClick={() => actions.onAdd(node)}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          {actions.canUpdate && (
            <>
              <button
                className={iconButtonClass}
                aria-label={`Rename ${node.name}`}
                title="Rename"
                onClick={() => actions.onRename(node)}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                className={`${iconButtonClass} hover:text-amber-600 hover:bg-amber-50`}
                aria-label={`${node.is_active ? "Deactivate" : "Reactivate"} ${node.name}`}
                title={node.is_active ? "Deactivate" : "Reactivate"}
                onClick={() => actions.onToggleActive(node)}
              >
                <Power className="w-3.5 h-3.5" />
              </button>
              {node.children.length === 0 && (
                <button
                  className={`${iconButtonClass} hover:text-rose-600 hover:bg-rose-50`}
                  aria-label={`Delete ${node.name}`}
                  title="Delete (only if nothing uses it)"
                  onClick={() => actions.onDelete(node)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {open &&
        node.children.map((child) => (
          <TreeRow key={child.id} node={child} depth={depth + 1} expanded={expanded} toggle={toggle} actions={actions} />
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
  const { limits } = useConfig();
  const [name, setName] = useState(initial);
  const { busy, error, run } = useAction();
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => onSubmit(name));
        }}
      >
        <ErrorBanner message={error} />
        <Field label="Name">
          <input
            required
            maxLength={limits.location_name}
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Location levels, top to bottom. Levels are added below the deepest one; only an unused deepest level can be removed. */
function LevelsDialog({
  levels,
  canUpdate,
  onClose,
  onChanged,
}: {
  levels: LocationLevel[];
  canUpdate: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { limits } = useConfig();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const { busy, error, run } = useAction();
  const deepest = levels[levels.length - 1];

  return (
    <Modal
      title="Location levels"
      description="The levels of the location tree, from the top down (for example country, region, city, area)."
      onClose={onClose}
    >
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <ol className="space-y-1.5">
          {levels.map((level) => (
            <li
              key={level.id}
              className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 text-xs"
              style={{ marginLeft: level.depth * 12 }}
            >
              {renaming?.id === level.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await api.locations.renameLevel(level.id, renaming.name);
                      setRenaming(null);
                      onChanged();
                    });
                  }}
                >
                  <input
                    required
                    maxLength={limits.location_level_name}
                    className={inputClass}
                    value={renaming.name}
                    onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                    aria-label="Level name"
                  />
                  <button type="submit" className={primaryButtonClass} disabled={busy}>
                    Save
                  </button>
                </form>
              ) : (
                <>
                  <span className="font-semibold text-slate-800">{level.name}</span>
                  <span className="font-mono text-[10px] text-slate-400">{level.key}</span>
                  <span className="ml-auto text-[11px] text-slate-500">{level.locations.toLocaleString()} locations</span>
                  {canUpdate && (
                    <button
                      className={iconButtonClass}
                      aria-label={`Rename ${level.name}`}
                      onClick={() => setRenaming({ id: level.id, name: level.name })}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canUpdate && level.id === deepest?.id && level.locations === 0 && (
                    <button
                      className={`${iconButtonClass} hover:text-rose-600 hover:bg-rose-50`}
                      aria-label={`Remove ${level.name}`}
                      onClick={() =>
                        confirm(`Remove the ${level.name} level?`) &&
                        run(async () => {
                          await api.locations.removeLevel(level.id);
                          onChanged();
                        })
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
          {levels.length === 0 && <li className="text-xs text-slate-400">No levels yet. Add the top level first.</li>}
        </ol>
        {canUpdate && (
          <form
            className="flex flex-wrap items-end gap-2 pt-3 border-t border-slate-100"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api.locations.addLevel(key, name);
                setKey("");
                setName("");
                onChanged();
              });
            }}
          >
            <div className="flex-1 min-w-35">
              <Field label={levels.length ? `New level below ${deepest.name}` : "Top level"}>
                <input
                  required
                  maxLength={limits.location_level_name}
                  className={inputClass}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    // A suggestion for the key (lowercase letters, digits and _, starting with a letter).
                    setKey(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "_")
                        .replace(/^[^a-z]+/, "")
                        .slice(0, limits.location_level_key)
                        .replace(/_+$/, ""),
                    );
                  }}
                />
              </Field>
            </div>
            <div className="w-36">
              <Field label="Key (CSV column)">
                <input
                  required
                  maxLength={limits.location_level_key}
                  className={inputClass}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
              </Field>
            </div>
            <button type="submit" className={secondaryButtonClass} disabled={busy}>
              <Plus className="w-3.5 h-3.5" /> Add level
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
}

function LocationsTree() {
  useDocumentTitle("Locations");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useSession();
  // null = not touched yet: the first two levels start open
  const [expandedState, setExpanded] = useState<Set<number> | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  // The "Import locations" quick action links here with ?import=1
  const [dialog, setDialog] = useState<Dialog | null>(() =>
    searchParams.get("import") === "1" && can("location.import") ? { kind: "import" } : null,
  );
  const { error: actionError, run } = useAction();
  const {
    data,
    error: loadError,
    reload,
  } = useApiData(async () => {
    const [tree, levels] = await Promise.all([api.locations.tree(showInactive), api.locations.levels()]);
    return { tree, levels };
  }, [showInactive]);
  const tree = data?.tree ?? [];
  const levels = data?.levels ?? [];
  const expanded = expandedState ?? new Set(tree.flatMap((n) => [n.id, ...n.children.map((c) => c.id)]));

  useEffect(() => {
    if (searchParams.get("import")) router.replace("/locations");
  }, [searchParams, router]);

  const depthOf = new Map(levels.map((l) => [l.key, l.depth]));
  const maxDepth = levels.length ? levels[levels.length - 1].depth : -1;
  const hasChildLevel = (node: LocationNode) => {
    const depth = depthOf.get(node.type);
    return depth !== undefined && depth < maxDepth;
  };

  const toggle = (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const actions: RowActions = {
    onAdd: (parent) => setDialog({ kind: "add", parent }),
    onRename: (node) => setDialog({ kind: "rename", node }),
    onToggleActive: (node) => {
      const text = node.is_active
        ? `Deactivate ${node.name}? Everything below it is closed too: no new complaints, staff scopes or end users there.`
        : `Reactivate ${node.name}?`;
      if (confirm(text))
        run(async () => {
          await api.locations.update(node.id, { is_active: !node.is_active });
          reload();
        });
    },
    onDelete: (node) => {
      if (confirm(`Delete ${node.name}? Only possible when no complaint, end user or staff scope uses it.`))
        run(async () => {
          await api.locations.remove(node.id);
          reload();
        });
    },
    canCreate: can("location.create"),
    canUpdate: can("location.update"),
    hasChildLevel,
  };

  return (
    <>
      <PageHeader
        title="Locations"
        description={
          levels.length
            ? `Levels: ${levels.map((l) => l.name).join(" → ")}. Staff scopes and complaint routing follow this tree.`
            : "Define the location levels first."
        }
        actions={
          <>
            <button className={secondaryButtonClass} onClick={() => setDialog({ kind: "levels" })}>
              <Layers className="w-3.5 h-3.5" /> Levels
            </button>
            <button
              className={secondaryButtonClass}
              onClick={() => run(() => api.locations.exportCsv(showInactive))}
              disabled={levels.length === 0}
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            {can("location.import") && (
              <button
                className={secondaryButtonClass}
                onClick={() => setDialog({ kind: "import" })}
                disabled={levels.length === 0}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
              </button>
            )}
            {can("location.create") && levels.length > 0 && (
              <button className={primaryButtonClass} onClick={() => setDialog({ kind: "add", parent: null })}>
                <Plus className="w-3.5 h-3.5" /> Add {levels[0].name.toLowerCase()}
              </button>
            )}
          </>
        }
      />
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        Show inactive locations
      </label>
      <ErrorBanner message={actionError ?? loadError} />
      <Card className="p-3">
        {!data ? (
          <p className="text-xs text-slate-400 p-6 text-center">
            {loadError ? "The locations could not be loaded (see the message above)." : "Loading…"}
          </p>
        ) : tree.length === 0 ? (
          <p className="text-xs text-slate-400 p-6 text-center">
            {levels.length
              ? "No locations yet. Add them one by one or import a CSV."
              : "Set up the location levels (Levels) before adding locations."}
          </p>
        ) : (
          tree.map((node) => (
            <TreeRow key={node.id} node={node} depth={0} expanded={expanded} toggle={toggle} actions={actions} />
          ))
        )}
      </Card>

      {dialog?.kind === "add" && (
        <NameDialog
          title={dialog.parent ? `Add a location under ${dialog.parent.name}` : `Add a ${levels[0]?.name.toLowerCase()}`}
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
      {dialog?.kind === "levels" && (
        <LevelsDialog levels={levels} canUpdate={can("location.update")} onClose={() => setDialog(null)} onChanged={reload} />
      )}
      {dialog?.kind === "import" && (
        <Modal
          title="Import locations"
          description="One path per row, from the top level down. Existing locations are reused; missing ones are created."
          onClose={() => setDialog(null)}
          wide
        >
          <CsvImportPanel
            columns={levels.map((l) => l.key)}
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
