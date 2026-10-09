import { DurableQueue } from "../../../../shared/durable-queue";
import { config } from "../config";
import { BufferedAnalyticsLogger } from "./buffered-logger";
import {
  TunnelTinybirdClient, tunnelEventRecord, requestCaptureRecord, protocolEventRecord,
  type TunnelEvent, type RequestCapture, type ProtocolEvent, type TinybirdTunnelRecord,
} from "./tinybird-records";

export type { TunnelEvent, RequestCapture, ProtocolEvent } from "./tinybird-records";
export { normalizeRetentionDays } from "./tinybird-records";

const client = new TunnelTinybirdClient(config.tinybirdApiHost, config.tinybirdIngestToken);

class AnalyticsLogger<T> {
  private readonly buffer: BufferedAnalyticsLogger<TinybirdTunnelRecord>;

  constructor(
    datasource: string,
    private readonly record: (event: T) => TinybirdTunnelRecord,
    batchSize: number,
    flushIntervalMs: number,
  ) {
    const queue = new DurableQueue<TinybirdTunnelRecord>({
      signalName: datasource,
      redisUrl: config.redisUrl,
      streamKey: `analytics:tunnels:${datasource}`,
      deadLetterKey: `analytics:tunnels:${datasource}:dead-letter`,
      group: "tinybird-writers",
      // Captures contain plaintext. Bound unsent storage independently from
      // the plan's published retention: <=256MiB queue + <=256MiB DLQ, 3 days.
      maxEntries: datasource === "tunnel_request_captures" ? 64 : 5_000,
      ...(datasource === "tunnel_request_captures" ? {
        maxAgeSeconds: 3 * 24 * 60 * 60,
        maxMessageBytes: 4 * 1024 * 1024,
        maxDeadLetterEntries: 64,
      } : {}),
      // Only reserve one message at a time; otherwise pending later messages
      // can be claimed by another replica during a slow batch's retry window.
      batchSize: 1,
      claimIdleMs: 180_000,
      maxMessageBytes: 4 * 1024 * 1024,
      maxDeliveryAttempts: 5,
      deliver: (records) => client.append(datasource, records),
    });
    this.buffer = new BufferedAnalyticsLogger(queue, datasource, batchSize, flushIntervalMs,
      16 * 1024 * 1024, datasource === "tunnel_request_captures" ? 3 * 1024 * 1024 : 0);
  }

  log(event: T): void { this.buffer.log(this.record(event)); }
  start(): void { this.buffer.start(client.configured); }
  shutdown(): Promise<void> { return this.buffer.shutdown(); }
}

export const logger = new AnalyticsLogger<TunnelEvent>("tunnel_events", tunnelEventRecord, 1_000, 5_000);
export const requestCaptureLogger = new AnalyticsLogger<RequestCapture>(
  "tunnel_request_captures", requestCaptureRecord, 20, 5_000,
);

class ProtocolLogger extends AnalyticsLogger<ProtocolEvent> {
  constructor() { super("tunnel_protocol_events", protocolEventRecord, 1_000, 5_000); }

  public logTCPConnection(
    tunnelId: string,
    organizationId: string,
    connectionId: string,
    clientIp: string,
    clientPort: number,
    retentionDays: number = 3,
  ) {
    this.log({
      timestamp: Date.now(),
      tunnel_id: tunnelId,
      organization_id: organizationId,
      retention_days: retentionDays,
      protocol: "tcp",
      event_type: "connection",
      connection_id: connectionId,
      client_ip: clientIp,
      client_port: clientPort,
      bytes_in: 0,
      bytes_out: 0,
      duration_ms: 0,
    });
  }

  public logTCPData(
    tunnelId: string,
    organizationId: string,
    connectionId: string,
    clientIp: string,
    clientPort: number,
    bytesIn: number,
    bytesOut: number,
    retentionDays: number = 3,
  ) {
    this.log({
      timestamp: Date.now(),
      tunnel_id: tunnelId,
      organization_id: organizationId,
      retention_days: retentionDays,
      protocol: "tcp",
      event_type: "data",
      connection_id: connectionId,
      client_ip: clientIp,
      client_port: clientPort,
      bytes_in: bytesIn,
      bytes_out: bytesOut,
      duration_ms: 0,
    });
  }

  public logTCPClose(
    tunnelId: string,
    organizationId: string,
    connectionId: string,
    clientIp: string,
    clientPort: number,
    durationMs: number,
    retentionDays: number = 3,
  ) {
    this.log({
      timestamp: Date.now(),
      tunnel_id: tunnelId,
      organization_id: organizationId,
      retention_days: retentionDays,
      protocol: "tcp",
      event_type: "close",
      connection_id: connectionId,
      client_ip: clientIp,
      client_port: clientPort,
      bytes_in: 0,
      bytes_out: 0,
      duration_ms: durationMs,
    });
  }

  public logUDPPacket(
    tunnelId: string,
    organizationId: string,
    clientIp: string,
    clientPort: number,
    bytesIn: number,
    bytesOut: number,
    retentionDays: number = 3,
  ) {
    this.log({
      timestamp: Date.now(),
      tunnel_id: tunnelId,
      organization_id: organizationId,
      retention_days: retentionDays,
      protocol: "udp",
      event_type: "packet",
      connection_id: "",
      client_ip: clientIp,
      client_port: clientPort,
      bytes_in: bytesIn,
      bytes_out: bytesOut,
      duration_ms: 0,
    });
  }


}
export const protocolLogger = new ProtocolLogger();

export function startTinybirdLoggers(): void {
  logger.start();
  requestCaptureLogger.start();
  protocolLogger.start();
  if (client.configured) {
    console.log("Tunnel analytics will be delivered to Tinybird through Redis");
  } else {
    console.error("Tinybird tunnel ingestion is not configured; analytics will remain queued in Redis");
  }
}

export async function shutdownLoggers(): Promise<void> {
  const results = await Promise.allSettled([
    logger.shutdown(), requestCaptureLogger.shutdown(), protocolLogger.shutdown(),
  ]);
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Tunnel analytics shutdown could not persist all buffered records");
  }
}
