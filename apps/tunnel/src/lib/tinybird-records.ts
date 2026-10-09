import { randomUUID } from "node:crypto";

export interface TunnelEvent {
  request_id?: string;
  timestamp: number;
  tunnel_id: string;
  organization_id: string;
  retention_days: number;
  host: string;
  method: string;
  path: string;
  status_code: number;
  request_duration_ms: number;
  bytes_in: number;
  bytes_out: number;
  client_ip: string;
  user_agent: string;
}

export interface RequestCapture {
  id: string;
  timestamp: number;
  tunnel_id: string;
  organization_id: string;
  retention_days: number;
  request_headers: Record<string, string | string[]>;
  request_body: string | null;
  request_body_size: number;
  response_headers: Record<string, string | string[]>;
  response_body: string | null;
  response_body_size: number;
}

export interface ProtocolEvent {
  timestamp: number;
  tunnel_id: string;
  organization_id: string;
  retention_days: number;
  protocol: "tcp" | "udp";
  event_type: "connection" | "data" | "close" | "packet";
  connection_id: string;
  client_ip: string;
  client_port: number;
  bytes_in: number;
  bytes_out: number;
  duration_ms: number;
}

export type TinybirdTunnelRecord = Record<string, string | number | null>;

export function normalizeRetentionDays(retentionDays: number): number {
  if (!Number.isFinite(retentionDays)) return 3;
  return Math.min(90, Math.max(1, Math.trunc(retentionDays)));
}

export function tinybirdTimestamp(timestamp: number | Date): string {
  return new Date(timestamp).toISOString().replace("T", " ").replace("Z", "");
}

export function tunnelEventRecord(event: TunnelEvent): TinybirdTunnelRecord {
  return {
    ...event,
    request_id: event.request_id || "",
    event_id: event.request_id || randomUUID(),
    timestamp: tinybirdTimestamp(event.timestamp),
    ingested_at: tinybirdTimestamp(Date.now()),
    retention_days: normalizeRetentionDays(event.retention_days),
  };
}

export function requestCaptureRecord(capture: RequestCapture): TinybirdTunnelRecord {
  return {
    ...capture,
    timestamp: tinybirdTimestamp(capture.timestamp),
    ingested_at: tinybirdTimestamp(Date.now()),
    retention_days: normalizeRetentionDays(capture.retention_days),
    request_headers: JSON.stringify(capture.request_headers),
    response_headers: JSON.stringify(capture.response_headers),
  };
}

export function protocolEventRecord(event: ProtocolEvent): TinybirdTunnelRecord {
  return {
    ...event,
    event_id: randomUUID(),
    timestamp: tinybirdTimestamp(event.timestamp),
    ingested_at: tinybirdTimestamp(Date.now()),
    retention_days: normalizeRetentionDays(event.retention_days),
  };
}

export class TunnelTinybirdClient {
  constructor(private readonly host: string, private readonly token: string) {}

  get configured(): boolean {
    if (!this.host || !this.token) return false;
    try {
      const url = new URL(this.host);
      return (url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) &&
        !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
    } catch {
      return false;
    }
  }

  async append(datasource: string, records: TinybirdTunnelRecord[]): Promise<void> {
    if (datasource === "tunnel_request_captures") {
      const oversized = records.filter((record) => Buffer.byteLength(JSON.stringify(record)) > 3 * 1024 * 1024).length;
      if (oversized) console.error(`Tinybird capture delivery rejected ${oversized} oversized records; other captures will continue`);
      records = records.filter((record) => captureRecordIsCurrent(record) && Buffer.byteLength(JSON.stringify(record)) <= 3 * 1024 * 1024);
    }
    if (!records.length) return;
    if (!this.configured) throw new Error("Tinybird tunnel ingestion is not configured");
    // Keep requests below the Events API payload ceiling, even when captures
    // contain large base64 request/response bodies. Stable ids make retrying an
    // already accepted prefix safe when a later request fails.
    const maxBytes = 4 * 1024 * 1024;
    let lines: string[] = [];
    let bytes = 0;
    for (const record of records) {
      const line = JSON.stringify(record);
      const lineBytes = Buffer.byteLength(line) + 1;
      if (lineBytes > maxBytes) {
        throw new Error(`Tinybird ${datasource} record exceeds the ingestion size limit`);
      }
      if (bytes + lineBytes > maxBytes && lines.length) {
        await this.appendBatch(datasource, lines);
        lines = [];
        bytes = 0;
      }
      lines.push(line);
      bytes += lineBytes;
    }
    if (lines.length) await this.appendBatch(datasource, lines);
  }

  private async appendBatch(datasource: string, lines: string[]): Promise<void> {
    const response = await fetch(
      `${this.host.replace(/\/$/, "")}/v0/events?name=${encodeURIComponent(datasource)}&wait=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/x-ndjson",
        },
        body: lines.join("\n"),
        signal: AbortSignal.timeout(15_000),
      },
    );
    // Error bodies can echo capture values. Never include them in logs/errors.
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Tinybird ${datasource} ingestion failed (${response.status})`);
    }
    let result: { successful_rows?: number; quarantined_rows?: number };
    try {
      const candidate: unknown = await response.json();
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        throw new Error("invalid acknowledgement");
      }
      result = candidate as typeof result;
    } catch {
      throw new Error(`Tinybird ${datasource} ingestion returned an invalid acknowledgement`);
    }
    if (Number(result.quarantined_rows) > 0 || Number(result.successful_rows) !== lines.length) {
      throw new Error(`Tinybird ${datasource} ingestion did not acknowledge the complete batch`);
    }
  }
}

/** Backlogs must never republish captures past their individual plan expiry. */
export function captureRecordIsCurrent(record: TinybirdTunnelRecord, now = Date.now()): boolean {
  if (typeof record.timestamp !== "string") return false;
  const timestamp = Date.parse(`${record.timestamp.replace(" ", "T").replace(/Z$/, "")}Z`);
  const days = normalizeRetentionDays(Number(record.retention_days));
  return Number.isFinite(timestamp) && timestamp + days * 24 * 60 * 60 * 1000 > now;
}
