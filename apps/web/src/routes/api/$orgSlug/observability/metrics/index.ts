import { createFileRoute } from "@tanstack/react-router";
import { requireOrgFromSlug } from "@/lib/org";
import { queryTinybird } from "@/lib/tinybird";

interface MetricCatalogRow {
  metric_key: string;
  name: string;
  description: string;
  unit: string;
  type: string;
  aggregation_temporality: number | string;
  is_monotonic: number | boolean;
  first_seen: string;
  last_seen: string;
  data_point_count: number;
  service_count: number;
  services: string[];
  dimensions: string[];
}

interface MetricSeriesRow {
  timestamp: string;
  type: string;
  value: number | null;
  count: number;
  aggregation: string;
}

interface MetricServiceRow {
  service: string;
  type: string;
  value: number | null;
  count: number;
  last_seen: string;
  aggregation: string;
}

const RANGE_HOURS: Record<string, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 168,
  "30d": 720,
};

const RANGE_INTERVAL_SECONDS: Record<string, number> = {
  "1h": 60,
  "6h": 300,
  "24h": 900,
  "7d": 3600,
  "30d": 14400,
};

export const Route = createFileRoute("/api/$orgSlug/observability/metrics/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;

        const url = new URL(request.url);
        const requestedRange = url.searchParams.get("range") || "1h";
        const range = RANGE_HOURS[requestedRange] ? requestedRange : "1h";
        const hours = RANGE_HOURS[range];
        const requestedMetricKey = url.searchParams.get("metric_key")?.trim();
        const service = url.searchParams.get("service")?.trim() || undefined;
        const organizationId = orgResult.organization.id;

        try {
          const catalog = await queryTinybird<MetricCatalogRow>(
            "metric_catalog",
            {
              organization_id: organizationId,
              hours,
              limit: 500,
            },
          );
          const selectedRow =
            catalog.find((item) => item.metric_key === requestedMetricKey) ||
            catalog[0];

          if (!selectedRow) {
            return Response.json({
              metrics: [],
              selectedMetric: null,
              services: [],
              points: [],
              breakdown: [],
              range,
            });
          }

          const selectedTemporality = temporalityCode(
            selectedRow.aggregation_temporality,
          );

          const [series, serviceBreakdown] = await Promise.all([
            queryTinybird<MetricSeriesRow>("metric_series", {
              organization_id: organizationId,
              metric_name: selectedRow.name,
              hours,
              interval_seconds: RANGE_INTERVAL_SECONDS[range],
              service: service === "all" ? undefined : service,
              metric_type: selectedRow.type,
              metric_unit: selectedRow.unit || "__outray_empty__",
              aggregation_temporality: selectedTemporality,
              is_monotonic: Number(Boolean(Number(selectedRow.is_monotonic))),
            }),
            queryTinybird<MetricServiceRow>("metric_service_breakdown", {
              organization_id: organizationId,
              metric_name: selectedRow.name,
              hours,
              limit: 250,
              metric_type: selectedRow.type,
              metric_unit: selectedRow.unit || "__outray_empty__",
              aggregation_temporality: selectedTemporality,
              is_monotonic: Number(Boolean(Number(selectedRow.is_monotonic))),
            }),
          ]);

          const metrics = catalog.map(mapCatalogRow);
          const breakdown = serviceBreakdown
            .filter((item) => isFiniteMetricValue(item.value))
            .map((item) => ({
              service: item.service || "unknown-service",
              type: item.type,
              value: Number(item.value),
              sampleCount: Number(item.count),
              lastSeen: item.last_seen,
              aggregation: item.aggregation,
            }));

          return Response.json({
            metrics,
            selectedMetric:
              metrics.find((item) => item.key === selectedRow.metric_key) ||
              null,
            services: breakdown.map((item) => item.service),
            points: series
              .filter((item) => isFiniteMetricValue(item.value))
              .map((item) => ({
                timestamp: item.timestamp,
                type: item.type,
                value: Number(item.value),
                sampleCount: Number(item.count),
                aggregation: item.aggregation,
              })),
            breakdown,
            range,
          });
        } catch (error) {
          console.error("Failed to query observability metrics", error);
          return Response.json(
            { error: "Metric data is temporarily unavailable" },
            { status: 503 },
          );
        }
      },
    },
  },
});

function mapCatalogRow(metric: MetricCatalogRow) {
  return {
    key: metric.metric_key,
    name: metric.name,
    description: metric.description,
    unit: metric.unit,
    type: metric.type,
    aggregationTemporality: normalizeTemporality(
      metric.aggregation_temporality,
    ),
    isMonotonic: Boolean(Number(metric.is_monotonic)),
    firstSeen: metric.first_seen,
    lastSeen: metric.last_seen,
    dataPointCount: Number(metric.data_point_count),
    serviceCount: Number(metric.service_count),
    dimensions: Array.isArray(metric.dimensions) ? metric.dimensions : [],
  };
}

function normalizeTemporality(value: number | string) {
  const numericValue = temporalityCode(value);
  if (numericValue === 1) return "delta";
  if (numericValue === 2) return "cumulative";
  return typeof value === "string" && Number.isNaN(numericValue)
    ? value
    : "unspecified";
}

function temporalityCode(value: number | string) {
  const numericValue = Number(value);
  if (
    Number.isInteger(numericValue) &&
    numericValue >= 0 &&
    numericValue <= 2
  ) {
    return numericValue;
  }
  if (String(value).toLowerCase() === "delta") return 1;
  if (String(value).toLowerCase() === "cumulative") return 2;
  return 0;
}

function isFiniteMetricValue(value: number | null): value is number {
  return value !== null && Number.isFinite(Number(value));
}
