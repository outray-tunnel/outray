/** Tinybird DateTime64 JSON values are UTC, but may omit the timezone suffix. */
export function tunnelEventTime(value: string | Date): string {
  const timestamp = typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  return new Date(timestamp).toISOString();
}

/** ClickHouse JSON represents UInt64 measurements as decimal strings. */
export function tunnelMetricNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeTunnelRequest<T extends { timestamp: string }>(row: T) {
  const record = row as T & Record<string, unknown>;
  const bytesIn = tunnelMetricNumber(record.bytes_in);
  const bytesOut = tunnelMetricNumber(record.bytes_out);
  return {
    ...row,
    timestamp: tunnelEventTime(row.timestamp),
    status_code: tunnelMetricNumber(record.status_code),
    request_duration_ms: tunnelMetricNumber(record.request_duration_ms),
    bytes_in: bytesIn,
    bytes_out: bytesOut,
    size: record.size == null ? bytesIn + bytesOut : tunnelMetricNumber(record.size),
  };
}

export function tunnelBucketSeconds(bucket: string): number {
  if (bucket === "1 minute") return 60;
  if (bucket === "1 hour") return 3_600;
  if (bucket === "1 day") return 86_400;
  throw new Error("Unsupported tunnel chart bucket");
}

/** Fill sparse analytics buckets, keeping the exact rolling-window boundaries. */
export function fillTunnelBuckets<T extends { time: string | Date }>(
  rows: T[], start: Date, end: Date, bucketSeconds: number, empty: (time: string) => T,
): T[] {
  const interval = bucketSeconds * 1_000;
  const byTime = new Map(rows.map((row) => [new Date(tunnelEventTime(row.time)).getTime(), row]));
  const filled: T[] = [];
  for (let time = Math.floor(start.getTime() / interval) * interval; time < end.getTime(); time += interval) {
    const timestamp = new Date(time).toISOString();
    const row = byTime.get(time);
    filled.push(row ? { ...row, time: timestamp } : empty(timestamp));
  }
  return filled;
}

type CapturedHeaders = Record<string, string | string[]>;
export type TunnelCaptureRow = {
  id: string; timestamp: string; tunnel_id: string; organization_id: string;
  request_headers: string | CapturedHeaders; response_headers: string | CapturedHeaders;
  request_body: string | null; response_body: string | null; request_body_size: unknown; response_body_size: unknown;
};

function capturedHeaders(value: string | CapturedHeaders): CapturedHeaders {
  const result: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid captured headers");
  if (Object.values(result).some((header) => typeof header !== "string" && (!Array.isArray(header) || header.some((item) => typeof item !== "string")))) {
    throw new Error("Invalid captured header value");
  }
  return result as CapturedHeaders;
}

export function serializeTunnelCapture(capture: TunnelCaptureRow) {
  return {
    id: capture.id, timestamp: tunnelEventTime(capture.timestamp), tunnelId: capture.tunnel_id,
    request: { headers: capturedHeaders(capture.request_headers), body: capture.request_body ? Buffer.from(capture.request_body, "base64").toString("utf-8") : null, bodySize: tunnelMetricNumber(capture.request_body_size) },
    response: { headers: capturedHeaders(capture.response_headers), body: capture.response_body ? Buffer.from(capture.response_body, "base64").toString("utf-8") : null, bodySize: tunnelMetricNumber(capture.response_body_size) },
  };
}
