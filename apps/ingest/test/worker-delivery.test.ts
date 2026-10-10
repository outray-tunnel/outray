import assert from "node:assert/strict";
import test from "node:test";
import type { TinybirdSpanRecord } from "../src/tinybird.js";
import {
  consumeBatch,
  enqueueRecords,
  MAX_QUEUE_BATCH_BYTES,
  MAX_QUEUE_BATCH_MESSAGES,
  MAX_QUEUE_MESSAGE_BYTES,
  MAX_MESSAGE_RECORDS,
  type IngestMessage,
  type WorkerDeliveryEnv,
} from "../src/worker/delivery.js";

const encoder = new TextEncoder();

function span(index: number, content = ""): TinybirdSpanRecord {
  return {
    organization_id: "org_test",
    retention_days: 3,
    ingested_at: "2026-10-10T12:00:00.000Z",
    start_time: "2026-10-10T12:00:00.000Z",
    end_time: "2026-10-10T12:00:00.100Z",
    trace_id: "a".repeat(32),
    span_id: index.toString(16).padStart(16, "0"),
    parent_span_id: "",
    trace_state: "",
    span_name: "test operation",
    span_kind: 2,
    service_name: "test-service",
    service_namespace: "",
    service_version: "1",
    environment: "test",
    region: "test",
    scope_name: "test",
    scope_version: "1",
    duration_nano: 100_000_000,
    status_code: 1,
    status_message: "",
    http_method: "GET",
    resource_attributes: {},
    span_attributes: {},
    scope_attributes: {},
    events: content,
    links: "[]",
  };
}

function fixture(
  options: {
    sendError?: boolean;
    putError?: boolean;
    beforeSend?: () => Promise<void>;
  } = {},
) {
  const batches: MessageSendRequest<IngestMessage>[][] = [];
  const objects = new Map<string, Uint8Array>();
  const operations: string[] = [];
  let getCount = 0;
  let deleted = 0;
  const env: WorkerDeliveryEnv = {
    TINYBIRD_API_HOST: "https://tinybird.test",
    TINYBIRD_INGEST_TOKEN: "private-test-token",
    OTLP_QUEUE: {
      async sendBatch(messages: Iterable<MessageSendRequest<IngestMessage>>) {
        operations.push("send");
        await options.beforeSend?.();
        if (options.sendError) throw new Error("queue unavailable");
        batches.push([...messages]);
      },
    } as unknown as Queue<IngestMessage>,
    OTLP_OVERFLOW: {
      async put(key: string, value: Uint8Array) {
        operations.push("put");
        if (options.putError) throw new Error("R2 unavailable");
        objects.set(key, new Uint8Array(value));
      },
      async get(key: string) {
        getCount += 1;
        const bytes = objects.get(key);
        return bytes
          ? {
              size: bytes.byteLength,
              async arrayBuffer() {
                return bytes.slice().buffer;
              },
            }
          : null;
      },
      async delete() {
        deleted += 1;
      },
    } as unknown as R2Bucket,
  };
  return {
    env,
    batches,
    objects,
    operations,
    get getCount() {
      return getCount;
    },
    get deleted() {
      return deleted;
    },
  };
}

function queueBatch(bodies: unknown[], attempts = 1) {
  const state = bodies.map(() => ({
    acks: 0,
    retries: [] as QueueRetryOptions[],
  }));
  const batch: MessageBatch<IngestMessage> = {
    queue: "test-otlp",
    messages: bodies.map((body, index) => ({
      id: `message-${index}`,
      timestamp: new Date("2026-10-10T12:00:00.000Z"),
      attempts,
      body: body as IngestMessage,
      ack() {
        state[index]!.acks += 1;
      },
      retry(options: QueueRetryOptions = {}) {
        state[index]!.retries.push(options);
      },
    })),
    ackAll() {
      throw new Error("Must acknowledge messages individually");
    },
    retryAll() {
      throw new Error("Must retry messages individually");
    },
  };
  return { batch, state };
}

async function withTinybird(
  run: (
    requests: { url: string; rows: unknown[]; authorization: string | null }[],
  ) => Promise<void>,
  response?: (rows: unknown[], index: number) => Response,
) {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const requests: {
    url: string;
    rows: unknown[];
    authorization: string | null;
  }[] = [];
  globalThis.fetch = async (input, init) => {
    const rows = String(init?.body)
      .split("\n")
      .map((line) => JSON.parse(line));
    requests.push({
      url: String(input),
      rows,
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return (
      response?.(rows, requests.length - 1) ??
      Response.json({ successful_rows: rows.length, quarantined_rows: 0 })
    );
  };
  console.error = () => {};
  try {
    await run(requests);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
}

test("Worker delivery packs UTF-8 bytes instead of string characters without changing stable IDs", async () => {
  const f = fixture();
  const rows = Array.from({ length: 8 }, (_, index) =>
    span(index, "🚀".repeat(12_000)),
  );
  await enqueueRecords(f.env, "traces", rows);
  const messages = f.batches.flat().map((item) => item.body);
  assert.equal(f.objects.size, 0);
  assert.equal(messages.length, 4);
  const stored = messages.flatMap((body) =>
    body.kind === "inline" ? body.rows : [],
  );
  assert.deepEqual(stored, rows);
  for (const body of messages) {
    assert.ok(
      encoder.encode(JSON.stringify(body)).byteLength <=
        MAX_QUEUE_MESSAGE_BYTES,
    );
  }
  for (const batch of f.batches) {
    assert.ok(
      encoder.encode(JSON.stringify(batch)).byteLength + batch.length * 100 <=
        MAX_QUEUE_BATCH_BYTES,
    );
    assert.ok(batch.length <= MAX_QUEUE_BATCH_MESSAGES);
    assert.ok(batch.every((item) => item.contentType === "json"));
  }
});

test("Worker delivery bounds rows per message and total sendBatch bytes", async () => {
  const small = fixture();
  await enqueueRecords(
    small.env,
    "traces",
    Array.from({ length: 251 }, (_, i) => span(i)),
  );
  const counts = small.batches.flat().map((item) => item.body.count);
  assert.equal(
    counts.reduce((sum, count) => sum + count, 0),
    251,
  );
  assert.ok(counts.every((count) => count <= MAX_MESSAGE_RECORDS));

  const large = fixture();
  await enqueueRecords(
    large.env,
    "traces",
    Array.from({ length: 7 }, (_, i) => span(i, "x".repeat(80_000))),
  );
  assert.deepEqual(
    large.batches.map((batch) => batch.length),
    [3, 3, 1],
  );
  for (const batch of large.batches) {
    assert.ok(
      encoder.encode(JSON.stringify(batch)).byteLength + batch.length * 100 <=
        MAX_QUEUE_BATCH_BYTES,
    );
  }
});

test("Worker delivery waits for durable Queue confirmation and leaves empty payloads alone", async () => {
  let release!: () => void;
  const confirmation = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = fixture({ beforeSend: () => confirmation });
  let done = false;
  const pending = enqueueRecords(f.env, "traces", [span(1)]).then(() => {
    done = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(done, false);
  release();
  await pending;
  assert.equal(done, true);
  await enqueueRecords(f.env, "traces", []);
  assert.equal(f.batches.length, 1);
});

test("oversized sanitized rows are durably stored in R2 before a checksum-protected pointer is queued", async () => {
  const f = fixture();
  const row = span(1, "x".repeat(140_000));
  await enqueueRecords(f.env, "traces", [row]);
  assert.deepEqual(f.operations, ["put", "send"]);
  const pointer = f.batches[0]![0]!.body;
  assert.equal(pointer.kind, "overflow");
  if (pointer.kind !== "overflow") return;
  assert.equal(pointer.count, 1);
  assert.equal(pointer.organizationId, "org_test");
  assert.match(pointer.sha256, /^[0-9a-f]{64}$/);
  assert.ok(encoder.encode(JSON.stringify(pointer)).byteLength < 1000);
  const { batch, state } = queueBatch([pointer]);
  await withTinybird(async (requests) => {
    await consumeBatch(batch, f.env);
    assert.deepEqual(requests[0]!.rows, [row]);
    assert.equal(requests[0]!.authorization, "Bearer private-test-token");
  });
  assert.equal(state[0]!.acks, 1);
  assert.equal(state[0]!.retries.length, 0);
  assert.equal(f.objects.size, 1);
  assert.equal(
    f.deleted,
    0,
    "retain object until lifecycle so redelivery cannot lose the row",
  );
});

test("sendBatch accepts at most 100 messages, including small overflow pointers", async () => {
  const f = fixture();
  await enqueueRecords(
    f.env,
    "traces",
    Array.from({ length: 101 }, (_, i) => span(i, "x".repeat(124_000))),
  );
  assert.deepEqual(
    f.batches.map((batch) => batch.length),
    [100, 1],
  );
  assert.equal(f.objects.size, 101);
});

test("Queue and R2 failures reject admission; ambiguous enqueue failure retains overflow objects", async () => {
  const f = fixture({ sendError: true });
  await assert.rejects(
    enqueueRecords(f.env, "traces", [span(1, "x".repeat(130_000))]),
    /queue unavailable/,
  );
  assert.equal(f.objects.size, 1);
  assert.equal(f.deleted, 0);
  assert.equal(f.batches.length, 0);
  const failedR2 = fixture({ putError: true });
  await assert.rejects(
    enqueueRecords(failedR2.env, "traces", [span(1, "x".repeat(130_000))]),
    /R2 unavailable/,
  );
  assert.deepEqual(failedR2.operations, ["put"]);
});

test("successful messages are acknowledged individually while downstream failure retries with a bounded delay", async () => {
  const f = fixture();
  await enqueueRecords(f.env, "traces", [span(1)]);
  const message = f.batches[0]![0]!.body;
  const { batch, state } = queueBatch([message, message], 20);
  await withTinybird(
    async () => {
      await consumeBatch(batch, f.env);
    },
    (rows, index) =>
      index === 0
        ? new Response("error", { status: 503 })
        : Response.json({ successful_rows: rows.length, quarantined_rows: 0 }),
  );
  assert.deepEqual(state, [
    { acks: 0, retries: [{ delaySeconds: 300 }] },
    { acks: 1, retries: [] },
  ]);
});

test("Tinybird partial commit, quarantine, and invalid acknowledgement never acknowledge a queue message", async () => {
  for (const response of [
    Response.json({ successful_rows: 0, quarantined_rows: 0 }),
    Response.json({ successful_rows: 1, quarantined_rows: 1 }),
    new Response("not-json"),
  ]) {
    const f = fixture();
    await enqueueRecords(f.env, "traces", [span(1)]);
    const { batch, state } = queueBatch([f.batches[0]![0]!.body]);
    await withTinybird(
      async () => consumeBatch(batch, f.env),
      () => response,
    );
    assert.equal(state[0]!.acks, 0);
    assert.equal(state[0]!.retries.length, 1);
  }
});

test("malformed envelopes and cross-organization inline data are retried without touching Tinybird or R2", async () => {
  const f = fixture();
  const inline = {
    version: 1,
    kind: "inline",
    signal: "traces",
    organizationId: "org_test",
    count: 1,
    rows: [span(1)],
  };
  const { batch, state } = queueBatch([
    null,
    { ...inline, version: 2 },
    { ...inline, signal: "unknown" },
    { ...inline, count: 0 },
    { ...inline, organizationId: "org_other" },
    { ...inline, rows: [] },
  ]);
  await withTinybird(async (requests) => {
    await consumeBatch(batch, f.env);
    assert.equal(requests.length, 0);
  });
  assert.equal(f.getCount, 0);
  assert.ok(
    state.every((item) => item.acks === 0 && item.retries.length === 1),
  );
  await assert.rejects(
    enqueueRecords(f.env, "traces", [
      span(1),
      { ...span(2), organization_id: "org_other" },
    ]),
    /inconsistent/,
  );
});

test("missing, tampered, mismatched, or out-of-prefix overflow objects never commit or acknowledge", async () => {
  const f = fixture();
  await enqueueRecords(f.env, "traces", [span(1, "x".repeat(130_000))]);
  const pointer = f.batches[0]![0]!.body;
  if (pointer.kind !== "overflow") throw new Error("Expected overflow pointer");
  const { batch, state } = queueBatch([
    { ...pointer, key: "unrelated.json" },
    {
      ...pointer,
      key: pointer.key.replace(
        /\/[^/]+\.json$/,
        "/00000000-0000-4000-8000-000000000001.json",
      ),
    },
    { ...pointer, sha256: "0".repeat(64) },
    { ...pointer, bytes: pointer.bytes + 1 },
    { ...pointer, count: 2 },
  ]);
  await withTinybird(async (requests) => {
    await consumeBatch(batch, f.env);
    assert.equal(requests.length, 0);
  });
  assert.ok(
    state.every((item) => item.acks === 0 && item.retries.length === 1),
  );
  assert.equal(f.objects.size, 1);
  assert.equal(f.deleted, 0);
});

test("delivery error logs contain metadata only, not untrusted provider response text", async () => {
  const f = fixture();
  await enqueueRecords(f.env, "traces", [span(1)]);
  const { batch } = queueBatch([f.batches[0]![0]!.body]);
  const logged: unknown[] = [];
  await withTinybird(
    async () => {
      console.error = (...args) => {
        logged.push(args);
      };
      await consumeBatch(batch, f.env);
    },
    () => new Response("private-test-token SECRET_PAYLOAD", { status: 500 }),
  );
  const log = JSON.stringify(logged);
  assert.match(log, /delivery_failed/);
  assert.doesNotMatch(log, /private-test-token|SECRET_PAYLOAD/);
});
