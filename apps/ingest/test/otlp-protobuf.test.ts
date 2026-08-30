import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { parseTracePayload, type ParsedTracePayload } from "../src/otlp.js";
import { decodeTraceRequest } from "../src/protobuf.js";

let endpoint = "";
let received: ParsedTracePayload | null = null;

const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));

  assert.equal(request.url, "/v1/traces");
  assert.match(
    request.headers["content-type"] || "",
    /^application\/x-protobuf/,
  );
  assert.equal(request.headers.authorization, "Bearer outray_test_token");

  received = parseTracePayload(decodeTraceRequest(Buffer.concat(chunks)));
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
  endpoint = `http://127.0.0.1:${address.port}/v1/traces`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("accepts traces from the official OTLP HTTP/protobuf exporter", async () => {
  const exporter = new OTLPTraceExporter({
    url: endpoint,
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
