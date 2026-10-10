import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import type { IngestAuthContext } from "../src/auth.js";
import { outray } from "../src/proto/otlp.generated.js";
import {
  handleIngestRequest,
  type HttpDependencies,
} from "../src/worker/http.js";
import type { IngestRecord, IngestSignal } from "../src/worker/delivery.js";

const auth: IngestAuthContext = {
  organizationId: "org_authenticated",
  retentionDays: 30,
  tokenId: "token_authenticated",
};
const timestamp = "1788080400123456789";
const attributes = [
  { key: "service.name", value: { stringValue: "worker-test" } },
  { key: "api_key", value: { stringValue: "must-not-reach-the-queue" } },
  { key: "organization_id", value: { stringValue: "org_forged" } },
  { key: "retention_days", value: { intValue: "90" } },
];
const capturedAttributes = [
  {
    key: "outray.http.request.headers",
    value: {
      stringValue: JSON.stringify({
        authorization: "Bearer must-not-reach-the-queue",
        "x-request-id": "req_test",
      }),
    },
  },
  {
    key: "outray.http.request.body.content_type",
    value: { stringValue: "application/json" },
  },
  {
    key: "outray.http.request.body",
    value: {
      stringValue: JSON.stringify({
        password: "must-not-reach-the-queue",
        order: "order_test",
      }),
    },
  },
];

function trace(index: number) {
  return {
    traceId: Buffer.alloc(16, 1).toString("base64"),
    spanId: Buffer.alloc(8, index + 1).toString("base64"),
    startTimeUnixNano: timestamp,
    endTimeUnixNano: "1788080400133456789",
    name: "GET /orders",
    kind: 2,
    attributes: capturedAttributes,
  };
}

function log(index: number) {
  return {
    timeUnixNano: timestamp,
    observedTimeUnixNano: timestamp,
    severityNumber: 9,
    body: {
      kvlistValue: {
        values: [
          {
            key: "password",
            value: { stringValue: "must-not-reach-the-queue" },
          },
          { key: "message", value: { stringValue: `log ${index}` } },
        ],
      },
    },
    attributes: [
      {
        key: "access_token",
        value: { stringValue: "must-not-reach-the-queue" },
      },
    ],
  };
}

function metric(index: number) {
  return {
    timeUnixNano: timestamp,
    asInt: String(index + 1),
    attributes: [
      {
        key: "client_secret",
        value: { stringValue: "must-not-reach-the-queue" },
      },
    ],
  };
}

function fixture(signal: IngestSignal, count = 1, invalid = false) {
  const records = Array.from({ length: count }, (_, index) =>
    signal === "traces"
      ? trace(index)
      : signal === "logs"
        ? log(index)
        : metric(index),
  );
  if (invalid) records.push({} as (typeof records)[number]);
  const resource = { attributes };
  if (signal === "traces") {
    return { resourceSpans: [{ resource, scopeSpans: [{ spans: records }] }] };
  }
  if (signal === "logs") {
    return {
      resourceLogs: [{ resource, scopeLogs: [{ logRecords: records }] }],
    };
  }
  return {
    resourceMetrics: [
      {
        resource,
        scopeMetrics: [
          {
            metrics: [{ name: "queue.depth", gauge: { dataPoints: records } }],
          },
        ],
      },
    ],
  };
}

const codecs = {
  traces: {
    request: outray.otlp.ExportTraceServiceRequest,
    response: outray.otlp.ExportTraceServiceResponse,
    rejectedField: "rejectedSpans",
  },
  logs: {
    request: outray.otlp.ExportLogsServiceRequest,
    response: outray.otlp.ExportLogsServiceResponse,
    rejectedField: "rejectedLogRecords",
  },
  metrics: {
    request: outray.otlp.ExportMetricsServiceRequest,
    response: outray.otlp.ExportMetricsServiceResponse,
    rejectedField: "rejectedDataPoints",
  },
};
const signals = ["traces", "logs", "metrics"] as const;

function encode(signal: IngestSignal, value: unknown, protobuf: boolean) {
  if (!protobuf) return new TextEncoder().encode(JSON.stringify(value));
  const type = codecs[signal].request;
  // All three constructors accept plain records; their type-specific unions are
  // intentionally hidden here so this helper can test a common HTTP interface.
  return type
    .encode(type.fromObject(value as Record<string, unknown>) as never)
    .finish();
}

function harness(overrides: Partial<HttpDependencies> = {}) {
  const credentials: string[] = [];
  const organizations: string[] = [];
  const queued: { signal: IngestSignal; rows: IngestRecord[] }[] = [];
  const dependencies: HttpDependencies = {
    async authenticate(apiKey) {
      credentials.push(apiKey);
      return auth;
    },
    async allowRequest(organizationId) {
      organizations.push(organizationId);
      return true;
    },
    async enqueue(signal, rows) {
      queued.push({ signal, rows });
    },
    ...overrides,
  };
  return { dependencies, credentials, organizations, queued };
}

function request(
  path: string,
  body: Uint8Array | string,
  headers: HeadersInit = {},
) {
  const mergedHeaders = new Headers({
    "Content-Type": "application/json",
    Authorization: "Bearer outray_test",
  });
  new Headers(headers).forEach((value, key) => mergedHeaders.set(key, value));
  return new Request(`https://ingest.example.test${path}`, {
    method: "POST",
    headers: mergedHeaders,
    body: typeof body === "string" ? body : new Uint8Array(body).buffer,
  });
}

for (const signal of signals) {
  for (const protobuf of [false, true]) {
    for (const gzip of [false, true]) {
      for (const prefix of ["/v1", "/api/otlp/v1"]) {
        test(`Worker accepts ${gzip ? "gzip " : ""}${protobuf ? "protobuf" : "JSON"} ${signal} at ${prefix}`, async () => {
          const state = harness();
          const encoded = encode(signal, fixture(signal), protobuf);
          const response = await handleIngestRequest(
            request(`${prefix}/${signal}`, gzip ? gzipSync(encoded) : encoded, {
              "Content-Type": protobuf
                ? "application/x-protobuf; charset=binary"
                : "application/json; charset=utf-8",
              ...(gzip ? { "Content-Encoding": "gzip" } : {}),
            }),
            state.dependencies,
          );
          assert.equal(response.status, 200);
          assert.equal(response.headers.get("cache-control"), "no-store");
          assert.equal(state.queued.length, 1);
          assert.equal(state.queued[0]?.signal, signal);
          assert.equal(state.queued[0]?.rows.length, 1);
          const row = state.queued[0]!.rows[0]!;
          assert.equal(row.organization_id, auth.organizationId);
          assert.equal(row.retention_days, auth.retentionDays);
          assert.equal(row.resource_attributes.api_key, "[REDACTED]");
          assert.doesNotMatch(JSON.stringify(row), /must-not-reach-the-queue/);
          assert.deepEqual(state.credentials, ["outray_test"]);
          assert.deepEqual(state.organizations, [auth.organizationId]);
          if (protobuf) {
            assert.equal(
              response.headers.get("content-type"),
              "application/x-protobuf",
            );
            assert.equal((await response.arrayBuffer()).byteLength, 0);
          } else {
            assert.deepEqual(await response.json(), {});
          }
        });
      }
    }
  }
}

test("Worker header credentials keep Bearer, OutRay header, then generic header precedence", async () => {
  for (const [headers, expected] of [
    [
      {
        authorization: "  bEaReR   outray_bearer ",
        "x-outray-api-key": "outray_first",
        "x-api-key": "outray_second",
      },
      "outray_bearer",
    ],
    [
      {
        authorization: "Basic not-a-bearer",
        "x-outray-api-key": "  outray_first  ",
        "x-api-key": "outray_second",
      },
      "outray_first",
    ],
    [
      {
        authorization: "",
        "x-outray-api-key": "",
        "x-api-key": "outray_second",
      },
      "outray_second",
    ],
  ] as const) {
    const state = harness();
    const response = await handleIngestRequest(
      request("/v1/traces", JSON.stringify(fixture("traces")), headers),
      state.dependencies,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(state.credentials, [expected]);
  }
});

for (const signal of signals) {
  for (const protobuf of [false, true]) {
    test(`Worker ${signal} ${protobuf ? "protobuf" : "JSON"} empty exports succeed`, async () => {
      const state = harness();
      const response = await handleIngestRequest(
        request(`/v1/${signal}`, encode(signal, fixture(signal, 0), protobuf), {
          "Content-Type": protobuf
            ? "application/x-protobuf"
            : "application/json",
        }),
        state.dependencies,
      );
      assert.equal(response.status, 200);
      assert.deepEqual(state.queued, [{ signal, rows: [] }]);
      if (protobuf) assert.equal((await response.arrayBuffer()).byteLength, 0);
      else assert.deepEqual(await response.json(), {});
    });

    test(`Worker ${signal} ${protobuf ? "protobuf" : "JSON"} exports report invalid and over-limit records`, async () => {
      const state = harness({ maxRecords: 1 });
      const response = await handleIngestRequest(
        request(
          `/v1/${signal}`,
          encode(signal, fixture(signal, 3, true), protobuf),
          {
            "Content-Type": protobuf
              ? "application/x-protobuf"
              : "application/json",
          },
        ),
        state.dependencies,
      );
      assert.equal(response.status, 200);
      assert.equal(state.queued[0]?.rows.length, 1);
      let body: Record<string, any>;
      if (protobuf) {
        const type = codecs[signal].response;
        const bytes = new Uint8Array(await response.arrayBuffer());
        body = type.toObject(type.decode(bytes) as never, { longs: String });
      } else {
        body = await response.json();
      }
      assert.equal(
        Number(body.partialSuccess[codecs[signal].rejectedField]),
        3,
      );
      assert.match(body.partialSuccess.errorMessage, /invalid or over-limit/);
    });
  }
}

test("Worker waits for durable enqueue before returning successful acceptance", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered: () => void = () => {};
  const enqueuing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let returned = false;
  const state = harness({
    async enqueue() {
      entered();
      await gate;
    },
  });
  const pending = handleIngestRequest(
    request("/v1/traces", JSON.stringify(fixture("traces"))),
    state.dependencies,
  ).then((response) => {
    returned = true;
    return response;
  });
  await enqueuing;
  assert.equal(returned, false);
  release();
  assert.equal((await pending).status, 200);
});

test("Worker queue failures return retryable 503 instead of accepting lost telemetry", async () => {
  const state = harness({
    async enqueue() {
      throw new Error("Queue unavailable: sensitive detail");
    },
  });
  const response = await handleIngestRequest(
    request("/v1/traces", JSON.stringify(fixture("traces"))),
    state.dependencies,
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "2");
  assert.deepEqual(await response.json(), {
    message: "Telemetry ingestion is temporarily unavailable",
  });
});

test("Worker health, unknown routes, and missing credentials do not authenticate or enqueue", async () => {
  for (const [input, status] of [
    [new Request("https://ingest.example.test/health"), 200],
    [new Request("https://ingest.example.test/v1/traces"), 404],
    [request("/unknown", "{}"), 404],
    [request("/v1/traces", "{}", { authorization: "" }), 401],
  ] as const) {
    const state = harness();
    const response = await handleIngestRequest(input, state.dependencies);
    assert.equal(response.status, status);
    assert.deepEqual(state.credentials, []);
    assert.deepEqual(state.organizations, []);
    assert.deepEqual(state.queued, []);
  }
});

test("Worker rejects invalid credentials and exhausted organization rate limits before reading telemetry", async () => {
  const invalid = harness({
    async authenticate() {
      return null;
    },
  });
  const unauthorized = await handleIngestRequest(
    request("/v1/traces", "invalid JSON"),
    invalid.dependencies,
  );
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(invalid.organizations, []);
  assert.deepEqual(invalid.queued, []);

  const limited = harness({
    async allowRequest() {
      return false;
    },
  });
  const response = await handleIngestRequest(
    request("/v1/traces", "invalid JSON"),
    limited.dependencies,
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(limited.queued, []);
});

for (const signal of signals) {
  test(`Worker rejects malformed ${signal} JSON, protobuf, and schema payloads`, async () => {
    for (const [body, contentType] of [
      ["{not valid", "application/json"],
      [new Uint8Array([10, 127]), "application/x-protobuf"],
      ["{}", "application/json"],
      ["null", "application/json"],
    ] as const) {
      const state = harness();
      const response = await handleIngestRequest(
        request(`/v1/${signal}`, body, { "Content-Type": contentType }),
        state.dependencies,
      );
      assert.equal(response.status, 400);
      assert.deepEqual(state.queued, []);
    }
  });
}

test("Worker rejects unsupported content types and encoding plus malformed gzip", async () => {
  for (const [headers, body, status] of [
    [{ "Content-Type": "text/plain" }, "{}", 415],
    [{ "Content-Encoding": "br" }, "{}", 415],
    [{ "Content-Encoding": "gzip" }, "not gzip", 400],
  ] as const) {
    const state = harness();
    const response = await handleIngestRequest(
      request("/v1/traces", body, headers),
      state.dependencies,
    );
    assert.equal(response.status, status);
    assert.deepEqual(state.queued, []);
  }
});

test("Worker bounds declared and streamed raw bytes independently of Content-Length", async () => {
  for (const [body, headers] of [
    ["{}", { "Content-Length": "65" }],
    ["x".repeat(65), {}],
    ["x".repeat(65), { "Content-Length": "1" }],
  ] as const) {
    const state = harness({ maxPayloadBytes: 64 });
    const response = await handleIngestRequest(
      request("/v1/traces", body, headers),
      state.dependencies,
    );
    assert.equal(response.status, 413);
    assert.deepEqual(state.queued, []);
  }
});

test("Worker rejects gzip bombs and also bounds compressed bytes", async () => {
  const bomb = gzipSync("x".repeat(65_536));
  assert(bomb.byteLength < 1_024);
  const state = harness({ maxPayloadBytes: 1_024 });
  const response = await handleIngestRequest(
    request("/v1/traces", bomb, { "Content-Encoding": "gzip" }),
    state.dependencies,
  );
  assert.equal(response.status, 400);
  assert.deepEqual(state.queued, []);

  const compressedLimit = harness({ maxPayloadBytes: 16 });
  const tooLarge = await handleIngestRequest(
    request("/v1/traces", gzipSync("{}"), { "Content-Encoding": "gzip" }),
    compressedLimit.dependencies,
  );
  assert.equal(tooLarge.status, 413);
  assert.deepEqual(compressedLimit.queued, []);
});

for (const signal of signals) {
  for (const protobuf of [false, true]) {
    test(`Worker ${signal} ${protobuf ? "protobuf" : "JSON"} counts record and normalized-byte rejections exactly`, async () => {
      const baseline = harness();
      const baselineResponse = await handleIngestRequest(
        request(`/v1/${signal}`, JSON.stringify(fixture(signal))),
        baseline.dependencies,
      );
      assert.equal(baselineResponse.status, 200);
      const rowBytes = Buffer.byteLength(
        JSON.stringify(baseline.queued[0]!.rows[0]),
        "utf8",
      );
      // Three valid records plus one invalid record: the record cap retains
      // two, and a byte budget of 1.5 rows retains only the first of those.
      const budget = Math.floor(rowBytes * 1.5);
      const state = harness({ maxRecords: 2, maxNormalizedBytes: budget });
      const response = await handleIngestRequest(
        request(
          `/v1/${signal}`,
          encode(signal, fixture(signal, 3, true), protobuf),
          {
            "Content-Type": protobuf
              ? "application/x-protobuf"
              : "application/json",
          },
        ),
        state.dependencies,
      );
      assert.equal(response.status, 200);
      const rows = state.queued[0]!.rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.organization_id, auth.organizationId);
      assert.equal(rows[0]!.retention_days, auth.retentionDays);
      assert.equal(rows[0]!.resource_attributes.api_key, "[REDACTED]");
      assert.doesNotMatch(JSON.stringify(rows), /must-not-reach-the-queue/);
      assert(Buffer.byteLength(JSON.stringify(rows), "utf8") <= budget);
      const partial = protobuf
        ? codecs[signal].response.toObject(
            codecs[signal].response.decode(
              new Uint8Array(await response.arrayBuffer()),
            ) as never,
            { longs: String },
          )
        : await response.json();
      assert.equal(
        Number(partial.partialSuccess[codecs[signal].rejectedField]),
        3,
      );

      // A single row larger than the budget is rejected before retaining it.
      const tiny = harness({ maxNormalizedBytes: 1 });
      const tinyResponse = await handleIngestRequest(
        request(`/v1/${signal}`, JSON.stringify(fixture(signal, 3, true))),
        tiny.dependencies,
      );
      assert.equal(tinyResponse.status, 200);
      assert.deepEqual(tiny.queued[0]!.rows, []);
      const tinyBody = await tinyResponse.json();
      assert.equal(tinyBody.partialSuccess[codecs[signal].rejectedField], 4);
    });
  }

  test(`Worker bounds repeated ${signal} resource amplification to the default 16 MiB budget`, async () => {
    const payload = fixture(signal, 100);
    const resources = Object.values(payload)[0]!;
    const resourceEntry = resources[0]!;
    // OTLP shares this 2 MiB resource across 100 records. Unbounded
    // normalization would otherwise produce over 200 MiB of queue rows.
    const largeValue = "a".repeat(16_384);
    resourceEntry.resource.attributes = [
      ...attributes,
      ...Array.from({ length: 128 }, (_, index) => ({
        key: `amplification.${String(index).padStart(3, "0")}`,
        value: { stringValue: largeValue },
      })),
    ];
    const body = JSON.stringify(payload);
    assert(Buffer.byteLength(body, "utf8") < 8 * 1024 * 1024);
    const state = harness();
    const response = await handleIngestRequest(
      request(`/v1/${signal}`, body),
      state.dependencies,
    );
    assert.equal(response.status, 200);
    const rows = state.queued[0]!.rows;
    assert(rows.length > 0 && rows.length < 100);
    assert(Buffer.byteLength(JSON.stringify(rows), "utf8") <= 16 * 1024 * 1024);
    for (const row of rows) {
      assert.equal(row.organization_id, auth.organizationId);
      assert.equal(row.retention_days, auth.retentionDays);
      assert.equal(row.resource_attributes.api_key, "[REDACTED]");
      assert.equal(row.resource_attributes["amplification.000"], largeValue);
    }
    const result = await response.json();
    assert.equal(
      result.partialSuccess[codecs[signal].rejectedField],
      100 - rows.length,
    );
  });
}
