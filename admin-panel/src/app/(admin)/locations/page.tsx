"use client";

import React, { Suspense, useCallback, useContext, useEffect, useState } from "react";
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



interface RowActions {
  onAdd: (parent: LocationNode) => void;
  onRename: (node: LocationNode) => void;
  onToggleActive: (node: LocationNode) => void;
  onDelete: (node: LocationNode) => void;
  canCreate: boolean;
  canUpdate: boolean;
  hasChildLevel: (node: LocationNode) => boolean;
  fetchNodes: (parentId: number | null) => Promise<LocationNode[]>;
}


// Context that lets sibling TreeRows close each other.
// Key = `${depth}-${parentId ?? 'root'}`, value = currently-open node id (or null).
type AccordionCtx = {
  openMap: Record<string, number | null>;
  setOpen: (key: string, id: number | null) => void;
};
const AccordionContext = React.createContext<AccordionCtx>({
  openMap: {},
  setOpen: () => {},
});

function TreeRow({
  node,
  depth,
  parentId,
  actions,
  forceReload,
}: {
  node: LocationNode;
  depth: number;
  parentId: number | null;
  actions: RowActions;
  forceReload: number;
}) {
  const { openMap, setOpen } = useContext(AccordionContext);
  const groupKey = `${depth}-${parentId ?? 'root'}`;
  const expanded = openMap[groupKey] === node.id;
  const [children, setChildren] = useState<LocationNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const hasChildren = actions.hasChildLevel(node);

  const toggle = useCallback(() => {
    setOpen(groupKey, expanded ? null : node.id);
  }, [expanded, groupKey, node.id, setOpen]);

  useEffect(() => {
    let active = true;
    let t: ReturnType<typeof setTimeout>;
    if (expanded) {
      t = setTimeout(() => {
        if (active) setLoading(true);
      }, 0);
      actions.fetchNodes(node.id).then(data => {
        if (active) {
          setChildren(data);
          setLoading(false);
        }
      });
    }
    return () => {
      active = false;
      if (t) clearTimeout(t);
    };
  }, [expanded, forceReload, node.id, actions]);

  return (
    <>
      <div
        className={`group flex flex-wrap items-center gap-2 py-1.5 pr-3 rounded-lg hover:bg-slate-50 ${node.is_active ? "" : "opacity-60"}`}
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        <button
          type="button"
          onClick={toggle}
          className={`w-5 h-5 flex items-center justify-center rounded text-slate-400 ${hasChildren ? "cursor-pointer hover:bg-slate-100" : "invisible"}`}
          aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          aria-expanded={expanded}
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
        <span className="text-xs font-semibold text-slate-800">{node.name}</span>
        <span className="text-[10px] text-slate-400 uppercase tracking-wide">{node.type_name}</span>
        {loading && <span className="text-[10px] text-slate-400">Loading...</span>}
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
              <button
                className={`${iconButtonClass} hover:text-rose-600 hover:bg-rose-50`}
                aria-label={`Delete ${node.name}`}
                title="Delete (if unused)"
                onClick={() => actions.onDelete(node)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      {expanded && children &&
        children.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            parentId={node.id}
            actions={actions}
            forceReload={forceReload}
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
  const [showInactive, setShowInactive] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(() =>
    searchParams.get("import") === "1" && can("location.import") ? { kind: "import" } : null,
  );
  const { error: actionError, run } = useAction();
  const [forceReload, setForceReload] = useState(0);

  // Accordion state: one open node per sibling group.
  const [openMap, setOpenMap] = useState<Record<string, number | null>>({});
  const accordionCtx: AccordionCtx = {
    openMap,
    setOpen: useCallback((key: string, id: number | null) => {
      setOpenMap(prev => ({ ...prev, [key]: id }));
    }, []),
  };

  const {
    data,
    error: loadError,
  } = useApiData(async () => {
    const [tree, levels] = await Promise.all([api.locations.nodes(null, showInactive), api.locations.levels()]);
    return { tree, levels };
  }, [showInactive, forceReload]);
  const tree = data?.tree ?? [];
  const levels = data?.levels ?? [];

  useEffect(() => {
    if (searchParams.get("import")) router.replace("/locations");
  }, [searchParams, router]);

  const hasChildLevel = (node: LocationNode) => {
    const currentIdx = levels.findIndex((l) => l.key === node.type);
    return currentIdx !== -1 && currentIdx < levels.length - 1;
  };

  const actions: RowActions = {
    onAdd: (parent) => setDialog({ kind: "add", parent }),
    onRename: (node) => setDialog({ kind: "rename", node }),
    onToggleActive: (node) => {
      const action = node.is_active ? "Deactivate" : "Reactivate";
      if (!confirm(`${action} ${node.name}?
Children will be hidden while inactive.`)) return;
      run(async () => {
        await api.locations.update(node.id, { is_active: !node.is_active });
        setForceReload(prev => prev + 1);
      });
    },
    onDelete: (node) => {
      if (!confirm(`Delete ${node.name}? This cannot be undone.`)) return;
      run(async () => {
        await api.locations.remove(node.id);
        setForceReload(prev => prev + 1);
      });
    },
    canCreate: can("location.create"),
    canUpdate: can("location.update"),
    hasChildLevel,
    fetchNodes: (parentId) => api.locations.nodes(parentId, showInactive),
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
            {loadError ? "The locations could not be loaded (see the message above)." : "Loading..."}
          </p>
        ) : tree.length === 0 ? (
          <p className="text-xs text-slate-400 p-6 text-center">
            {levels.length
              ? "No locations yet. Add them one by one or import a CSV."
              : "Set up the location levels (Levels) before adding locations."}
          </p>
        ) : (
          <AccordionContext.Provider value={accordionCtx}>
            {tree.map((node) => (
              <TreeRow key={node.id} node={node} depth={0} parentId={null} actions={actions} forceReload={forceReload} />
            ))}
          </AccordionContext.Provider>
        )}
      </Card>

      {dialog?.kind === "add" && (
        <NameDialog
          title={dialog.parent ? `Add a location under ${dialog.parent.name}` : `Add a ${levels[0]?.name.toLowerCase()}`}
          initial=""
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await api.locations.create(name, dialog.parent?.id ?? null);
            setForceReload(prev => prev + 1);
            setDialog(null);
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
            setForceReload(prev => prev + 1);
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "levels" && (
        <LevelsDialog levels={levels} canUpdate={can("location.update")} onClose={() => setDialog(null)} onChanged={() => setForceReload(prev => prev + 1)} />
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
            onDone={() => setForceReload(prev => prev + 1)}
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
