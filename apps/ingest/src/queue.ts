import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { Redis } from "ioredis";
import type { TinybirdIngestClient, TinybirdSpanRecord } from "./tinybird.js";

interface TraceQueueOptions {
  redisUrl: string;
  streamKey: string;
  deadLetterKey: string;
  group: string;
  maxEntries: number;
  batchSize: number;
  maxDeliveryAttempts: number;
}

type StreamMessage = [id: string, fields: string[]];

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function fieldValue(fields: string[], name: string): string | null {
  for (let index = 0; index < fields.length; index += 2) {
    if (fields[index] === name) return fields[index + 1] ?? null;
  }
  return null;
}

export class TraceQueue {
  private readonly producer: Redis;
  private readonly worker: Redis;
  private readonly consumer = `${hostname()}:${process.pid}:${randomUUID()}`;
  private stopping = false;
  private workerPromise: Promise<void> | null = null;

  constructor(private readonly options: TraceQueueOptions) {
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
      console.error("Trace queue producer error", error),
    );
    this.worker.on("error", (error: Error) => {
      if (!this.stopping) console.error("Trace queue worker error", error);
    });
  }

  async enqueue(records: TinybirdSpanRecord[]): Promise<void> {
    if (records.length === 0) return;
    if (this.producer.status === "wait" || this.producer.status === "end") {
      await this.producer.connect();
    }

    const queued = await this.producer.xlen(this.options.streamKey);
    if (queued >= this.options.maxEntries) {
      throw new Error("Trace ingestion queue is full");
    }

    const transaction = this.producer.multi();
    for (const recordsChunk of chunk(records, 250)) {
      transaction.xadd(
        this.options.streamKey,
        "*",
        "payload",
        JSON.stringify(recordsChunk),
      );
    }
    const result = await transaction.exec();
    if (!result || result.some(([error]) => error)) {
      throw new Error("Could not durably enqueue trace data");
    }
  }

  start(tinybird: TinybirdIngestClient): void {
    if (this.workerPromise) return;
    this.workerPromise = this.run(tinybird).catch((error) => {
      if (!this.stopping)
        console.error("Trace queue stopped unexpectedly", error);
    });
  }

  private async run(tinybird: TinybirdIngestClient): Promise<void> {
    while (!this.stopping) {
      try {
        if (this.worker.status === "wait" || this.worker.status === "end") {
          await this.worker.connect();
        }
        await this.createConsumerGroup();
        await this.recoverStale(tinybird);
        let lastRecoveryAt = Date.now();

        while (!this.stopping) {
          if (Date.now() - lastRecoveryAt >= 30_000) {
            await this.recoverStale(tinybird);
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
          for (const message of messages) await this.deliver(message, tinybird);
        }
      } catch (error) {
        if (this.stopping) break;
        console.error("Trace queue worker will retry", error);
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

  private async recoverStale(tinybird: TinybirdIngestClient): Promise<void> {
    let cursor = "0-0";
    do {
      const result = (await this.worker.xautoclaim(
        this.options.streamKey,
        this.options.group,
        this.consumer,
        60_000,
        cursor,
        "COUNT",
        this.options.batchSize,
      )) as [string, StreamMessage[]];
      cursor = result[0];
      for (const message of result[1] ?? [])
        await this.deliver(message, tinybird);
    } while (!this.stopping && cursor !== "0-0");
  }

  private async deliver(
    [id, fields]: StreamMessage,
    tinybird: TinybirdIngestClient,
  ): Promise<void> {
    const payload = fieldValue(fields, "payload");
    if (!payload) {
      await this.acknowledge(id);
      return;
    }

    let records: TinybirdSpanRecord[];
    try {
      records = JSON.parse(payload) as TinybirdSpanRecord[];
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
        await tinybird.appendSpans(records);
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
    await this.worker
      .multi()
      .xack(this.options.streamKey, this.options.group, id)
      .xdel(this.options.streamKey, id)
      .exec();
  }

  private async deadLetter(
    id: string,
    payload: string,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof Error ? error.message : "Unknown delivery failure";
    console.error(
      `Trace queue delivery failed permanently for ${id}: ${message}`,
    );
    await this.worker
      .multi()
      .xadd(
        this.options.deadLetterKey,
        "MAXLEN",
        "~",
        1_000,
        "*",
        "source_id",
        id,
        "error",
        message.slice(0, 1_000),
        "payload",
        payload,
      )
      .xack(this.options.streamKey, this.options.group, id)
      .xdel(this.options.streamKey, id)
      .exec();
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
