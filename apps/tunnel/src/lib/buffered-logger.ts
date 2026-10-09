export interface AnalyticsQueue<T> {
  enqueue(records: T[]): Promise<void>;
  start(): void;
  close(): Promise<void>;
}

/** Retain failed Redis writes, bound memory, and serialize flushes. */
export class BufferedAnalyticsLogger<T> {
  private readonly buffer: { record: T; bytes: number }[] = [];
  private bufferBytes = 0;
  private flushing: Promise<void> | null = null;
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly queue: AnalyticsQueue<T>,
    private readonly name: string,
    private readonly batchSize: number,
    private readonly flushIntervalMs: number,
    private readonly maxBufferBytes = 16 * 1024 * 1024,
    private readonly maxRecordBytes = 0,
  ) {}

  start(deliver = true): void {
    if (this.interval) return;
    if (deliver) this.queue.start();
    this.interval = setInterval(() => {
      void this.flush().catch(() => {
        console.error(`${this.name} analytics could not reach Redis; buffered records will retry`);
      });
    }, this.flushIntervalMs);
    this.interval.unref();
  }

  log(record: T): void {
    const bytes = Buffer.byteLength(JSON.stringify(record));
    if (this.maxRecordBytes && bytes > this.maxRecordBytes) {
      console.error(`${this.name} analytics record exceeds the capture size limit; only this record was rejected`);
      return;
    }
    if (this.bufferBytes + bytes > this.maxBufferBytes) {
      // A bounded in-memory fallback cannot safely absorb an unlimited outage.
      // Make overload explicit without exposing request data in the error.
      console.error(`${this.name} analytics buffer is full; one record was rejected`);
      return;
    }
    this.buffer.push({ record, bytes });
    this.bufferBytes += bytes;
    // Captures can contain two large base64 bodies. Flush on bytes as well as
    // rows so a normal low-count burst does not fill the fallback buffer.
    if (this.buffer.length >= this.batchSize || this.bufferBytes >= 4 * 1024 * 1024) {
      void this.flush().catch(() => {
        console.error(`${this.name} analytics could not reach Redis; buffered records will retry`);
      });
    }
  }

  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.flushPending().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  private async flushPending(): Promise<void> {
    while (this.buffer.length) {
      const batch = this.buffer.slice(0, this.batchSize);
      await this.queue.enqueue(batch.map(({ record }) => record));
      this.buffer.splice(0, batch.length);
      this.bufferBytes -= batch.reduce((total, item) => total + item.bytes, 0);
    }
  }

  async shutdown(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    try {
      await this.flush();
    } finally {
      await this.queue.close();
    }
  }
}
