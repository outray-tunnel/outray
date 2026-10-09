import { DurableQueue } from "../../../../shared/durable-queue";
import { BufferedAnalyticsLogger } from "../../../tunnel/src/lib/buffered-logger";
import { TunnelTinybirdClient, tinybirdTimestamp, type TinybirdTunnelRecord } from "../../../tunnel/src/lib/tinybird-records";
import { config } from "../config";

export function activeTunnelSnapshot(timestamp: Date, activeTunnels: number): TinybirdTunnelRecord {
  const minute = new Date(timestamp);
  minute.setUTCSeconds(0, 0);
  return {
    ts: tinybirdTimestamp(minute),
    active_tunnels: activeTunnels,
    ingested_at: tinybirdTimestamp(timestamp),
  };
}

export function createSnapshotLogger() {
  const tinybird = new TunnelTinybirdClient(config.tinybirdApiHost, config.tinybirdIngestToken);
  const queue = new DurableQueue<TinybirdTunnelRecord>({
    signalName: "tunnel_active_snapshots",
    redisUrl: config.redisUrl,
    streamKey: "analytics:tunnels:tunnel_active_snapshots",
    deadLetterKey: "analytics:tunnels:tunnel_active_snapshots:dead-letter",
    group: "tinybird-writers",
    maxEntries: 5_000,
    batchSize: 1,
    claimIdleMs: 180_000,
    maxDeliveryAttempts: 5,
    deliver: (records) => tinybird.append("tunnel_active_snapshots", records),
  });
  const logger = new BufferedAnalyticsLogger(queue, "tunnel_active_snapshots", 30, 5_000);
  return { logger, configured: tinybird.configured };
}
