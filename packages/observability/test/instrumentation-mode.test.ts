import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { resolveOutrayObservabilityOptions } from "../src/config";

async function sdkConfiguration(autoInstrumentations?: boolean, logOptions: { captureConsole?: boolean; redactedLogFields?: readonly string[]; enabled?: boolean } = {}) {
  let captured: { instrumentations: unknown[] } | undefined;
  let started = false;
  const logCalls: unknown[][] = [];
  const consoleCalls: unknown[][] = [];
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
      if (specifier === "./logging") return {
        createOutrayLogMethods: (...args: unknown[]) => { logCalls.push(args); return {}; },
        captureConsoleLogs: (...args: unknown[]) => { consoleCalls.push(args); return () => {}; },
      };
      if (specifier === "@opentelemetry/api") return { trace: { getTracer: () => ({}) }, metrics: { getMeter: () => ({}) } };
      if (specifier === "@opentelemetry/api-logs") return { logs: { getLogger: () => ({}) } };
      if (specifier === "@opentelemetry/sdk-node") return { NodeSDK: SDK };
      if (specifier === "@opentelemetry/resources") return { resourceFromAttributes: (attributes: unknown) => attributes };
      return new Proxy({}, { get: () => Component });
    },
  });
  const instance = module.exports.startOutrayObservability({ apiKey: "test-token", serviceName: "test", autoInstrumentations, ...logOptions });
  return { captured, started, instance, logCalls, consoleCalls };
}

test("ordinary SDK startup retains all nine automatic instrumentations", async () => {
  const result = await sdkConfiguration();
  assert.equal(result.started, true);
  assert.equal(result.instance.started, true);
  assert.equal(result.captured?.instrumentations.length, 9);
  assert.equal(result.consoleCalls.length, 0);
});

test("framework-only SDK starts exporters without automatic instrumentation", async () => {
  const result = await sdkConfiguration(false);
  assert.equal(result.started, true);
  assert.equal(result.instance.started, true);
  assert.equal(result.captured?.instrumentations.length, 0);
});

test("SDK startup forwards additional log redaction fields to captured console and explicit methods", async () => {
  const result = await sdkConfiguration(false, { captureConsole: true, redactedLogFields: ["value", "body"] });
  assert.deepEqual(result.logCalls[0]?.[3], ["value", "body"]);
  assert.deepEqual(result.consoleCalls[0]?.[3], ["value", "body"]);
  const disabled = await sdkConfiguration(false, { enabled: false, redactedLogFields: ["value"] });
  assert.deepEqual(disabled.logCalls[0]?.[3], ["value"]);
  assert.equal(disabled.consoleCalls.length, 0);
});
