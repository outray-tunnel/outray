import type { UptimeComponent, UptimePageResponse } from "./uptime-client";

export const INCIDENT_COMPONENT_PAGE_SIZE = 50;
type ComponentRow = { component: UptimeComponent; groupId: string; groupName: string; searchName: string };

export function incidentComponentRows(page?: UptimePageResponse): ComponentRow[] {
  const groups = [
    { id: "standalone", name: "Standalone components", components: page?.standaloneComponents ?? [] },
    ...(page?.groups ?? []),
  ];
  return groups.flatMap((group) => group.components.map((component) => ({
    component, groupId: group.id, groupName: group.name, searchName: component.name.toLowerCase(),
  })));
}

export function incidentComponentWindow(rows: ComponentRow[], search: string, pageIndex: number) {
  const query = search.trim().toLowerCase();
  const matches = query ? rows.filter((row) => row.searchName.includes(query)) : rows;
  const currentPage = Math.max(0, Math.min(pageIndex, Math.ceil(matches.length / INCIDENT_COMPONENT_PAGE_SIZE) - 1));
  const start = currentPage * INCIDENT_COMPONENT_PAGE_SIZE;
  const visible = matches.slice(start, start + INCIDENT_COMPONENT_PAGE_SIZE);
  const groups: Array<{ id: string; name: string; components: UptimeComponent[] }> = [];
  for (const row of visible) {
    const previous = groups[groups.length - 1];
    if (previous?.id === row.groupId) previous.components.push(row.component);
    else groups.push({ id: row.groupId, name: row.groupName, components: [row.component] });
  }
  return { groups, total: matches.length, currentPage, start, end: start + visible.length };
}
