import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "protobufjs";
import {
  decodeTraceRequest,
  decodeLogsRequest,
  decodeMetricsRequest,
  encodeTraceResponse,
  encodeLogsResponse,
  encodeMetricsResponse,
} from "../src/protobuf.js";

// Reflection is deliberately test-only: this is the previous runtime's oracle.
const root = parse(
  readFileSync(new URL("../src/proto/otlp.proto", import.meta.url), "utf8"),
  { keepCase: false },
).root;
const conversionOptions = {
  arrays: true,
  bytes: String,
  enums: Number,
  longs: String,
  objects: true,
};
const timestamp = "1788080400123456789";
const traceId = "q".repeat(22) + "==";
const spanId = "q".repeat(11) + "=";
const attributes = [
  { key: "string", value: { stringValue: "hello 👋" } },
  { key: "boolean", value: { boolValue: true } },
  { key: "integer", value: { intValue: "-9223372036854775808" } },
  { key: "float", value: { doubleValue: 4.25 } },
  { key: "bytes", value: { bytesValue: "AQIDBA==" } },
  {
    key: "array",
    value: {
      arrayValue: { values: [{ stringValue: "one" }, { intValue: "2" }] },
    },
  },
  {
    key: "object",
    value: {
      kvlistValue: { values: [{ key: "nested", value: { boolValue: false } }] },
    },
  },
];
const resource = { attributes, droppedAttributesCount: 1 };
const scope = {
  name: "static-codec-test",
  version: "1.0.0",
  attributes,
  droppedAttributesCount: 2,
};
const exemplar = {
  filteredAttributes: attributes,
  timeUnixNano: timestamp,
  asInt: "9223372036854775807",
  traceId,
  spanId,
};

const requests = [
  {
    name: "Trace",
    decode: decodeTraceRequest,
    value: {
      resourceSpans: [
        {
          resource,
          schemaUrl: "https://opentelemetry.io/schemas/1.7.0",
          scopeSpans: [
            {
              scope,
              spans: [
                {
                  traceId,
                  spanId,
                  parentSpanId: spanId,
                  traceState: "vendor=state",
                  name: "GET /orders",
                  kind: 2,
                  startTimeUnixNano: timestamp,
                  endTimeUnixNano: "1788080400123456799",
                  attributes,
                  droppedAttributesCount: 1,
                  events: [
                    {
                      timeUnixNano: timestamp,
                      name: "event",
                      attributes,
                      droppedAttributesCount: 2,
                    },
                  ],
                  droppedEventsCount: 3,
                  links: [
                    {
                      traceId,
                      spanId,
                      traceState: "vendor=state",
                      attributes,
                      droppedAttributesCount: 4,
                      flags: 1,
                    },
                  ],
                  droppedLinksCount: 5,
                  status: { message: "all good", code: 1 },
                  flags: 1,
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: "Logs",
    decode: decodeLogsRequest,
    value: {
      resourceLogs: [
        {
          resource,
          scopeLogs: [
            {
              scope,
              logRecords: [
                {
                  timeUnixNano: timestamp,
                  observedTimeUnixNano: "1788080400123456799",
                  severityNumber: 17,
                  severityText: "ERROR",
                  body: { kvlistValue: { values: attributes } },
                  attributes,
                  droppedAttributesCount: 1,
                  flags: 1,
                  traceId,
                  spanId,
                  eventName: "payment.failed",
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: "Metrics",
    decode: decodeMetricsRequest,
    value: {
      resourceMetrics: [
        {
          resource,
          scopeMetrics: [
            {
              scope,
              metrics: [
                {
                  name: "integer.gauge",
                  description: "Exact integers",
                  unit: "{item}",
                  metadata: attributes,
                  gauge: {
                    dataPoints: [
                      {
                        attributes,
                        startTimeUnixNano: timestamp,
                        timeUnixNano: timestamp,
                        asInt: "-9223372036854775808",
                        exemplars: [exemplar],
                        flags: 1,
                      },
                    ],
                  },
                },
                {
                  name: "counter",
                  sum: {
                    aggregationTemporality: 2,
                    isMonotonic: true,
                    dataPoints: [
                      {
                        timeUnixNano: timestamp,
                        asDouble: 1.5,
                        exemplars: [
                          { ...exemplar, asInt: undefined, asDouble: 2.5 },
                        ],
                      },
                    ],
                  },
                },
                {
                  name: "histogram",
                  histogram: {
                    aggregationTemporality: 1,
                    dataPoints: [
                      {
                        attributes,
                        startTimeUnixNano: timestamp,
                        timeUnixNano: timestamp,
                        count: "18446744073709551615",
                        sum: 0,
                        bucketCounts: ["1", "2", "3"],
                        explicitBounds: [1, 2],
                        exemplars: [exemplar],
                        flags: 1,
                        min: 0,
                        max: 3,
                      },
                    ],
                  },
                },
                {
                  name: "exponential",
                  exponentialHistogram: {
                    aggregationTemporality: 2,
                    dataPoints: [
                      {
                        attributes,
                        startTimeUnixNano: timestamp,
                        timeUnixNano: timestamp,
                        count: "5",
                        sum: 6,
                        scale: -2,
                        zeroCount: "1",
                        positive: { offset: -1, bucketCounts: ["1", "2"] },
                        negative: { offset: 0, bucketCounts: ["1"] },
                        flags: 1,
                        exemplars: [exemplar],
                        min: 0,
                        max: 4,
                        zeroThreshold: 0.001,
                      },
                    ],
                  },
                },
                {
                  name: "summary",
                  summary: {
                    dataPoints: [
                      {
                        attributes,
                        startTimeUnixNano: timestamp,
                        timeUnixNano: timestamp,
                        count: "2",
                        sum: 30,
                        quantileValues: [
                          { quantile: 0.5, value: 10 },
                          { quantile: 0.95, value: 20 },
                        ],
                        flags: 1,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  },
];

for (const { name, decode, value } of requests) {
  test(`static ${name.toLowerCase()} decoding matches reflection, including exact 64-bit values`, () => {
    const type = root.lookupType(`outray.otlp.Export${name}ServiceRequest`);
    const payload = type.encode(type.fromObject(value)).finish();
    assert.deepEqual(
      decode(payload),
      type.toObject(type.decode(payload), conversionOptions),
    );
    assert.deepEqual(
      decode(new Uint8Array()),
      type.toObject(type.decode(new Uint8Array()), conversionOptions),
    );

    // A future unknown varint field is ignored without losing known fields.
    const withUnknownField = new Uint8Array([...payload, 248, 7, 1]);
    assert.deepEqual(decode(withUnknownField), decode(payload));
    assert.throws(() => decode(new Uint8Array([10, 127])), RangeError);
  });
}

for (const [name, field, encode] of [
  ["Trace", "rejectedSpans", encodeTraceResponse],
  ["Logs", "rejectedLogRecords", encodeLogsResponse],
  ["Metrics", "rejectedDataPoints", encodeMetricsResponse],
] as const) {
  test(`static ${name.toLowerCase()} responses preserve success and partial-success wire bytes`, () => {
    const type = root.lookupType(`outray.otlp.Export${name}ServiceResponse`);
    for (const rejected of [0, 1, 10_000]) {
      const errorMessage = "Invalid OTLP records — rejected 👋";
      const previousValue = rejected
        ? { partialSuccess: { [field]: String(rejected), errorMessage } }
        : {};
      const expected = type.encode(type.create(previousValue)).finish();
      const actual = encode(rejected, errorMessage);
      assert.deepEqual(Buffer.from(actual), Buffer.from(expected));
    }
  });
}

test("static codecs run when dynamic code generation is prohibited", () => {
  const generatedUrl = new URL(
    "../src/proto/otlp.generated.js",
    import.meta.url,
  );
  const result = spawnSync(
    process.execPath,
    [
      "--disallow-code-generation-from-strings",
      "--input-type=module",
      "--eval",
      `
      const { outray } = await import(${JSON.stringify(generatedUrl.href)});
      for (const name of ["Trace", "Logs", "Metrics"]) {
        const type = outray.otlp["Export" + name + "ServiceRequest"];
        const message = type.fromObject({});
        type.toObject(type.decode(type.encode(message).finish()), { longs: String });
      }
    `,
    ],
    { encoding: "utf8", cwd: fileURLToPath(new URL("../", import.meta.url)) },
  );
  assert.equal(result.status, 0, result.stderr);
});
