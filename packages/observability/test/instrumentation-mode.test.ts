import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { resolveOutrayObservabilityOptions } from "../src/config";

async function sdkConfiguration(autoInstrumentations?: boolean) {
  let captured: { instrumentations: unknown[] } | undefined;
  let started = false;
  class Component {
    forceFlush = async () => {};
  }
  class SDK {
    constructor(configuration: { instrumentations: unknown[] }) { captured = configuration; }
    start() { started = true; }
  }
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as { startOutrayObservability: (options: unknown) => { started: boolean } } };
  runInNewContext(compiled, {
    module, exports: module.exports, console, process: { env: {} },
    require: (specifier: string) => {
      if (specifier === "../package.json") return { version: "test" };
      if (specifier === "./config") return { resolveOutrayObservabilityOptions: (options: Parameters<typeof resolveOutrayObservabilityOptions>[0]) => resolveOutrayObservabilityOptions(options, {}), signalEndpoint: (endpoint: string, signal: string) => `${endpoint}/v1/${signal}` };
      if (specifier === "./logging") return { createOutrayLogMethods: () => ({}), captureConsoleLogs: () => { throw new Error("console capture must remain off"); } };
      if (specifier === "@opentelemetry/api") return { trace: { getTracer: () => ({}) }, metrics: { getMeter: () => ({}) } };
      if (specifier === "@opentelemetry/api-logs") return { logs: { getLogger: () => ({}) } };
      if (specifier === "@opentelemetry/sdk-node") return { NodeSDK: SDK };
      if (specifier === "@opentelemetry/resources") return { resourceFromAttributes: (attributes: unknown) => attributes };
      return new Proxy({}, { get: () => Component });
    },
  });
  const instance = module.exports.startOutrayObservability({ apiKey: "test-token", serviceName: "test", autoInstrumentations });
  return { captured, started, instance };
}

test("ordinary SDK startup retains all nine automatic instrumentations", async () => {
  const result = await sdkConfiguration();
  assert.equal(result.started, true);
  assert.equal(result.instance.started, true);
  assert.equal(result.captured?.instrumentations.length, 9);
});

test("framework-only SDK starts exporters without automatic instrumentation", async () => {
  const result = await sdkConfiguration(false);
  assert.equal(result.started, true);
  assert.equal(result.instance.started, true);
  assert.equal(result.captured?.instrumentations.length, 0);
});
