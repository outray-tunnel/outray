import {
  TinybirdIngestClient,
  type TinybirdLogRecord,
  type TinybirdMetricRecord,
  type TinybirdSpanRecord,
} from "../tinybird.js";

export type IngestSignal = "traces" | "logs" | "metrics";
export type IngestRecord =
  TinybirdSpanRecord | TinybirdLogRecord | TinybirdMetricRecord;

interface MessageBase {
  version: 1;
  signal: IngestSignal;
  organizationId: string;
  count: number;
}

export interface InlineIngestMessage extends MessageBase {
  kind: "inline";
  rows: IngestRecord[];
}

export interface OverflowIngestMessage extends MessageBase {
  kind: "overflow";
  key: string;
  bytes: number;
  sha256: string;
}

export type IngestMessage = InlineIngestMessage | OverflowIngestMessage;

export interface WorkerDeliveryEnv {
  OTLP_QUEUE: Queue<IngestMessage>;
  OTLP_OVERFLOW: R2Bucket;
  TINYBIRD_API_HOST: string;
  TINYBIRD_INGEST_TOKEN: string;
}

// Reserve space below Cloudflare's decimal 128 KB / 256 KB limits for message
// metadata and batch framing. Limits apply to UTF-8 bytes, not JS characters.
export const MAX_QUEUE_MESSAGE_BYTES = 124_000;
export const MAX_QUEUE_BATCH_BYTES = 250_000;
export const MAX_QUEUE_BATCH_MESSAGES = 100;
export const MAX_MESSAGE_RECORDS = 250;
export const MAX_OVERFLOW_OBJECT_BYTES = 32 * 1024 * 1024;
const MESSAGE_METADATA_BYTES = 100;
const OVERFLOW_PREFIX = "otlp-overflow/v1/";
const encoder = new TextEncoder();

class InvalidDeliveryMessage extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validSignal(signal: unknown): signal is IngestSignal {
  return signal === "traces" || signal === "logs" || signal === "metrics";
}

function validRow(
  row: unknown,
  signal: IngestSignal,
  organizationId: string,
): row is IngestRecord {
  if (!isObject(row) || row.organization_id !== organizationId) return false;
  if (signal === "traces") {
    return typeof row.trace_id === "string" && typeof row.span_id === "string";
  }
  return typeof row.event_id === "string";
}

function validateBase(
  value: unknown,
): asserts value is MessageBase & Record<string, unknown> {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    !validSignal(value.signal) ||
    typeof value.organizationId !== "string" ||
    !value.organizationId ||
    value.organizationId.length > 256 ||
    !Number.isInteger(value.count) ||
    (value.count as number) < 1 ||
    (value.count as number) > MAX_MESSAGE_RECORDS
  ) {
    throw new InvalidDeliveryMessage("Invalid delivery envelope");
  }
}

function validateInline(value: unknown): asserts value is InlineIngestMessage {
  validateBase(value);
  if (
    value.kind !== "inline" ||
    !Array.isArray(value.rows) ||
    value.rows.length !== value.count ||
    !value.rows.every((row) =>
      validRow(row, value.signal, value.organizationId),
    )
  ) {
    throw new InvalidDeliveryMessage("Invalid delivery rows");
  }
}

function overflowKeyPrefix(signal: IngestSignal, organizationId: string) {
  return `${OVERFLOW_PREFIX}${encodeURIComponent(organizationId)}/${signal}/`;
}

function validateOverflow(
  value: unknown,
): asserts value is OverflowIngestMessage {
  validateBase(value);
  const prefix = overflowKeyPrefix(value.signal, value.organizationId);
  if (
    value.kind !== "overflow" ||
    typeof value.key !== "string" ||
    !value.key.startsWith(prefix) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/i.test(
      value.key.slice(prefix.length),
    ) ||
    !Number.isInteger(value.bytes) ||
    (value.bytes as number) < 1 ||
    (value.bytes as number) > MAX_OVERFLOW_OBJECT_BYTES ||
    typeof value.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.sha256)
  ) {
    throw new InvalidDeliveryMessage("Invalid delivery overflow reference");
  }
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Pack already-normalized rows; never put raw OTLP bodies or credentials in R2. */
export async function enqueueRecords(
  env: WorkerDeliveryEnv,
  signal: IngestSignal,
  rows: readonly IngestRecord[],
): Promise<void> {
  if (rows.length === 0) return;
  const organizationId = rows[0]?.organization_id;
  if (
    !validSignal(signal) ||
    !organizationId ||
    organizationId.length > 256 ||
    !rows.every((row) => validRow(row, signal, organizationId))
  ) {
    throw new InvalidDeliveryMessage("Cannot enqueue inconsistent records");
  }

  let inlineRows: IngestRecord[] = [];
  let inlineRowBytes = 0;
  let batch: MessageSendRequest<IngestMessage>[] = [];
  let batchBytes = 2;
  const inline = (items: IngestRecord[]): InlineIngestMessage => ({
    version: 1,
    kind: "inline",
    signal,
    organizationId,
    count: items.length,
    rows: items,
  });
  const envelopeBytes = encoder.encode(JSON.stringify(inline([]))).byteLength;
  const messageBytes = (count: number, rowBytes: number) =>
    envelopeBytes +
    rowBytes +
    Math.max(0, count - 1) +
    String(count).length -
    1;

  const flushBatch = async () => {
    if (batch.length === 0) return;
    // Queue resolution confirms durable storage; do not defer this to waitUntil.
    await env.OTLP_QUEUE.sendBatch(batch);
    batch = [];
    batchBytes = 2;
  };
  const addMessage = async (body: IngestMessage) => {
    const item = { body, contentType: "json" as const };
    const bytes =
      encoder.encode(JSON.stringify(item)).byteLength + MESSAGE_METADATA_BYTES;
    if (
      batch.length === MAX_QUEUE_BATCH_MESSAGES ||
      batchBytes + bytes + 1 > MAX_QUEUE_BATCH_BYTES
    ) {
      await flushBatch();
    }
    batch.push(item);
    batchBytes += bytes + 1;
  };
  const flushInline = async () => {
    if (!inlineRows.length) return;
    await addMessage(inline(inlineRows));
    inlineRows = [];
    inlineRowBytes = 0;
  };

  for (const row of rows) {
    const serialized = JSON.stringify(row);
    const rowBytes = encoder.encode(serialized).byteLength;
    if (messageBytes(1, rowBytes) > MAX_QUEUE_MESSAGE_BYTES) {
      await flushInline();
      const payload = JSON.stringify(inline([row]));
      const bytes = encoder.encode(payload);
      if (bytes.byteLength > MAX_OVERFLOW_OBJECT_BYTES) {
        throw new InvalidDeliveryMessage(
          "Normalized row exceeds overflow safety limit",
        );
      }
      const key = `${overflowKeyPrefix(signal, organizationId)}${crypto.randomUUID()}.json`;
      const digest = await sha256(bytes);
      await env.OTLP_OVERFLOW.put(key, bytes, {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { signal, organizationId, sha256: digest },
      });
      await addMessage({
        version: 1,
        kind: "overflow",
        signal,
        organizationId,
        count: 1,
        key,
        bytes: bytes.byteLength,
        sha256: digest,
      });
    } else {
      const nextCount = inlineRows.length + 1;
      if (
        nextCount > MAX_MESSAGE_RECORDS ||
        messageBytes(nextCount, inlineRowBytes + rowBytes) >
          MAX_QUEUE_MESSAGE_BYTES
      ) {
        await flushInline();
      }
      inlineRows.push(row);
      inlineRowBytes += rowBytes;
    }
  }
  await flushInline();
  await flushBatch();
}

async function resolveRows(
  env: WorkerDeliveryEnv,
  body: unknown,
): Promise<InlineIngestMessage> {
  if (isObject(body) && body.kind === "inline") {
    validateInline(body);
    return body;
  }
  validateOverflow(body);
  const object = await env.OTLP_OVERFLOW.get(body.key);
  if (
    !object ||
    object.size !== body.bytes ||
    object.size > MAX_OVERFLOW_OBJECT_BYTES
  ) {
    throw new InvalidDeliveryMessage("Missing or mismatched overflow object");
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (
    bytes.byteLength !== body.bytes ||
    (await sha256(bytes)) !== body.sha256
  ) {
    throw new InvalidDeliveryMessage("Overflow checksum mismatch");
  }
  const payload: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
  );
  validateInline(payload);
  if (
    payload.signal !== body.signal ||
    payload.organizationId !== body.organizationId ||
    payload.count !== body.count
  ) {
    throw new InvalidDeliveryMessage("Overflow envelope mismatch");
  }
  return payload;
}

/** Each message is acknowledged only after Tinybird confirms every row committed. */
export async function consumeBatch(
  batch: MessageBatch<IngestMessage>,
  env: WorkerDeliveryEnv,
): Promise<void> {
  const tinybird = new TinybirdIngestClient(
    env.TINYBIRD_API_HOST,
    env.TINYBIRD_INGEST_TOKEN,
  );
  // Sequential processing bounds isolate memory when a batch contains large R2
  // records. The consumer batch size is configured to ten messages.
  for (const message of batch.messages) {
    try {
      const payload = await resolveRows(env, message.body);
      if (payload.signal === "traces") {
        await tinybird.appendSpans(payload.rows as TinybirdSpanRecord[]);
      } else if (payload.signal === "logs") {
        await tinybird.appendLogs(payload.rows as TinybirdLogRecord[]);
      } else {
        await tinybird.appendMetrics(payload.rows as TinybirdMetricRecord[]);
      }
      message.ack();
      // Keep overflow objects for the bucket lifecycle (30 days): deleting now
      // would break a redelivery if the consumer dies before its ack persists.
    } catch (error) {
      message.retry({
        delaySeconds: Math.min(300, 5 * 2 ** Math.min(message.attempts, 6)),
      });
      // Provider errors can include response bodies. Never log telemetry, token
      // values, or untrusted exception text from a failed delivery.
      console.error("OTLP queue delivery failed", {
        queue: batch.queue,
        messageId: message.id,
        attempts: message.attempts,
        reason:
          error instanceof InvalidDeliveryMessage
            ? "invalid_message"
            : "delivery_failed",
      });
    }
  }
}
