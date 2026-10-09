import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { Redis } from "ioredis";

export interface DurableQueueOptions<T> {
  signalName: string;
  redisUrl: string;
  streamKey: string;
  deadLetterKey: string;
  group: string;
  maxEntries: number;
  batchSize: number;
  maxDeliveryAttempts: number;
  /** Optional storage bound; existing observability queues keep their policy. */
  maxAgeSeconds?: number;
  maxMessageBytes?: number;
  maxDeadLetterEntries?: number;
  claimIdleMs?: number;
  deliver: (records: T[]) => Promise<void>;
}

type StreamMessage = [id: string, fields: string[]];

const ENQUEUE = `
local maxAge = tonumber(ARGV[2])
if maxAge > 0 then
  local now = redis.call('TIME')
  redis.call('XTRIM', KEYS[1], 'MINID', tostring((tonumber(now[1]) - maxAge) * 1000) .. '-0')
end
local additions = #ARGV - 2
if redis.call('XLEN', KEYS[1]) + additions > tonumber(ARGV[1]) then
  return 0
end
for index = 3, #ARGV do
  redis.call('XADD', KEYS[1], '*', 'payload', ARGV[index])
end
if maxAge > 0 then redis.call('EXPIRE', KEYS[1], maxAge) end
return additions
`;

const DEAD_LETTER = `
redis.call('XADD', KEYS[2], 'MAXLEN', tonumber(ARGV[6]), '*',
  'source_id', ARGV[2], 'error', ARGV[3], 'payload', ARGV[4])
local maxAge = tonumber(ARGV[5])
if maxAge > 0 then
  local now = redis.call('TIME')
  local cutoff = tostring((tonumber(now[1]) - maxAge) * 1000) .. '-0'
  redis.call('XTRIM', KEYS[2], 'MINID', cutoff)
  local sourceTime = tonumber(string.match(ARGV[2], '^(%d+)')) / 1000
  local remaining = math.max(1, math.floor(sourceTime + maxAge - tonumber(now[1])))
  local ttl = redis.call('TTL', KEYS[2])
  if ttl < 0 or ttl > remaining then redis.call('EXPIRE', KEYS[2], remaining) end
end
redis.call('XACK', KEYS[1], ARGV[1], ARGV[2])
redis.call('XDEL', KEYS[1], ARGV[2])
return 1
`;

const PRUNE = `
local maxAge = tonumber(ARGV[1])
local now = redis.call('TIME')
local cutoff = tostring((tonumber(now[1]) - maxAge) * 1000) .. '-0'
for index = 1, #KEYS do
  redis.call('XTRIM', KEYS[index], 'MINID', cutoff)
  if redis.call('TTL', KEYS[index]) == -1 then redis.call('EXPIRE', KEYS[index], maxAge) end
end
return 1
`;

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function fieldValue(fields: string[], name: string): string | null {
  for (let index = 0; index < fields.length; index += 2) {
    if (fields[index] === name) return fields[index + 1] ?? null;
  }
  return null;
}

export class DurableQueue<T> {
  private readonly producer: Redis;
  private readonly worker: Redis;
  private readonly consumer = `${hostname()}:${process.pid}:${randomUUID()}`;
  private stopping = false;
  private workerPromise: Promise<void> | null = null;

  constructor(private readonly options: DurableQueueOptions<T>) {
    const shared = {
      lazyConnect: true,
      connectTimeout: 3_000,
      commandTimeout: 5_000,
      maxRetriesPerRequest: 1,
    } as const;
    this.producer = new Redis(options.redisUrl, shared);
    this.worker = new Redis(options.redisUrl, {
      ...shared,
      commandTimeout: undefined,
      maxRetriesPerRequest: null,
    });

    this.producer.on("error", (error: Error) =>
      console.error(`${options.signalName} queue producer error`, error),
    );
    this.worker.on("error", (error: Error) => {
      if (!this.stopping)
        console.error(`${options.signalName} queue worker error`, error);
    });
  }

  async enqueue(records: T[]): Promise<void> {
    if (records.length === 0) return;
    if (this.producer.status === "wait" || this.producer.status === "end") {
      await this.producer.connect();
    }

    const payloads = queuePayloads(records, this.options.maxMessageBytes);
    // Admission and enqueue must share one Redis operation across replicas.
    const result = await this.producer.eval(
      ENQUEUE, 1, this.options.streamKey, this.options.maxEntries,
      this.options.maxAgeSeconds || 0, ...payloads,
    );
    if (result === 0) {
      throw new Error(`${this.options.signalName} ingestion queue is full`);
    }
    if (Number(result) !== payloads.length) {
      throw new Error(
        `Could not durably enqueue ${this.options.signalName} data`,
      );
    }
  }

  start(): void {
    if (this.workerPromise) return;
    this.workerPromise = this.run().catch((error) => {
      if (!this.stopping)
        console.error(
          `${this.options.signalName} queue stopped unexpectedly`,
          error,
        );
    });
  }

  private async run(): Promise<void> {
    while (!this.stopping) {
      try {
        if (this.worker.status === "wait" || this.worker.status === "end") {
          await this.worker.connect();
        }
        await this.createConsumerGroup();
        await this.pruneExpired();
        await this.recoverStale();
        let lastRecoveryAt = Date.now();

        while (!this.stopping) {
          if (Date.now() - lastRecoveryAt >= 30_000) {
            await this.pruneExpired();
            await this.recoverStale();
            lastRecoveryAt = Date.now();
          }
          const result = (await this.worker.xreadgroup(
            "GROUP",
            this.options.group,
            this.consumer,
            "COUNT",
            this.options.batchSize,
            "BLOCK",
            2_000,
            "STREAMS",
            this.options.streamKey,
            ">",
          )) as [string, StreamMessage[]][] | null;

          const messages = result?.[0]?.[1] ?? [];
          for (const message of messages) await this.deliver(message);
        }
      } catch (error) {
        if (this.stopping) break;
        console.error(
          `${this.options.signalName} queue worker will retry`,
          error,
        );
        this.worker.disconnect(false);
        await sleep(2_000);
      }
    }
  }

  private async createConsumerGroup(): Promise<void> {
    try {
      await this.worker.xgroup(
        "CREATE",
        this.options.streamKey,
        this.options.group,
        "0",
        "MKSTREAM",
      );
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("BUSYGROUP"))
        throw error;
    }
  }

  private async pruneExpired(): Promise<void> {
    if (!this.options.maxAgeSeconds) return;
    await this.worker.eval(PRUNE, 2, this.options.streamKey, this.options.deadLetterKey, this.options.maxAgeSeconds);
  }

  private async recoverStale(): Promise<void> {
    let cursor = "0-0";
    do {
      const result = (await this.worker.xautoclaim(
        this.options.streamKey,
        this.options.group,
        this.consumer,
        this.options.claimIdleMs || 60_000,
        cursor,
        "COUNT",
        this.options.batchSize,
      )) as [string, StreamMessage[]];
      cursor = result[0];
      for (const message of result[1] ?? []) await this.deliver(message);
    } while (!this.stopping && cursor !== "0-0");
  }

  private async deliver([id, fields]: StreamMessage): Promise<void> {
    const payload = fieldValue(fields, "payload");
    if (!payload) {
      await this.acknowledge(id);
      return;
    }

    let records: T[];
    try {
      records = JSON.parse(payload) as T[];
      if (!Array.isArray(records)) throw new Error("payload is not an array");
    } catch (error) {
      await this.deadLetter(id, payload, error);
      return;
    }

    for (
      let attempt = 1;
      attempt <= this.options.maxDeliveryAttempts;
      attempt++
    ) {
      try {
        await this.options.deliver(records);
        await this.acknowledge(id);
        return;
      } catch (error) {
        if (attempt === this.options.maxDeliveryAttempts) {
          await this.deadLetter(id, payload, error);
          return;
        }
        await sleep(Math.min(1_000 * 2 ** (attempt - 1), 15_000));
      }
    }
  }

  private async acknowledge(id: string): Promise<void> {
    const result = await this.worker
      .multi()
      .xack(this.options.streamKey, this.options.group, id)
      .xdel(this.options.streamKey, id)
      .exec();
    if (!result || result.some(([error]) => error)) {
      throw new Error(`${this.options.signalName} queue acknowledgement failed`);
    }
  }

  private async deadLetter(
    id: string,
    payload: string,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof Error ? error.message : "Unknown delivery failure";
    console.error(
      `${this.options.signalName} queue delivery failed permanently for ${id}: ${message}`,
    );
    // Only acknowledge the source after dead-letter storage succeeded. Redis
    // MULTI continues after a failed XADD (for example OOM), which could discard
    // a record without storing its failed-delivery copy.
    const result = await this.worker.eval(
      DEAD_LETTER, 2, this.options.streamKey, this.options.deadLetterKey,
      this.options.group, id, message.slice(0, 1_000), payload,
      this.options.maxAgeSeconds || 0, this.options.maxDeadLetterEntries || 1_000,
    );
    if (Number(result) !== 1) {
      throw new Error(`${this.options.signalName} dead-letter storage failed`);
    }
  }

  async close(): Promise<void> {
    this.stopping = true;
    this.worker.disconnect(false);
    if (this.producer.status !== "end")
      await this.producer.quit().catch(() => undefined);
    await this.workerPromise;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function queuePayloads<T>(records: T[], maxBytes?: number): string[] {
  if (!maxBytes) return chunk(records, 250).map((rows) => JSON.stringify(rows));
  const payloads: string[] = [];
  let lines: string[] = [];
  let bytes = 2;
  for (const record of records) {
    const line = JSON.stringify(record);
    const size = Buffer.byteLength(line);
    if (size + 2 > maxBytes) throw new Error("Analytics record exceeds the durable queue message size limit");
    if (lines.length && (bytes + size + 1 > maxBytes || lines.length >= 250)) {
      payloads.push(`[${lines.join(",")}]`);
      lines = [];
      bytes = 2;
    }
    bytes += size + (lines.length ? 1 : 0);
    lines.push(line);
  }
  if (lines.length) payloads.push(`[${lines.join(",")}]`);
  return payloads;
}

export default { DurableQueue };
