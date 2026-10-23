import pg from "pg";
import { DurableQueue } from "../../../../shared/durable-queue";
import productUsage, { type UsageEvent } from "../../../../shared/product-usage";
import tunnelUsage from "../../../../shared/tunnel-product-usage";
import { postgresSsl } from "../../../../shared/postgres-ssl";
import { config } from "../config";
const { recordProductUsage } = productUsage;
const { TunnelUsageBuffer, tunnelTrafficDeltas } = tunnelUsage;

let pool: pg.Pool | undefined;
function usagePool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for permanent tunnel usage");
  return pool ??= new pg.Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 5000,
    ssl: postgresSsl(url, process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false") });
}
const queue = new DurableQueue<UsageEvent>({
  signalName: "product-usage", redisUrl: config.redisUrl,
  streamKey: "usage:tunnels:pending", deadLetterKey: "usage:tunnels:dead-letter",
  group: "product-usage-writers", maxEntries: 10_000, batchSize: 1, maxDeliveryAttempts: 5,
  maxMessageBytes: 512 * 1024, maxDeadLetterEntries: 10_000,
  deliver: async events => {
    // One SQL-function transaction per sealed organization/day envelope, not
    // per HTTP request. A committed prefix is deduplicated on batch retry.
    try {
      for (const event of events) await recordProductUsage(usagePool(), event);
    } catch { throw new Error("Permanent tunnel usage accounting failed; the immutable batch will retry"); }
  },
});
const buffer = new TunnelUsageBuffer(queue);
let timer: NodeJS.Timeout | undefined;
export function trackTunnelTraffic(source: string, record: Record<string, unknown>) {
  try {
    const timestamp = `${String(record.timestamp).replace(" ", "T").replace(/Z$/, "")}Z`;
    buffer.log(String(record.organization_id || ""), timestamp, tunnelTrafficDeltas(source, record));
  } catch { console.error("Permanent tunnel usage buffer rejected an event; coverage may be incomplete"); }
}
export async function recordTunnelOpening(organizationId: string | undefined, protocol: "http" | "tcp" | "udp", id: string, timestamp: string) {
  if (!organizationId) return;
  const event: UsageEvent = { organizationId, source: "tunnel-opens", id, timestamp, deltas: { [`tunnels.opens.${protocol}`]: 1 } };
  // Retry the same immutable envelope if Redis accepted it but lost its reply.
  try { await queue.enqueue([event]); } catch { await queue.enqueue([event]); }
}
export function startPermanentTunnelUsage() {
  if (timer) return;
  queue.start();
  timer = setInterval(() => { void buffer.flush().catch(() => console.error("Permanent tunnel usage could not reach Redis; sealed batches will retry")); }, 5000);
  timer.unref();
}
export async function shutdownPermanentTunnelUsage() {
  if (timer) clearInterval(timer);
  timer = undefined;
  try { await buffer.flush(); await buffer.flush(); } finally { await queue.close(); await pool?.end(); }
}
