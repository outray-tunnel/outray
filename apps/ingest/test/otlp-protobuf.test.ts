import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { context, trace } from "@opentelemetry/api";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { parseLogsPayload, type ParsedLogsPayload } from "../src/logs.js";
import { parseTracePayload, type ParsedTracePayload } from "../src/otlp.js";
import { decodeLogsRequest, decodeTraceRequest } from "../src/protobuf.js";

let endpointBase = "";
let received: ParsedTracePayload | null = null;
let receivedLogs: ParsedLogsPayload | null = null;

const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));

  assert.match(
    request.headers["content-type"] || "",
    /^application\/x-protobuf/,
  );
  assert.equal(request.headers.authorization, "Bearer outray_test_token");

  const payload = Buffer.concat(chunks);
  if (request.url === "/v1/traces") {
    received = parseTracePayload(decodeTraceRequest(payload));
  } else if (request.url === "/v1/logs") {
    receivedLogs = parseLogsPayload(decodeLogsRequest(payload));
  } else {
    assert.fail(`Unexpected OTLP path: ${request.url}`);
  }
  response.writeHead(200, {
    "Content-Type": "application/x-protobuf",
    "Content-Length": "0",
  });
  response.end();
});

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  endpointBase = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("accepts traces from the official OTLP HTTP/protobuf exporter", async () => {
  const exporter = new OTLPTraceExporter({
    url: `${endpointBase}/v1/traces`,
    headers: { Authorization: "Bearer outray_test_token" },
  });
  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      "service.name": "checkout-api",
      "service.version": "1.2.3",
      "deployment.environment.name": "test",
    }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  const tracer = provider.getTracer("outray-ingest-test", "1.0.0");
  const span = tracer.startSpan("POST /checkout", {
    attributes: {
      "http.request.method": "POST",
      "http.response.status_code": 201,
    },
  });
  span.addEvent("order.created", { "order.id": "order_123" });
  span.end();

  await provider.forceFlush();
  await provider.shutdown();

  assert(received);
  assert.equal(received.rejected, 0);
  assert.equal(received.spans.length, 1);
  assert.equal(received.spans[0]?.name, "POST /checkout");
  assert.equal(received.spans[0]?.serviceName, "checkout-api");
  assert.equal(received.spans[0]?.httpMethod, "POST");
  assert.match(received.spans[0]?.traceId || "", /^[0-9a-f]{32}$/);
  assert.match(received.spans[0]?.spanId || "", /^[0-9a-f]{16}$/);
});

test("accepts logs from the official OTLP HTTP/protobuf exporter", async () => {
  const exporter = new OTLPLogExporter({
    url: `${endpointBase}/v1/logs`,
    headers: { Authorization: "Bearer outray_test_token" },
  });
  const provider = new LoggerProvider({
    resource: resourceFromAttributes({
      "service.name": "checkout-api",
      "service.version": "1.2.3",
      "deployment.environment.name": "test",
    }),
    processors: [new SimpleLogRecordProcessor({ exporter })],
  });
  const tracerProvider = new BasicTracerProvider();
  const span = tracerProvider.getTracer("log-test").startSpan("process-order");
  const logContext = trace.setSpan(context.active(), span);

  provider.getLogger("outray-logger", "1.0.0").emit({
    context: logContext,
    eventName: "order.payment_failed",
    severityNumber: SeverityNumber.ERROR,
    severityText: "ERROR",
    body: "payment authorization failed",
    attributes: {
      "order.id": "order_123",
      "request.authorization": "must-redact",
    },
  });
  span.end();

  await provider.forceFlush();
  await provider.shutdown();
  await tracerProvider.shutdown();

  assert(receivedLogs);
  assert.equal(receivedLogs.rejected, 0);
  assert.equal(receivedLogs.records.length, 1);
  assert.equal(
    receivedLogs.records[0]?.message,
    "payment authorization failed",
  );
  assert.equal(receivedLogs.records[0]?.severityLevel, "error");
  assert.equal(receivedLogs.records[0]?.serviceName, "checkout-api");
  assert.equal(receivedLogs.records[0]?.eventName, "order.payment_failed");
  assert.match(receivedLogs.records[0]?.traceId || "", /^[0-9a-f]{32}$/);
  assert.match(receivedLogs.records[0]?.spanId || "", /^[0-9a-f]{16}$/);
});
