import { config } from "../config";

interface TinybirdResponse<T> {
  data?: T[];
}

interface AlertEndpointMap {
  alert_http_service: {
    parameters: WindowParameters;
    row: {
      sample_count: number;
      failure_rate_pct: number | null;
      p95_duration_ms: number | null;
      requests_per_minute: number | null;
    };
  };
  alert_log_service: {
    parameters: WindowParameters & {
      level?: "debug" | "info" | "warn" | "error";
      search?: string;
    };
    row: { sample_count: number; matching_count: number };
  };
  alert_metric_gauge: {
    parameters: WindowParameters & {
      metric_name: string;
      metric_unit: string;
      metric_type: "gauge";
      aggregation_temporality: number;
      is_monotonic: number;
    };
    row: {
      raw_point_count: number;
      latest_value: number | null;
      avg_value: number | null;
      max_value: number | null;
      min_value: number | null;
    };
  };
  alert_service_heartbeat: {
    parameters: Omit<WindowParameters, "window_seconds"> & {
      lookback_seconds: number;
    };
    row: { span_count: number; log_count: number; metric_count: number };
  };
}

interface WindowParameters {
  organization_id: string;
  service: string;
  environment?: string;
  evaluation_time: string;
  window_seconds: number;
}

export async function queryTinybird<K extends keyof AlertEndpointMap>(
  endpoint: K,
  parameters: AlertEndpointMap[K]["parameters"],
): Promise<AlertEndpointMap[K]["row"][]> {
  if (!config.tinybirdApiHost || !config.tinybirdQueryToken) {
    throw new Error("Tinybird query credentials are not configured");
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }

  const response = await fetch(
    `${config.tinybirdApiHost}/v0/pipes/${encodeURIComponent(endpoint)}.json?${search}`,
    {
      headers: { Authorization: `Bearer ${config.tinybirdQueryToken}` },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Tinybird query failed (${response.status}): ${detail}`);
  }

  const body = (await response.json()) as TinybirdResponse<
    AlertEndpointMap[K]["row"]
  >;
  if (!Array.isArray(body.data)) {
    throw new Error("Tinybird returned an invalid response");
  }
  return body.data;
}
