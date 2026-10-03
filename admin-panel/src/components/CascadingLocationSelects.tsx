import React, { useMemo } from "react";
import { LocationNode } from "@/lib/api";
import { inputClass } from "@/components/ui";

export function findNodePath(nodes: LocationNode[], targetId: number, currentPath: LocationNode[] = []): LocationNode[] | null {
  for (const node of nodes) {
    const path = [...currentPath, node];
    if (node.id === targetId) return path;
    if (node.children?.length) {
      const found = findNodePath(node.children, targetId, path);
      if (found) return found;
    }
  }
  return null;
}

export function CascadingLocationSelects({
  tree,
  locationId,
  onChange,
}: {
  tree: LocationNode[];
  locationId: number | null;
  onChange: (id: number | null) => void;
}) {
  const activeLocationPath = useMemo(() => {
    if (!locationId || !tree.length) return null;
    return findNodePath(tree, locationId);
  }, [tree, locationId]);

  const locationLevels = useMemo(() => {
    if (!tree.length) return [];
    const levels: {
      depth: number;
      label: string;
      nodes: LocationNode[];
      selectedId: number | null;
    }[] = [];

    let currentNodes: LocationNode[] = tree;
    let depth = 0;

    while (currentNodes && currentNodes.length > 0) {
      const selectedNode = activeLocationPath && activeLocationPath[depth] ? activeLocationPath[depth] : null;
      const typeLabel = currentNodes[0]?.type_name || (depth === 0 ? "Country" : depth === 1 ? "State" : depth === 2 ? "District" : depth === 3 ? "City" : "Area");

      levels.push({
        depth,
        label: typeLabel,
        nodes: currentNodes,
        selectedId: selectedNode ? selectedNode.id : null,
      });

      if (selectedNode && selectedNode.children?.length) {
        currentNodes = selectedNode.children;
        depth++;
      } else {
        break;
      }
    }
    return levels;
  }, [tree, activeLocationPath]);

  const handleLocationChange = (depth: number, newIdStr: string) => {
    if (!newIdStr) {
      if (depth === 0) {
        onChange(null);
      } else {
        const parentNode = activeLocationPath?.[depth - 1];
        onChange(parentNode ? parentNode.id : null);
      }
    } else {
      onChange(Number(newIdStr));
    }
  };

  return (
    <>
      {locationLevels.map((lvl) => (
        <select
          key={lvl.depth}
          aria-label={lvl.label}
          className={`${inputClass} max-w-36`}
          value={lvl.selectedId ? String(lvl.selectedId) : ""}
          onChange={(e) => handleLocationChange(lvl.depth, e.target.value)}
        >
          <option value="">All {lvl.label}s</option>
          {lvl.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      ))}
    </>
  );
}
