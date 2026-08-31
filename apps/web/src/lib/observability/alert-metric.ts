import { queryTinybird } from "@/lib/tinybird";
import type { AlertConfig } from "./alert-validation";

interface MetricCatalogRow {
  metric_key: string;
  name: string;
  unit: string;
  type: string;
  aggregation_temporality: number | string;
  is_monotonic: number | boolean;
}

export async function metricIdentityExists(
  organizationId: string,
  config: AlertConfig,
) {
  if (config.signal !== "metric_value") return true;

  const rows = await queryTinybird<MetricCatalogRow>("metric_catalog", {
    organization_id: organizationId,
    hours: 720,
    service: config.service,
    search: config.metricName,
    limit: 500,
  });
  const row = rows.find((item) => item.metric_key === config.metricKey);
  if (!row) return false;

  return (
    row.name === config.metricName &&
    row.type === config.metricType &&
    row.unit === (config.metricUnit ?? "") &&
    normalizeTemporality(row.aggregation_temporality) ===
      config.aggregationTemporality &&
    Boolean(Number(row.is_monotonic)) === config.isMonotonic
  );
}

function normalizeTemporality(value: number | string) {
  const numeric = Number(value);
  if (numeric === 1 || String(value).toLowerCase() === "delta") return "delta";
  if (numeric === 2 || String(value).toLowerCase() === "cumulative")
    return "cumulative";
  return "unspecified";
}
