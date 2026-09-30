export interface StatusLayout {
  root: string[];
  groups: Record<string, string[]>;
}

export interface StatusLayoutPlan {
  groups: Array<{ id: string; sortOrder: number }>;
  components: Array<{ id: string; groupId: string | null; sortOrder: number }>;
}

export function moveStatusLayout(
  layout: StatusLayout,
  itemId: string,
  from: string,
  to: string,
  index: number,
): StatusLayout | null {
  if (itemId.startsWith("group:") && (from !== "root" || to !== "root")) return null;
  const source = from === "root" ? layout.root : layout.groups[from];
  const destination = to === "root" ? layout.root : layout.groups[to];
  if (!source || !destination || !source.includes(itemId)) return null;
  const next: StatusLayout = {
    root: [...layout.root],
    groups: Object.fromEntries(Object.entries(layout.groups).map(([id, items]) => [id, [...items]])),
  };
  const nextSource = from === "root" ? next.root : next.groups[from];
  const nextDestination = to === "root" ? next.root : next.groups[to];
  nextSource.splice(nextSource.indexOf(itemId), 1);
  nextDestination.splice(Math.max(0, Math.min(index, nextDestination.length)), 0, itemId);
  return next;
}

export function planStatusLayout(
  input: unknown,
  groupIds: string[],
  componentIds: string[],
): StatusLayoutPlan | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const { root, groups } = input as Partial<StatusLayout>;
  if (!Array.isArray(root) || !groups || typeof groups !== "object" || Array.isArray(groups)) return null;
  if (root.some((item) => typeof item !== "string")) return null;
  const expectedGroups = new Set(groupIds);
  const expectedComponents = new Set(componentIds);
  if (Object.keys(groups).length !== expectedGroups.size) return null;
  if (Object.keys(groups).some((id) => !expectedGroups.has(id) || !Array.isArray(groups[id]))) return null;

  const seenGroups = new Set<string>();
  const seenComponents = new Set<string>();
  const groupPlan: StatusLayoutPlan["groups"] = [];
  const componentPlan: StatusLayoutPlan["components"] = [];
  for (const [index, item] of root.entries()) {
    if (item.startsWith("group:")) {
      const id = item.slice(6);
      if (!expectedGroups.has(id) || seenGroups.has(id)) return null;
      seenGroups.add(id);
      groupPlan.push({ id, sortOrder: index });
    } else if (item.startsWith("component:")) {
      const id = item.slice(10);
      if (!expectedComponents.has(id) || seenComponents.has(id)) return null;
      seenComponents.add(id);
      componentPlan.push({ id, groupId: null, sortOrder: index });
    } else return null;
  }
  for (const groupId of groupIds) {
    const items = groups[groupId];
    if (!Array.isArray(items) || items.some((item) => typeof item !== "string")) return null;
    for (const [index, item] of items.entries()) {
      if (!item.startsWith("component:")) return null;
      const id = item.slice(10);
      if (!expectedComponents.has(id) || seenComponents.has(id)) return null;
      seenComponents.add(id);
      componentPlan.push({ id, groupId, sortOrder: index });
    }
  }
  if (seenGroups.size !== expectedGroups.size || seenComponents.size !== expectedComponents.size) return null;
  return { groups: groupPlan, components: componentPlan };
}
