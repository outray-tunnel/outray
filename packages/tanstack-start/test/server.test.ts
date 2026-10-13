import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { getOutrayObservability } from "@outray/observability";
import { createOutrayTanStackServerEntry } from "../src/server.js";

test("accepts observability configuration in the server entry", () => {
  const entry = createOutrayTanStackServerEntry({
    apiKey: "test-token",
    serviceName: "tanstack-test",
    environment: "test",
    enabled: false,
  });

  assert.equal(typeof entry.fetch, "function");
  assert.equal(entry.observability.started, false);
  assert.equal(typeof entry.info, "function");
  assert.equal(typeof entry.error, "function");
  assert.equal(getOutrayObservability()?.config.serviceName, "tanstack-test");
  assert.equal(getOutrayObservability()?.config.environment, "test");
});

test("server entry forwards request-specific capture and default-path options without sending them to SDK initialization", async () => {
  const source = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as { createOutrayTanStackServerEntry: typeof createOutrayTanStackServerEntry } };
  const initialized: Record<string, unknown>[] = [], requestConfigurations: Record<string, unknown>[] = [];
  const response = new Response("application response");
  const handlerCalls: unknown[] = [];
  const noop = () => {};
  runInNewContext(compiled, { module, exports: module.exports, require(specifier: string) {
    if (specifier === "@outray/observability") return { startOutrayObservability(options: Record<string, unknown>) {
      initialized.push(options);
      return { debug: noop, error: noop, info: noop, warn: noop };
    } };
    if (specifier === "@tanstack/react-start/server") return { defaultStreamHandler: {}, createStartHandler: () => (...args: unknown[]) => {
      handlerCalls.push(args);
      return response;
    } };
    if (specifier === "./index.js") return { instrumentTanStackRequest(requestContext: { next: () => Response }, options: Record<string, unknown>) {
      requestConfigurations.push(options);
      return requestContext.next();
    } };
    throw new Error(`Unexpected dependency: ${specifier}`);
  } });

  const shouldCapturePayloads = () => false;
  const ignore = () => false;
  const entry = module.exports.createOutrayTanStackServerEntry({
    apiKey: "synthetic-server-test", serviceName: "test-server", enabled: false,
    capturePayloads: true, shouldCapturePayloads, ignoreDefaultPaths: false,
    ignore, recordExceptions: false,
  });
  const request = new Request("https://app.test/favicon.ico");
  assert.equal(await entry.fetch(request, {}), response);
  assert.equal(handlerCalls.length, 1);
  assert.equal(initialized.length, 1);
  assert.equal(initialized[0]!.serviceName, "test-server");
  for (const key of ["capturePayloads", "shouldCapturePayloads", "ignoreDefaultPaths", "ignore", "recordExceptions"]) {
    assert.equal(key in initialized[0]!, false, `${key} belongs to request instrumentation, not global SDK configuration`);
  }
  assert.equal(requestConfigurations[0]!.capturePayloads, true);
  assert.equal(requestConfigurations[0]!.shouldCapturePayloads, shouldCapturePayloads);
  assert.equal(requestConfigurations[0]!.ignoreDefaultPaths, false);
  assert.equal(requestConfigurations[0]!.ignore, ignore);
  assert.equal(requestConfigurations[0]!.recordExceptions, false);
});
