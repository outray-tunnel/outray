import type { Domain, Subdomain } from "@/lib/app-client";

export type DomainStatusFilter = "all" | Domain["status"];

export const domainStatusOptions = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending DNS" },
  { value: "failed", label: "Needs attention" },
];

export function isDomainStatusFilter(
  value: string,
): value is DomainStatusFilter {
  return domainStatusOptions.some((option) => option.value === value);
}

export function filterSubdomains(
  items: Subdomain[],
  search: string,
): Subdomain[] {
  const query = search.trim().toLowerCase();
  return query
    ? items.filter((item) =>
        `${item.subdomain}.outray.app`.toLowerCase().includes(query),
      )
    : items;
}

export function filterDomains(
  items: Domain[],
  search: string,
  status: DomainStatusFilter,
): Domain[] {
  const query = search.trim().toLowerCase();
  return items.filter(
    (item) =>
      (!query || item.domain.toLowerCase().includes(query)) &&
      (status === "all" || item.status === status),
  );
}

/** The client returns API errors as values; mutations must reject before closing a dialog. */
export function requireAddressResult<T extends object>(
  result: T,
): Exclude<T, { error: string }> {
  if ("error" in result) throw new Error(String(result.error));
  return result as Exclude<T, { error: string }>;
}
