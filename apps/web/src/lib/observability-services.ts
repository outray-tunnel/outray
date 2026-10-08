import { queryTinybird } from "./tinybird";

interface ObservabilityServiceNameRow {
  service: string;
}

interface TraceServiceNameRow {
  name: string;
}

const SERVICE_INVENTORY_HOURS = 30 * 24;
const defaultServiceNamesTtlMs = 5 * 60_000;
const serviceNamesCache = new Map<
  string,
  {
    value: string[];
    expiresAt: number;
    refresh?: Promise<void>;
  }
>();

function serviceNamesTtlMs() {
  const configured = Number(
    process.env.OBSERVABILITY_SERVICE_NAMES_CACHE_TTL_MS,
  );
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : defaultServiceNamesTtlMs;
}

function refreshServiceNames(
  organizationId: string,
  entry: {
    value: string[];
    expiresAt: number;
    refresh?: Promise<void>;
  },
) {
  if (entry.refresh) return;

  entry.refresh = loadServiceNames(organizationId)
    .then((names) => {
      entry.value = names;
      entry.expiresAt = Date.now() + serviceNamesTtlMs();
    })
    .catch(() => {
      // Service names are filter metadata. Keep the primary observability
      // response available if this ancillary query is temporarily slow.
      entry.expiresAt = Date.now() + 5_000;
    })
    .finally(() => {
      entry.refresh = undefined;
    });
}

/**
 * Return the stable service inventory used by observability filters. The
 * selected page range filters results, not which known services are selectable.
 */
export async function queryObservabilityServiceNames(
  organizationId: string,
): Promise<string[]> {
  let entry = serviceNamesCache.get(organizationId);
  if (!entry) {
    entry = { value: [], expiresAt: 0 };
    serviceNamesCache.set(organizationId, entry);
  }

  // This metadata is not on the critical path for the data response. Return
  // the last known inventory immediately and refresh it asynchronously.
  if (entry.expiresAt <= Date.now()) refreshServiceNames(organizationId, entry);
  return entry.value;
}

async function loadServiceNames(organizationId: string): Promise<string[]> {
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
