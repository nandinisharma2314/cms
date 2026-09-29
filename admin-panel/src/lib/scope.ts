import { LocationNode, Me } from "./api";

/**
 * The part of the location tree the user covers for `departmentId`: covered
 * subtrees plus their ancestors (so the tree can still be walked down to them).
 * The API checks the final choice again; this only keeps the forms from
 * offering places that would be refused.
 */
export function treeInScope(tree: LocationNode[], me: Me, departmentId: number | null): LocationNode[] {
  if (me.is_super_admin) return tree;
  const relevant = me.scopes.filter((s) => s.department === null || s.department.id === departmentId);
  if (relevant.some((s) => s.location === null)) return tree;
  const covered = new Set(relevant.map((s) => s.location!.id));
  const onPath = new Set(relevant.flatMap((s) => s.location!.path_ids));

  const prune = (nodes: LocationNode[], inside: boolean): LocationNode[] =>
    nodes.flatMap((node) => {
      const nowInside = inside || covered.has(node.id);
      if (!nowInside && !onPath.has(node.id)) return [];
      return [{ ...node, children: prune(node.children, nowInside) }];
    });
  return prune(tree, false);
}

/** Departments the user covers somewhere (all of them with an "all departments" scope). */
export function coversDepartment(me: Me, departmentId: number): boolean {
  return me.is_super_admin || me.scopes.some((s) => s.department === null || s.department.id === departmentId);
}
