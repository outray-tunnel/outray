import { queryTinybird } from "./tinybird";

interface ObservabilityServiceNameRow {
  service: string;
}

interface TraceServiceNameRow {
  name: string;
}

const SERVICE_INVENTORY_HOURS = 30 * 24;

/**
 * Return the stable service inventory used by observability filters. The
 * selected page range filters results, not which known services are selectable.
 */
export async function queryObservabilityServiceNames(
  organizationId: string,
): Promise<string[]> {
  let names: string[];
  try {
    const rows = await queryTinybird<ObservabilityServiceNameRow>(
      "service_names",
      {
        organization_id: organizationId,
        hours: SERVICE_INVENTORY_HOURS,
        limit: 250,
      },
    );
    names = rows.map((row) => row.service);
  } catch {
    // Keep web deploys compatible while the union endpoint rolls out. The
    // trace catalog is the closest existing inventory and uses the same window.
    const rows = await queryTinybird<TraceServiceNameRow>("service_catalog", {
      organization_id: organizationId,
      hours: SERVICE_INVENTORY_HOURS,
      limit: 250,
    });
    names = rows.map((row) => row.name);
  }

  return Array.from(
    new Set(names.map((name) => name.trim()).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));
}
