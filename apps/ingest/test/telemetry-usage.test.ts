import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import type { IngestAuthContext } from "../src/auth.js";
import {
  enqueueWithTelemetryQuota,
  telemetryAdmissionChunks,
  TelemetryQuotaExceeded,
  type UsageDatabase,
} from "../src/telemetry-usage.js";
import usagePolicy from "../../../shared/telemetry-usage.js";
import { handleIngestRequest } from "../src/worker/http.js";
import { parseTracePayload } from "../src/otlp.js";
import { parseLogsPayload } from "../src/logs.js";
import { parseMetricsPayload } from "../src/metrics.js";
import { normalizeWithinBudget } from "../src/normalize.js";
import {
  toTinybirdSpan,
  toTinybirdLog,
  toTinybirdMetric,
} from "../src/tinybird.js";
import type { IngestRecord, IngestSignal } from "../src/worker/delivery.js";
import { outray } from "../src/proto/otlp.generated.js";
const { telemetryUsagePeriod } = usagePolicy;

const october = new Date("2026-10-15T12:00:00Z");
const auth: IngestAuthContext = {
  organizationId: "org_usage",
  tokenId: "token_usage",
  retentionDays: 30,
  telemetryBytesPerMonth: 1024 ** 3,
};
function record(index = 0) {
  return {
    organization_id: auth.organizationId,
    retention_days: 30,
    ingested_at: "2026-10-15T12:00:00.000Z",
    event_id: String(index).padStart(4, "0"),
    body: "normalized café 🔒",
    attributes: { path: "/orders", authorization: "[REDACTED]" },
  };
}
type Row = ReturnType<typeof record>;
const bytes = (rows: Row[]) =>
  rows.reduce(
    (total, row) => total + Buffer.byteLength(JSON.stringify(row)),
    0,
  );

/** Transactional SQL seam, with exclusive locking shared by all fake connections. */
export class FakeUsageStore {
  counters = new Map<string, number>();
  receipts = new Map<string, { month: string; bytes: number }>();
  permanent = new Map<string, bigint>();
  calls: string[] = [];
  unavailable = false;
  private tail: Promise<void> = Promise.resolve();

  connection(): UsageDatabase {
    let counters = new Map<string, number>();
    let receipts = new Map<string, { month: string; bytes: number }>();
    let permanent = new Map<string, bigint>();
    let unlock: (() => void) | undefined;
    const store = this;
    const database = {
      async query(sql: string, values: unknown[] = []) {
        store.calls.push(sql);
        if (sql === "BEGIN") {
          const previous = store.tail;
          store.tail = new Promise<void>((resolve) => {
            unlock = resolve;
          });
          await previous;
          counters = new Map(store.counters);
          receipts = new Map(store.receipts);
          permanent = new Map(store.permanent);
          return { rows: [] };
        }
        if (sql === "COMMIT" || sql === "ROLLBACK") {
          if (sql === "COMMIT") {
            store.counters = counters;
            store.receipts = receipts;
            store.permanent = permanent;
          }
          unlock?.();
          unlock = undefined;
          return { rows: [] };
        }
        if (store.unavailable) throw new Error("quota storage unavailable");
        if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
        if (sql.includes("SELECT record_product_usage(")) {
          for (const [key, value] of Object.entries(JSON.parse(String(values[4])))) permanent.set(key, (permanent.get(key) ?? 0n) + BigInt(String(value)));
          return { rows: [{ recorded: true }] };
        }
        const [organizationId, month, metric, delta, limit] = values;
        const counterKey = `${organizationId}:${month}:${metric}`;
        if (sql.includes("INSERT INTO organization_monthly_usage")) {
          if (!counters.has(counterKey)) counters.set(counterKey, 0);
          return { rows: [] };
        }
        if (sql.includes("SELECT used FROM organization_monthly_usage")) {
          return { rows: [{ used: counters.get(counterKey) }] };
        }
        if (
          sql.includes(
            "SELECT receipt_key FROM organization_telemetry_receipts",
          )
        ) {
          return {
            rows: (month as string[])
              .filter((key) => receipts.has(`${organizationId}:${key}`))
              .map((receipt_key) => ({ receipt_key })),
          };
        }
        if (sql.includes("SET used = used +")) {
          const next = counters.get(counterKey)! + Number(delta);
          if (Number(limit) !== -1 && next > Number(limit)) return { rows: [] };
          counters.set(counterKey, next);
          return { rows: [{ used: next }] };
        }
        if (sql.includes("SET used = used -")) {
          const next = counters.get(counterKey)! - Number(delta);
          assert.ok(next >= 0);
          counters.set(counterKey, next);
          return { rows: [{ used: next }] };
        }
        if (sql.includes("INSERT INTO organization_telemetry_receipts")) {
          const keys = metric as string[];
          const sizes = delta as number[];
          keys.forEach((key, index) => {
            const id = `${organizationId}:${key}`;
            assert.equal(receipts.has(id), false, "unique receipt constraint");
            receipts.set(id, { month: String(month), bytes: sizes[index] });
          });
          return { rows: [] };
        }
        throw new Error(`Unexpected SQL in quota test: ${sql}`);
      },
    };
    return database as unknown as UsageDatabase;
  }

  used(month = "2026-10-01") {
    return (
      this.counters.get(`${auth.organizationId}:${month}:telemetry_bytes`) ?? 0
    );
  }
}

test("quota counts normalized UTF-8 rows only; empty batches never query or enqueue", async () => {
  const store = new FakeUsageStore();
  let enqueues = 0;
  await enqueueWithTelemetryQuota(
    store.connection(),
    auth,
    "logs",
    [],
    async () => {
      enqueues++;
    },
    october,
  );
  assert.equal(store.calls.length, 0);
  assert.equal(enqueues, 0);
  const row = record();
  await enqueueWithTelemetryQuota(
    store.connection(),
    auth,
    "logs",
    [row],
    async () => {
      enqueues++;
    },
    october,
  );
  assert.equal(store.used(), bytes([row]));
  assert.equal(store.permanent.get("observability.telemetry_bytes"), BigInt(bytes([row])));
  assert.equal(store.permanent.get("observability.logs"), 1n);
  assert.equal(enqueues, 1);
  assert.ok(store.used() > JSON.stringify(row).length);
});

test("the exact final byte is accepted and the next export returns429 without enqueue", async () => {
  const store = new FakeUsageStore();
  const first = record();
  const allowance = bytes([first]);
  let enqueues = 0;
  const limited = { ...auth, telemetryBytesPerMonth: allowance };
  await enqueueWithTelemetryQuota(
    store.connection(),
    limited,
    "logs",
    [first],
    async () => {
      enqueues++;
    },
    october,
  );
  await assert.rejects(
    enqueueWithTelemetryQuota(
      store.connection(),
      limited,
      "logs",
      [record(1)],
      async () => {
        enqueues++;
      },
      october,
    ),
    (error: unknown) =>
      error instanceof TelemetryQuotaExceeded &&
      error.resetsAt === "2026-11-01T00:00:00.000Z",
  );
  assert.equal(store.used(), allowance);
  assert.equal(enqueues, 1);
});

test("whole-export preflight rejects excess bytes before accepting any first chunk", async () => {
  const store = new FakeUsageStore();
  const rows = Array.from({ length: 500 }, (_, index) => record(index));
  const limited = {
    ...auth,
    telemetryBytesPerMonth: bytes(rows.slice(0, 250)),
  };
  let enqueues = 0;
  await assert.rejects(
    enqueueWithTelemetryQuota(
      store.connection(),
      limited,
      "logs",
      rows,
      async () => {
        enqueues++;
      },
      october,
    ),
    TelemetryQuotaExceeded,
  );
  assert.equal(enqueues, 0);
  assert.equal(store.used(), 0);
  assert.equal(store.receipts.size, 0);
  assert.equal(store.permanent.size, 0);
});

test("parallel replicas cannot spend more than one shared organization allowance", async () => {
  const store = new FakeUsageStore();
  const size = bytes([record()]);
  const limited = { ...auth, telemetryBytesPerMonth: size * 3 };
  let enqueues = 0;
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, (_, index) =>
      enqueueWithTelemetryQuota(
        store.connection(),
        limited,
        "logs",
        [record(index)],
        async () => {
          enqueues++;
        },
        october,
      ),
    ),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    3,
  );
  assert.equal(
    results.filter(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof TelemetryQuotaExceeded,
    ).length,
    5,
  );
  assert.equal(store.used(), size * 3);
  assert.equal(enqueues, 3);
});

test("a failed queue releases all reserved bytes and a successful retry is billed once", async () => {
  const store = new FakeUsageStore();
  const rows = [record()];
  await assert.rejects(
    enqueueWithTelemetryQuota(
      store.connection(),
      auth,
      "logs",
      rows,
      async () => {
        throw new Error("queue unavailable");
      },
      october,
    ),
    /queue unavailable/,
  );
  assert.equal(store.used(), 0);
  assert.equal(store.receipts.size, 0);
  await enqueueWithTelemetryQuota(
    store.connection(),
    auth,
    "logs",
    rows,
    async () => {},
    october,
  );
  assert.equal(store.used(), bytes(rows));
  assert.equal(store.receipts.size, 1);
});

test("partial queue failure bills only durable chunks, and retries skip those chunks", async () => {
  const store = new FakeUsageStore();
  const rows = Array.from({ length: 500 }, (_, index) => record(index));
  const chunks = telemetryAdmissionChunks("logs", rows);
  assert.equal(chunks.length, 2);
  let attempts = 0;
  await assert.rejects(
    enqueueWithTelemetryQuota(
      store.connection(),
      auth,
      "logs",
      rows,
      async () => {
        if (++attempts === 2) throw new Error("second send failed");
      },
      october,
    ),
    /second send failed/,
  );
  assert.equal(store.used(), chunks[0].bytes);
  assert.equal(store.permanent.get("observability.logs"), BigInt(chunks[0].records.length));
  assert.equal(store.permanent.get("observability.telemetry_bytes"), BigInt(chunks[0].bytes));
  assert.equal(store.receipts.size, 1);
  const retryChunks: Row[][] = [];
  await enqueueWithTelemetryQuota(
    store.connection(),
    auth,
    "logs",
    rows,
    async (chunk) => {
      retryChunks.push(chunk);
    },
    october,
  );
  assert.equal(retryChunks.length, 1);
  assert.deepEqual(retryChunks[0], chunks[1].records);
  assert.equal(store.used(), bytes(rows));
  assert.equal(store.permanent.get("observability.logs"), 500n);
  assert.equal(store.permanent.get("observability.telemetry_bytes"), BigInt(bytes(rows)));
});

test("accepted SDK retries ignore changed ingestion time, retention and attribute order", async () => {
  const store = new FakeUsageStore();
  const first = record();
  await enqueueWithTelemetryQuota(
    store.connection(),
    auth,
    "logs",
    [first],
    async () => {},
    october,
  );
  let requeued = false;
  const retry = {
    ...first,
    ingested_at: "2026-10-16T12:00:00.000Z",
    retention_days: 90,
    attributes: { authorization: "[REDACTED]", path: "/orders" },
  };
  await enqueueWithTelemetryQuota(
    store.connection(),
    auth,
    "logs",
    [retry],
    async () => {
      requeued = true;
    },
    october,
  );
  assert.equal(requeued, false);
  assert.equal(store.used(), bytes([first]));
  assert.equal(store.permanent.get("observability.logs"), 1n);
});

test("retry chunk boundaries do not change when a plan changes retention metadata", () => {
  const rows = Array.from({ length: 50 }, (_, index) => ({
    ...record(index),
    body: "x".repeat(9800),
    retention_days: 3,
  }));
  const original = telemetryAdmissionChunks("logs", rows);
  const retry = telemetryAdmissionChunks(
    "logs",
    rows.map((row) => ({ ...row, retention_days: 90 })),
  );
  assert.deepEqual(
    original.map((chunk) => chunk.key),
    retry.map((chunk) => chunk.key),
  );
  assert.deepEqual(
    original.map((chunk) => chunk.records.length),
    retry.map((chunk) => chunk.records.length),
  );
});

test("an ambiguous committed database response cannot double-charge a retry", async () => {
  const store = new FakeUsageStore();
  const connection = store.connection();
  const ambiguous = {
    async query(...args: unknown[]) {
      const result = await (
        connection.query as (...values: unknown[]) => Promise<unknown>
      )(...args);
      if (args[0] === "COMMIT") throw new Error("commit response lost");
      return result;
    },
  } as unknown as UsageDatabase;
  const rows = [record()];
  await assert.rejects(
    enqueueWithTelemetryQuota(
      ambiguous,
      auth,
      "logs",
      rows,
      async () => {},
      october,
    ),
    /commit response lost/,
  );
  assert.equal(store.used(), bytes(rows));
  await enqueueWithTelemetryQuota(
    store.connection(),
    auth,
    "logs",
    rows,
    async () => {
      assert.fail("committed retry should not requeue");
    },
    october,
  );
  assert.equal(store.used(), bytes(rows));
  assert.equal(store.permanent.get("observability.logs"), 1n);
});

test("UTC calendar months reset across year boundaries regardless of annual billing", async () => {
  assert.deepEqual(telemetryUsagePeriod(new Date("2026-12-31T23:59:59.999Z")), {
    month: "2026-12-01",
    startsAt: "2026-12-01T00:00:00.000Z",
    resetsAt: "2027-01-01T00:00:00.000Z",
  });
  const store = new FakeUsageStore();
  const limited = { ...auth, telemetryBytesPerMonth: bytes([record()]) };
  await enqueueWithTelemetryQuota(
    store.connection(),
    limited,
    "logs",
    [record()],
    async () => {},
    new Date("2026-12-31T23:59:59Z"),
  );
  await enqueueWithTelemetryQuota(
    store.connection(),
    limited,
    "logs",
    [record(1)],
    async () => {},
    new Date("2027-01-01T00:00:00Z"),
  );
  assert.equal(store.used("2026-12-01"), limited.telemetryBytesPerMonth);
  assert.equal(store.used("2027-01-01"), limited.telemetryBytesPerMonth);
  // An old accepted export retry across a reset does not charge either month twice.
  await enqueueWithTelemetryQuota(
    store.connection(),
    limited,
    "logs",
    [record()],
    async () => {
      assert.fail("old retry should not enqueue");
    },
    new Date("2027-01-01T00:00:00Z"),
  );
  assert.equal(store.used("2027-01-01"), limited.telemetryBytesPerMonth);
});

test("concurrent identical exports across a UTC month boundary share one receipt", async () => {
  const store = new FakeUsageStore();
  let queued = 0;
  await Promise.all([
    enqueueWithTelemetryQuota(
      store.connection(),
      auth,
      "logs",
      [record()],
      async () => {
        queued++;
      },
      new Date("2026-10-31T23:59:59.999Z"),
    ),
    enqueueWithTelemetryQuota(
      store.connection(),
      auth,
      "logs",
      [record()],
      async () => {
        queued++;
      },
      new Date("2026-11-01T00:00:00.000Z"),
    ),
  ]);
  assert.equal(queued, 1);
  assert.equal(
    store.used("2026-10-01") + store.used("2026-11-01"),
    bytes([record()]),
  );
  assert.equal(store.receipts.size, 1);
  assert.equal(
    store.calls.filter((sql) => sql.includes("pg_advisory_xact_lock")).length,
    2,
  );
});

test("traces, logs and metrics consume the same shared byte counter", async () => {
  const store = new FakeUsageStore();
  for (const signal of ["traces", "logs", "metrics"] as const) {
    await enqueueWithTelemetryQuota(
      store.connection(),
      auth,
      signal,
      [record()],
      async () => {},
      october,
    );
  }
  assert.equal(store.used(), 3 * bytes([record()]));
  assert.equal(store.receipts.size, 3);
});

test("quota storage errors and invalid/forged quota contexts fail closed before queue writes", async () => {
  const store = new FakeUsageStore();
  store.unavailable = true;
  const enqueue = async () => {
    assert.fail("unavailable quota storage must not accept telemetry");
  };
  await assert.rejects(
    enqueueWithTelemetryQuota(
      store.connection(),
      auth,
      "logs",
      [record()],
      enqueue,
      october,
    ),
    /quota storage unavailable/,
  );
  assert.equal(store.used(), 0);
  assert.ok(store.calls.includes("ROLLBACK"));
  for (const telemetryBytesPerMonth of [0, -2, NaN, undefined]) {
    await assert.rejects(
      enqueueWithTelemetryQuota(
        store.connection(),
        { ...auth, telemetryBytesPerMonth } as IngestAuthContext,
        "logs",
        [record()],
        enqueue,
        october,
      ),
      /Invalid telemetry quota context/,
    );
  }
  await assert.rejects(
    enqueueWithTelemetryQuota(
      store.connection(),
      auth,
      "logs",
      [{ ...record(), organization_id: "org_forged" }],
      enqueue,
      october,
    ),
    /Invalid telemetry quota context/,
  );
});

test("the internal unlimited allowance is still measured without imposing a hosted cap", async () => {
  const store = new FakeUsageStore();
  await enqueueWithTelemetryQuota(
    store.connection(),
    { ...auth, telemetryBytesPerMonth: -1 },
    "logs",
    [record()],
    async () => {},
    october,
  );
  assert.equal(store.used(), bytes([record()]));
});

function signalFixture(signal: IngestSignal) {
  const resource = {
    attributes: [
      { key: "service.name", value: { stringValue: "quota-test" } },
      { key: "api_key", value: { stringValue: "not-metered-in-cleartext" } },
    ],
  };
  if (signal === "traces")
    return {
      resourceSpans: [
        {
          resource,
          scopeSpans: [
            {
              spans: [
                {
                  traceId: Buffer.alloc(16, 1).toString("base64"),
                  spanId: Buffer.alloc(8, 1).toString("base64"),
                  name: "GET /orders",
                  kind: 2,
                  startTimeUnixNano: "1788080400123456789",
                  endTimeUnixNano: "1788080400133456789",
                },
              ],
            },
          ],
        },
      ],
    };
  if (signal === "logs")
    return {
      resourceLogs: [
        {
          resource,
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: "1788080400123456789",
                  body: { stringValue: "café 🔒" },
                  severityNumber: 9,
                },
              ],
            },
          ],
        },
      ],
    };
  return {
    resourceMetrics: [
      {
        resource,
        scopeMetrics: [
          {
            metrics: [
              {
                name: "queue.depth",
                gauge: {
                  dataPoints: [
                    { timeUnixNano: "1788080400123456789", asInt: "4" },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function nodeNormalized(
  signal: IngestSignal,
  payload: unknown,
): IngestRecord[] {
  if (signal === "traces")
    return normalizeWithinBudget(
      parseTracePayload(payload, 10_000).spans,
      (span) => toTinybirdSpan(auth.organizationId, auth.retentionDays, span),
    ).rows;
  if (signal === "logs")
    return normalizeWithinBudget(
      parseLogsPayload(payload, 10_000).records,
      (log) => toTinybirdLog(auth.organizationId, auth.retentionDays, log),
    ).rows;
  return normalizeWithinBudget(
    parseMetricsPayload(payload, 10_000).points,
    (point) => toTinybirdMetric(auth.organizationId, auth.retentionDays, point),
  ).rows;
}

for (const signal of ["traces", "logs", "metrics"] as const) {
  test(`Node and Worker ${signal} admission have identical sanitized byte metering`, async () => {
    const payload = signalFixture(signal);
    const normalized = nodeNormalized(signal, payload);
    const node = new FakeUsageStore();
    await enqueueWithTelemetryQuota(
      node.connection(),
      auth,
      signal,
      normalized,
      async () => {},
      october,
    );
    const worker = new FakeUsageStore();
    const response = await handleIngestRequest(
      new Request(`https://ingest.example.test/v1/${signal}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer outray_test",
        },
        body: JSON.stringify(payload),
      }),
      {
        authenticate: async () => auth,
        allowRequest: async () => true,
        enqueue: (queuedSignal, rows, context) =>
          enqueueWithTelemetryQuota(
            worker.connection(),
            context,
            queuedSignal,
            rows,
            async () => {},
            october,
          ),
      },
    );
    assert.equal(response.status, 200);
    assert.equal(node.used(), worker.used());
    assert.ok(node.used() > 0);
    assert.equal(
      JSON.stringify(normalized).includes("not-metered-in-cleartext"),
      false,
    );
    assert.deepEqual([...node.receipts.keys()], [...worker.receipts.keys()]);
  });

  test(`Worker ${signal} JSON-to-protobuf SDK retry is charged only once`, async () => {
    const payload = signalFixture(signal);
    const store = new FakeUsageStore();
    let queued = 0;
    const dependencies = {
      authenticate: async () => auth,
      allowRequest: async () => true,
      enqueue: (
        queuedSignal: IngestSignal,
        rows: IngestRecord[],
        context: IngestAuthContext,
      ) =>
        enqueueWithTelemetryQuota(
          store.connection(),
          context,
          queuedSignal,
          rows,
          async () => {
            queued++;
          },
          october,
        ),
    };
    const first = await handleIngestRequest(
      new Request(`https://ingest.example.test/v1/${signal}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer outray_test",
        },
        body: JSON.stringify(payload),
      }),
      dependencies,
    );
    assert.equal(first.status, 200);
    const firstUsage = store.used();
    const codec = {
      traces: outray.otlp.ExportTraceServiceRequest,
      logs: outray.otlp.ExportLogsServiceRequest,
      metrics: outray.otlp.ExportMetricsServiceRequest,
    }[signal];
    const encoded = codec.encode(codec.fromObject(payload) as never).finish();
    const retry = await handleIngestRequest(
      new Request(`https://ingest.example.test/v1/${signal}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-protobuf",
          Authorization: "Bearer outray_test",
        },
        body: new Uint8Array(encoded).buffer,
      }),
      dependencies,
    );
    assert.equal(retry.status, 200);
    assert.equal(store.used(), firstUsage);
    assert.equal(queued, 1);
  });
}

test("Worker returns429 for monthly quota and503 for missing metering storage", async () => {
  for (const unavailable of [false, true]) {
    const store = new FakeUsageStore();
    store.unavailable = unavailable;
    const limited = { ...auth, telemetryBytesPerMonth: 1 };
    let queued = false;
    const response = await handleIngestRequest(
      new Request("https://ingest.example.test/v1/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer outray_test",
        },
        body: JSON.stringify(signalFixture("logs")),
      }),
      {
        authenticate: async () => limited,
        allowRequest: async () => true,
        enqueue: (signal, rows, context) =>
          enqueueWithTelemetryQuota(
            store.connection(),
            context,
            signal,
            rows,
            async () => {
              queued = true;
            },
            october,
          ),
      },
    );
    assert.equal(response.status, unavailable ? 503 : 429);
    assert.equal(queued, false);
    assert.equal(store.used(), 0);
    if (!unavailable)
      assert.equal(
        ((await response.json()) as { resetsAt: string }).resetsAt,
        "2026-11-01T00:00:00.000Z",
      );
  }
});
