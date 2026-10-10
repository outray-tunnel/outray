import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  ignoreInternalObservabilityRequest,
  resolveInternalObservabilityOptions,
  runWithInternalObservabilityRequest,
  shouldCaptureInternalObservabilityLog,
} from "../src/lib/internal-observability.server";

const configured = {
  OUTRAY_INTERNAL_OBSERVABILITY_API_KEY: "test-internal-token",
  OUTRAY_INTERNAL_OBSERVABILITY_ENDPOINT: "https://ingest.ops.example.test",
};

test("the console stays uninstrumented unless its dedicated server credential is present", () => {
  for (const env of [
    {}, { OUTRAY_API_KEY: "ordinary-tunnel-key", OTEL_SERVICE_NAME: "existing-service" },
    { OUTRAY_INTERNAL_OBSERVABILITY_ENDPOINT: "invalid" },
    { ...configured, OUTRAY_INTERNAL_OBSERVABILITY_API_KEY: "   " },
  ]) assert.equal(resolveInternalObservabilityOptions(env), undefined);
});

test("internal Ops configuration enables bounded payload and console capture with its explicit identity", () => {
  const options = resolveInternalObservabilityOptions({
    ...configured, OUTRAY_CAPTURE_CONSOLE: "true", OUTRAY_OTLP_ENDPOINT: "https://wrong.example.test",
  });
  assert.ok(options);
  assert.equal(options.endpoint, configured.OUTRAY_INTERNAL_OBSERVABILITY_ENDPOINT);
  assert.equal(options.serviceName, "outray-web");
  assert.equal(options.environment, "production");
  assert.equal(options.enabled, true);
  assert.deepEqual(options.capturePayloads, {
    maxBodyBytes: 16 * 1024,
    maxHeaderBytes: 8 * 1024,
    redactedFields: ["requestBody", "responseBody", "requestHeaders", "responseHeaders", "body", "params"],
  });
  assert.equal(options.captureConsole, true);
  assert.equal(options.shouldCaptureLog, shouldCaptureInternalObservabilityLog);
  assert.equal(options.autoInstrumentations, false);
  assert.equal(options.recordExceptions, false);
  assert.equal(options.diagnostics, "none");
  const custom = resolveInternalObservabilityOptions({ ...configured,
    OUTRAY_INTERNAL_OBSERVABILITY_SERVICE_NAME: " my-web ", OUTRAY_INTERNAL_OBSERVABILITY_ENVIRONMENT: " staging ",
  });
  assert.equal(custom?.serviceName, "my-web");
  assert.equal(custom?.environment, "staging");
});

test("sensitive-request log suppression survives awaits and cannot affect simultaneous allowed requests", async () => {
  const configuredOptions = resolveInternalObservabilityOptions(configured)!;
  const seen: boolean[] = [];
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const secretRequest = runWithInternalObservabilityRequest(new Request("https://console.example.test/api/acme/secrets/reveal"), async () => {
    seen.push(configuredOptions.shouldCaptureLog!());
    await barrier;
    seen.push(configuredOptions.shouldCaptureLog!());
  });
  const allowedRequest = runWithInternalObservabilityRequest(new Request("https://console.example.test/api/acme/tunnels"), async () => {
    assert.equal(configuredOptions.shouldCaptureLog!(), true);
    await Promise.resolve();
    assert.equal(configuredOptions.shouldCaptureLog!(), true);
    release();
  });
  await Promise.all([secretRequest, allowedRequest]);
  assert.deepEqual(seen, [false, false]);
  assert.equal(configuredOptions.shouldCaptureLog!(), true, "background logs remain captured outside request scopes");
});

test("all excluded requests suppress log export while preserving results and thrown errors", async () => {
  for (const path of ["/api/auth/session", "/api/acme/%73ecrets/entries", "/api/cli/exchange", "/api/webhooks/polar", "/_serverFn/key", "/v1/logs"]) {
    const response = new Response("still handled");
    assert.equal(runWithInternalObservabilityRequest(new Request(`https://console.example.test${path}`), () => {
      assert.equal(shouldCaptureInternalObservabilityLog(), false);
      return response;
    }), response);
  }
  const failure = new Error("application failure");
  await assert.rejects(runWithInternalObservabilityRequest(new Request("https://console.example.test/api/auth/session"), async () => {
    throw failure;
  }), failure);
  assert.equal(shouldCaptureInternalObservabilityLog(), true);
});

test("an opted-in console rejects ambiguous or insecure telemetry destinations without echoing them", () => {
  for (const endpoint of [undefined, "", "not-a-url", "http://localhost:3000", "https://private:credential@ingest.example.test", "https://ingest.example.test/base", "https://ingest.example.test?token=private", "https://ingest.example.test#private"]) {
    assert.throws(() => resolveInternalObservabilityOptions({ ...configured, OUTRAY_INTERNAL_OBSERVABILITY_ENDPOINT: endpoint }), (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /OUTRAY_INTERNAL_OBSERVABILITY_ENDPOINT/);
      assert.equal(error.message.includes("private"), false);
      assert.equal(error.message.includes("test-internal-token"), false);
      return true;
    });
  }
});

test("credential, secret, server-function and export routes bypass telemetry, including encoded paths", () => {
  for (const pathname of [
    "/login", "/api/auth/callback/github", "/acme/secrets/vaults/one", "/api/acme/secrets/entries/key/reveal",
    "/api/acme/auth-tokens", "/api/cli/exchange", "/api/dashboard/ws-token", "/api/webhooks/polar",
    "/api/uptime/integrations/github.callback", "/_serverFn/unknown", "/v1/traces", "/v1/logs", "/v1/metrics",
    "/api/acme/%73ecrets/entries", "/API/AUTH/session", "/api/bad%encoding",
  ]) assert.equal(ignoreInternalObservabilityRequest({ pathname }), true, pathname);
  for (const pathname of ["/", "/api/health", "/acme/tunnel", "/api/acme/observability/requests", "/api/acme/uptime/monitors"]) {
    assert.equal(ignoreInternalObservabilityRequest({ pathname }), false, pathname);
  }
});

async function loadServer(env: Record<string, string | undefined>) {
  const calls: string[] = [];
  const logScopes: boolean[] = [];
  const response = new Response("application response");
  const fetch = () => {
    calls.push("application-handler");
    logScopes.push(shouldCaptureInternalObservabilityLog());
    return response;
  };
  const source = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as { default: { fetch: (request: Request) => Promise<Response> } } };
  await runInNewContext(`(async () => { ${compiled}\n })()`, {
    module, exports: module.exports, process: { env },
    require: (specifier: string) => {
      calls.push(`import:${specifier}`);
      if (specifier === "./lib/internal-observability.server") return { resolveInternalObservabilityOptions, runWithInternalObservabilityRequest };
      if (specifier === "@tanstack/react-start/server") return { createStartHandler: () => fetch, defaultStreamHandler: {} };
      if (specifier === "@outray/tanstack-start/server") return { createOutrayTanStackServerEntry: (options: unknown) => {
        assert.deepEqual(options, resolveInternalObservabilityOptions(env));
        calls.push("sdk-initialized"); return { fetch };
      } };
      throw new Error(`Unexpected server dependency: ${specifier}`);
    },
  });
  return { entry: module.exports.default, calls, response, logScopes };
}

test("disabled server entry does not import or initialize the SDK and preserves application responses", async () => {
  const result = await loadServer({ OUTRAY_API_KEY: "unrelated-key" });
  assert.equal(await result.entry.fetch(new Request("https://console.example.test/")), result.response);
  assert.equal(result.calls.includes("import:@outray/tanstack-start/server"), false);
  assert.equal(result.calls.filter((call) => call === "application-handler").length, 1);
});

test("opted-in server initializes the adapter before handling requests without replacing start middleware", async () => {
  const result = await loadServer(configured);
  assert.equal(result.calls.includes("sdk-initialized"), true);
  assert.equal(result.calls.includes("application-handler"), false);
  assert.equal(await result.entry.fetch(new Request("https://console.example.test/")), result.response);
  assert.ok(result.calls.indexOf("sdk-initialized") < result.calls.indexOf("application-handler"));
  const startSource = await readFile(new URL("../src/start.ts", import.meta.url), "utf8");
  assert.match(startSource, /requestMiddleware: \[instancePolicy\]/);
});

test("the opted-in server fetch scopes sensitive-route logging without replacing its response", async () => {
  const result = await loadServer(configured);
  assert.equal(await result.entry.fetch(new Request("https://console.example.test/api/auth/session")), result.response);
  assert.equal(await result.entry.fetch(new Request("https://console.example.test/api/acme/uptime/monitors")), result.response);
  assert.deepEqual(result.logScopes, [false, true]);
});
