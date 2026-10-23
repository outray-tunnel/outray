import { randomUUID } from "node:crypto";
import type { UsageEvent, UsageMetric } from "./product-usage";

/** Project measured counters only. Never queue tunnel addresses or payloads. */
export function tunnelTrafficDeltas(source: string, record: Record<string, unknown>): Partial<Record<UsageMetric, string>> {
  const deltas: Partial<Record<UsageMetric, string>> = {};
  const add = (metric: UsageMetric, value: unknown) => {
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) deltas[metric] = String(value);
  };
  if (source === "tunnel_events") {
    deltas["tunnels.http_requests"] = "1";
    add("tunnels.bytes.http.in", record.bytes_in); add("tunnels.bytes.http.out", record.bytes_out);
  } else if (source === "tunnel_protocol_events" && ["tcp", "udp"].includes(String(record.protocol))) {
    if (record.protocol === "tcp") {
      if (record.event_type === "connection") deltas["tunnels.tcp_connections"] = "1";
      if (record.event_type === "data") { add("tunnels.bytes.tcp.in", record.bytes_in); add("tunnels.bytes.tcp.out", record.bytes_out); }
    } else if (record.event_type === "packet") {
      const direction = record.direction === "in" || record.direction === "out" ? record.direction : Number(record.bytes_in) > 0 ? "in" : "out";
      deltas[`tunnels.udp_datagrams.${direction}`] = "1";
      add("tunnels.bytes.udp.in", record.bytes_in); add("tunnels.bytes.udp.out", record.bytes_out);
    }
  }
  return deltas;
}

export interface UsageQueue { enqueue(events: UsageEvent[]): Promise<void> }
/** A failed enqueue retains its sealed IDs. Concurrent logging goes into a new
 * bucket; retrying an ambiguous Redis acknowledgement cannot create new IDs. */
export class TunnelUsageBuffer {
  private pending = new Map<string, UsageEvent>();
  private sealed: UsageEvent[] = [];
  private flushing: Promise<void> | null = null;
  constructor(private queue: UsageQueue, private maxBuckets = 2_000) {}
  log(organizationId: string, timestamp: string, deltas: UsageEvent["deltas"]) {
    if (!organizationId || !Object.keys(deltas).length) return;
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) throw new Error("Invalid tunnel usage timestamp");
    const day = date.toISOString().slice(0, 10);
    const key = `${organizationId}:${day}`;
    let bucket = this.pending.get(key);
    if (!bucket) {
      if (this.pending.size + this.sealed.length >= this.maxBuckets) throw new Error("Tunnel usage buffer is full");
      bucket = { organizationId, source: "tunnel-traffic", id: randomUUID(), timestamp: `${day}T00:00:00.000Z`, deltas: {} };
    }
    const nextDeltas = { ...bucket.deltas };
    for (const [metric, amount] of Object.entries(deltas)) {
      if (!/^\d+$/.test(String(amount))) throw new Error("Invalid tunnel usage counter");
      const next = BigInt(amount!) + BigInt(bucket.deltas[metric as UsageMetric] || "0");
      if (next < 0n || next > 9223372036854775807n) throw new Error("Tunnel usage counter overflow");
      nextDeltas[metric as UsageMetric] = String(next);
    }
    bucket.deltas = nextDeltas;
    this.pending.set(key, bucket);
  }
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      if (!this.sealed.length) { this.sealed = [...this.pending.values()]; this.pending.clear(); }
      if (!this.sealed.length) return;
      await this.queue.enqueue(this.sealed);
      this.sealed = [];
    })().finally(() => { this.flushing = null; });
    return this.flushing;
  }
}
export default { tunnelTrafficDeltas, TunnelUsageBuffer };
