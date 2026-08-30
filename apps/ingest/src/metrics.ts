import {
  attributeString,
  decodeAttributes,
  field,
  integerString,
  list,
  record,
  stringValue,
  type AttributeValue,
} from "./otlp.js";

export type MetricType =
  | "gauge"
  | "sum"
  | "histogram"
  | "exponential_histogram"
  | "summary";

export interface ParsedMetricPoint {
  timestamp: string;
  timestampNano: string;
  startTimestamp: string | null;
  startTimestampNano: string;
  metricName: string;
  metricDescription: string;
  metricUnit: string;
  metricType: MetricType;
  aggregationTemporality: number;
  isMonotonic: boolean;
  value: number | null;
  valueInt: string | null;
  count: string;
  sum: number | null;
  min: number | null;
  max: number | null;
  bucketCounts: string[];
  explicitBounds: number[];
  scale: number;
  zeroCount: string;
  zeroThreshold: number;
  positiveOffset: number;
  positiveBucketCounts: string[];
  negativeOffset: number;
  negativeBucketCounts: string[];
  quantiles: number[];
  quantileValues: number[];
  flags: number;
  serviceName: string;
  serviceNamespace: string;
  serviceVersion: string;
  environment: string;
  region: string;
  scopeName: string;
  scopeVersion: string;
  resourceSchemaUrl: string;
  scopeSchemaUrl: string;
  resourceAttributes: Record<string, AttributeValue>;
  metricAttributes: Record<string, AttributeValue>;
  scopeAttributes: Record<string, AttributeValue>;
}

export interface ParsedMetricsPayload {
  points: ParsedMetricPoint[];
  rejected: number;
}

interface CommonPoint {
  timestamp: string;
  timestampNano: string;
  startTimestamp: string | null;
  startTimestampNano: string;
  flags: number;
  metricAttributes: Record<string, AttributeValue>;
}

interface MetricContext {
  metricName: string;
  metricDescription: string;
  metricUnit: string;
  serviceName: string;
  serviceNamespace: string;
  serviceVersion: string;
  environment: string;
  region: string;
  scopeName: string;
  scopeVersion: string;
  resourceSchemaUrl: string;
  scopeSchemaUrl: string;
  resourceAttributes: Record<string, AttributeValue>;
  scopeAttributes: Record<string, AttributeValue>;
}

function nanoTimestamp(value: string): string | null {
  try {
    const nanos = BigInt(value);
    if (nanos <= 0n) return null;
    const seconds = nanos / 1_000_000_000n;
    const fraction = String(nanos % 1_000_000_000n).padStart(9, "0");
    const date = new Date(Number(seconds * 1_000n));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().replace(".000Z", `.${fraction}Z`);
  } catch {
    return null;
  }
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalNumber(
  source: Record<string, unknown>,
  camel: string,
  snake: string,
) {
  const value = field(source, camel, snake);
  return value === undefined || value === null ? null : finiteNumber(value);
}

function uint64String(value: unknown): string | null {
  const parsed = integerString(value);
  if (!parsed) return null;
  try {
    return BigInt(parsed) <= 18_446_744_073_709_551_615n ? parsed : null;
  } catch {
    return null;
  }
}

function int64String(value: unknown): string | null {
  let parsed: string | null = null;
  if (typeof value === "string" && /^-?\d+$/.test(value)) parsed = value;
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    parsed = String(value);
  }
  if (!parsed) return null;
  try {
    const integer = BigInt(parsed);
    return integer >= -9_223_372_036_854_775_808n &&
      integer <= 9_223_372_036_854_775_807n
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function unsignedIntegers(value: unknown): string[] | null {
  if (!Array.isArray(value)) return [];
  const values = value.map(uint64String);
  return values.every((item): item is string => item !== null) ? values : null;
}

function finiteNumbers(value: unknown): number[] | null {
  if (!Array.isArray(value)) return [];
  const values = value.map(finiteNumber);
  return values.every((item): item is number => item !== null) ? values : null;
}

function strictlyIncreasing(values: number[]) {
  return values.every(
    (value, index) => index === 0 || value > values[index - 1]!,
  );
}

function totalsMatch(total: string, values: string[], extra = "0") {
  try {
    return (
      BigInt(total) ===
      values.reduce((sum, value) => sum + BigInt(value), BigInt(extra))
    );
  } catch {
    return false;
  }
}

function signedInt32(value: unknown): number | null {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) &&
    parsed >= -2_147_483_648 &&
    parsed <= 2_147_483_647
    ? parsed
    : null;
}

function integerInRange(
  value: unknown,
  min: number,
  max: number,
  fallback = 0,
) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

function commonPoint(value: unknown): CommonPoint | null {
  const point = record(value);
  if (!point) return null;

  const timestampNano = integerString(
    field(point, "timeUnixNano", "time_unix_nano"),
  );
  const timestamp = timestampNano ? nanoTimestamp(timestampNano) : null;
  if (!timestampNano || !timestamp) return null;

  const startTimestampNano =
    integerString(field(point, "startTimeUnixNano", "start_time_unix_nano")) ||
    "0";
  const startTimestamp =
    startTimestampNano === "0" ? null : nanoTimestamp(startTimestampNano);
  if (startTimestampNano !== "0" && !startTimestamp) return null;

  return {
    timestamp,
    timestampNano,
    startTimestamp,
    startTimestampNano,
    flags: integerInRange(point.flags, 0, 0xffffffff),
    metricAttributes: decodeAttributes(point.attributes),
  };
}

function basePoint(
  context: MetricContext,
  common: CommonPoint,
  metricType: MetricType,
  aggregationTemporality: number,
  isMonotonic: boolean,
): ParsedMetricPoint {
  return {
    ...context,
    ...common,
    metricType,
    aggregationTemporality,
    isMonotonic,
    value: null,
    valueInt: null,
    count: "0",
    sum: null,
    min: null,
    max: null,
    bucketCounts: [],
    explicitBounds: [],
    scale: 0,
    zeroCount: "0",
    zeroThreshold: 0,
    positiveOffset: 0,
    positiveBucketCounts: [],
    negativeOffset: 0,
    negativeBucketCounts: [],
    quantiles: [],
    quantileValues: [],
  };
}

function numberPoint(
  value: unknown,
  context: MetricContext,
  metricType: "gauge" | "sum",
  aggregationTemporality: number,
  isMonotonic: boolean,
): ParsedMetricPoint | null {
  const source = record(value);
  const common = commonPoint(value);
  if (!source || !common) return null;

  const rawDouble = field(source, "asDouble", "as_double");
  const rawInt = field(source, "asInt", "as_int");
  const pointValue = rawDouble === undefined ? null : finiteNumber(rawDouble);
  const pointValueInt = rawInt === undefined ? null : int64String(rawInt);
  const noRecordedValue = (common.flags & 1) === 1;
  if (pointValue === null && pointValueInt === null && !noRecordedValue) {
    return null;
  }

  return {
    ...basePoint(
      context,
      common,
      metricType,
      aggregationTemporality,
      isMonotonic,
    ),
    value: noRecordedValue ? null : pointValue,
    valueInt: noRecordedValue ? null : pointValueInt,
  };
}

function histogramPoint(
  value: unknown,
  context: MetricContext,
  aggregationTemporality: number,
): ParsedMetricPoint | null {
  const source = record(value);
  const common = commonPoint(value);
  if (!source || !common) return null;

  const count = uint64String(source.count ?? 0);
  const bucketCounts = unsignedIntegers(
    field(source, "bucketCounts", "bucket_counts"),
  );
  const explicitBounds = finiteNumbers(
    field(source, "explicitBounds", "explicit_bounds"),
  );
  const sum = optionalNumber(source, "sum", "sum");
  const min = optionalNumber(source, "min", "min");
  const max = optionalNumber(source, "max", "max");
  if (!count || !bucketCounts || !explicitBounds) return null;
  if (
    bucketCounts.length > 4_096 ||
    explicitBounds.length > 4_095 ||
    (bucketCounts.length === 0) !== (explicitBounds.length === 0) ||
    (bucketCounts.length > 0 &&
      (bucketCounts.length !== explicitBounds.length + 1 ||
        !strictlyIncreasing(explicitBounds) ||
        !totalsMatch(count, bucketCounts)))
  ) {
    return null;
  }

  return {
    ...basePoint(context, common, "histogram", aggregationTemporality, false),
    count,
    sum,
    min,
    max,
    bucketCounts,
    explicitBounds,
  };
}

function exponentialHistogramPoint(
  value: unknown,
  context: MetricContext,
  aggregationTemporality: number,
): ParsedMetricPoint | null {
  const source = record(value);
  const common = commonPoint(value);
  if (!source || !common) return null;

  const positive = record(source.positive);
  const negative = record(source.negative);
  const count = uint64String(source.count ?? 0);
  const zeroCount = uint64String(field(source, "zeroCount", "zero_count") ?? 0);
  const positiveBucketCounts = unsignedIntegers(
    field(positive, "bucketCounts", "bucket_counts"),
  );
  const negativeBucketCounts = unsignedIntegers(
    field(negative, "bucketCounts", "bucket_counts"),
  );
  const scale = signedInt32(source.scale);
  const positiveOffset = signedInt32(positive?.offset);
  const negativeOffset = signedInt32(negative?.offset);
  const zeroThreshold = finiteNumber(
    field(source, "zeroThreshold", "zero_threshold") ?? 0,
  );
  if (
    !count ||
    !zeroCount ||
    !positiveBucketCounts ||
    !negativeBucketCounts ||
    scale === null ||
    positiveOffset === null ||
    negativeOffset === null ||
    zeroThreshold === null ||
    zeroThreshold < 0 ||
    positiveBucketCounts.length > 4_096 ||
    negativeBucketCounts.length > 4_096 ||
    !totalsMatch(
      count,
      [...positiveBucketCounts, ...negativeBucketCounts],
      zeroCount,
    )
  ) {
    return null;
  }

  return {
    ...basePoint(
      context,
      common,
      "exponential_histogram",
      aggregationTemporality,
      false,
    ),
    count,
    sum: optionalNumber(source, "sum", "sum"),
    min: optionalNumber(source, "min", "min"),
    max: optionalNumber(source, "max", "max"),
    scale,
    zeroCount,
    zeroThreshold,
    positiveOffset,
    positiveBucketCounts,
    negativeOffset,
    negativeBucketCounts,
  };
}

function summaryPoint(
  value: unknown,
  context: MetricContext,
): ParsedMetricPoint | null {
  const source = record(value);
  const common = commonPoint(value);
  if (!source || !common) return null;

  const count = uint64String(source.count ?? 0);
  const sum = finiteNumber(source.sum ?? 0);
  const quantiles: number[] = [];
  const quantileValues: number[] = [];
  for (const candidate of list(
    field(source, "quantileValues", "quantile_values"),
  )) {
    const quantile = record(candidate);
    const key = finiteNumber(quantile?.quantile ?? 0);
    const pointValue = finiteNumber(quantile?.value ?? 0);
    if (
      key === null ||
      key < 0 ||
      key > 1 ||
      pointValue === null ||
      pointValue < 0
    ) {
      return null;
    }
    quantiles.push(key);
    quantileValues.push(pointValue);
  }
  if (
    !count ||
    sum === null ||
    quantiles.length > 256 ||
    !strictlyIncreasing(quantiles)
  ) {
    return null;
  }

  return {
    ...basePoint(context, common, "summary", 2, false),
    count,
    sum,
    quantiles,
    quantileValues,
  };
}

export function parseMetricsPayload(payload: unknown): ParsedMetricsPayload {
  const root = record(payload);
  const resourceMetrics = list(
    field(root, "resourceMetrics", "resource_metrics"),
  );
  if (
    !root ||
    !Array.isArray(field(root, "resourceMetrics", "resource_metrics"))
  ) {
    throw new Error("resourceMetrics must be an array");
  }

  const points: ParsedMetricPoint[] = [];
  let rejected = 0;

  for (const resourceMetricCandidate of resourceMetrics) {
    const resourceMetric = record(resourceMetricCandidate);
    const resource = record(resourceMetric?.resource);
    const resourceAttributes = decodeAttributes(resource?.attributes);
    const scopeMetrics = list(
      field(resourceMetric, "scopeMetrics", "scope_metrics") ??
        field(
          resourceMetric,
          "instrumentationLibraryMetrics",
          "instrumentation_library_metrics",
        ),
    );

    for (const scopeMetricCandidate of scopeMetrics) {
      const scopeMetric = record(scopeMetricCandidate);
      const scope = record(
        scopeMetric?.scope ?? scopeMetric?.instrumentationLibrary,
      );
      const scopeAttributes = decodeAttributes(scope?.attributes);

      const contextBase = {
        serviceName:
          attributeString(resourceAttributes, "service.name") ||
          "unknown_service",
        serviceNamespace: attributeString(
          resourceAttributes,
          "service.namespace",
        ),
        serviceVersion: attributeString(resourceAttributes, "service.version"),
        environment: attributeString(
          resourceAttributes,
          "deployment.environment.name",
          "deployment.environment",
        ),
        region: attributeString(
          resourceAttributes,
          "cloud.region",
          "host.region",
        ),
        scopeName: stringValue(scope?.name),
        scopeVersion: stringValue(scope?.version),
        resourceSchemaUrl: stringValue(
          field(resourceMetric, "schemaUrl", "schema_url"),
        ),
        scopeSchemaUrl: stringValue(
          field(scopeMetric, "schemaUrl", "schema_url"),
        ),
        resourceAttributes,
        scopeAttributes,
      };

      for (const candidate of list(scopeMetric?.metrics)) {
        const metric = record(candidate);
        if (!metric) continue;
        const context: MetricContext = {
          ...contextBase,
          metricName: stringValue(metric.name),
          metricDescription: stringValue(metric.description),
          metricUnit: stringValue(metric.unit),
        };

        const containers: Array<{
          type: MetricType;
          value: Record<string, unknown> | null;
        }> = [
          { type: "gauge", value: record(metric.gauge) },
          { type: "sum", value: record(metric.sum) },
          { type: "histogram", value: record(metric.histogram) },
          {
            type: "exponential_histogram",
            value: record(
              field(metric, "exponentialHistogram", "exponential_histogram"),
            ),
          },
          { type: "summary", value: record(metric.summary) },
        ];
        const container = containers.find((item) => item.value);
        if (!container) continue;

        const candidates = list(
          field(container.value, "dataPoints", "data_points"),
        );
        const temporality = integerInRange(
          field(
            container.value,
            "aggregationTemporality",
            "aggregation_temporality",
          ),
          0,
          2,
        );
        const hasValidTemporality =
          container.type === "gauge" ||
          container.type === "summary" ||
          temporality === 1 ||
          temporality === 2;
        const monotonic =
          container.value?.isMonotonic === true ||
          container.value?.is_monotonic === true;

        for (const dataPoint of candidates) {
          let parsed: ParsedMetricPoint | null = null;
          if (context.metricName && hasValidTemporality) {
            if (container.type === "gauge" || container.type === "sum") {
              parsed = numberPoint(
                dataPoint,
                context,
                container.type,
                temporality,
                container.type === "sum" && monotonic,
              );
            } else if (container.type === "histogram") {
              parsed = histogramPoint(dataPoint, context, temporality);
            } else if (container.type === "exponential_histogram") {
              parsed = exponentialHistogramPoint(
                dataPoint,
                context,
                temporality,
              );
            } else {
              parsed = summaryPoint(dataPoint, context);
            }
          }

          if (parsed) points.push(parsed);
          else rejected++;
        }
      }
    }
  }

  return { points, rejected };
}
