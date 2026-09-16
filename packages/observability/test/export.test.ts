import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { startOutrayObservability } from "../src/index";

test("exports traces, logs, and metrics to OutRay-compatible OTLP endpoints", async () => {
  const received: Array<{
    path: string;
    authorization?: string;
    contentType?: string;
    bytes: number;
  }> = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      received.push({
        path: request.url ?? "",
        authorization: request.headers.authorization,
        contentType: request.headers["content-type"],
        bytes: Buffer.concat(chunks).byteLength,
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const observability = startOutrayObservability({
    apiKey: "outray_test_token",
    serviceName: "checkout-api",
    serviceVersion: "1.2.3",
    environment: "test",
    endpoint: `http://127.0.0.1:${address.port}`,
    metricExportIntervalMillis: 60_000,
  });

  observability.tracer.startSpan("checkout").end();
  observability.logger.emit({
    severityText: "INFO",
    body: "checkout accepted",
  });
  observability.meter.createCounter("checkouts").add(1);

  await observability.forceFlush();
  await observability.shutdown();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

  assert.deepEqual(
    new Set(received.map((request) => request.path)),
    new Set(["/v1/traces", "/v1/logs", "/v1/metrics"]),
  );
  for (const request of received) {
    assert.equal(request.authorization, "Bearer outray_test_token");
    assert.equal(request.contentType, "application/x-protobuf");
    assert.ok(request.bytes > 0);
  }
});
