import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { HttpPayloadCapturePolicy, HttpPayloadCaptureSetting, NodeHttpPayloadCaptureContext } from "@outray/core";

type Policy = HttpPayloadCapturePolicy<NodeHttpPayloadCaptureContext>;

/** Check the adapter boundary; the shared core tests exercise policy execution. */
function adapter() {
  const captures: Array<{ setting: HttpPayloadCaptureSetting; policy?: Policy }> = [];
  const telemetryOptions: Record<string, unknown>[] = [];
  const module = { exports: {} as Record<string, (...args: any[]) => unknown> };
  const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled, {
    module, exports: module.exports, process: { env: { NODE_ENV: "production" } }, console,
    require(name: string) {
      if (name === "@outray/core") return {
        createNodeHttpPayloadCaptureMiddleware(setting: HttpPayloadCaptureSetting, policy?: Policy) {
          captures.push({ setting, policy });
          return () => undefined;
        },
      };
      if (name === "@outray/observability") return {
        createOutrayNodeHttpMiddleware: () => () => undefined,
        startOutrayObservability(options: Record<string, unknown>) {
          telemetryOptions.push(options);
          return { info() {}, error() {} };
        },
      };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const middleware: unknown[] = [];
  const app = { use(value: unknown) { middleware.push(value); return this; } };
  return { ...module.exports, app, middleware, captures, telemetryOptions };
}

test("forwards the shared policy without evaluating it when a tunnel is disabled", () => {
  const plugin = adapter();
  let calls = 0;
  const shouldCapturePayloads: NonNullable<Policy["shouldCapturePayloads"]> = () => { calls++; return false; };
  plugin.default(plugin.app, { enabled: false, silent: true, capturePayloads: true, shouldCapturePayloads });
  assert.equal(plugin.middleware.length, 1);
  assert.equal(plugin.captures[0]?.setting, true);
  assert.equal(plugin.captures[0]?.policy?.shouldCapturePayloads, shouldCapturePayloads);
  assert.equal(calls, 0, "the core middleware owns per-request policy evaluation");
});

test("direct observability registration keeps request metadata and forwards the capture gate", () => {
  const plugin = adapter();
  const shouldCapturePayloads = () => false;
  plugin.registerOutrayObservability(plugin.app, { apiKey: "test", enabled: false, capturePayloads: true, shouldCapturePayloads });
  assert.equal(plugin.middleware.length, 2, "request instrumentation remains installed alongside guarded capture");
  assert.equal(plugin.captures[0]?.policy?.shouldCapturePayloads, shouldCapturePayloads);
  assert.equal("shouldCapturePayloads" in plugin.telemetryOptions[0], false);
});

test("nested observability supplies a policy unless the top-level plugin overrides it", () => {
  const nested = () => false;
  const topLevel = () => true;
  const inherited = adapter();
  inherited.default(inherited.app, { enabled: false, observability: { apiKey: "test", capturePayloads: true, shouldCapturePayloads: nested } });
  assert.equal(inherited.captures[0]?.policy?.shouldCapturePayloads, nested);

  const overridden = adapter();
  const setting = { maxBodyBytes: 256 };
  overridden.default(overridden.app, { enabled: false, capturePayloads: setting, shouldCapturePayloads: topLevel, observability: { apiKey: "test", capturePayloads: true, shouldCapturePayloads: nested } });
  assert.equal(overridden.captures[0]?.policy?.shouldCapturePayloads, topLevel);
  assert.equal(overridden.captures[0]?.setting, setting);
  assert.equal(overridden.middleware.length, 2);
});

test("a policy does not enable payload capture when capturePayloads is false", () => {
  const plugin = adapter();
  plugin.default(plugin.app, { enabled: false, capturePayloads: false, shouldCapturePayloads: () => true, observability: { apiKey: "test", capturePayloads: true } });
  assert.equal(plugin.middleware.length, 1, "only request metadata instrumentation is installed");
  assert.equal(plugin.captures.length, 0);
});
