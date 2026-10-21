import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import policy from "../../../shared/status-headless";
import { readJsonBody, RequestBodyError } from "../src/lib/request-body";
import { normalizeEmail } from "../src/lib/security";

const pageId = "acdcc15f-16a4-51cc-a6b9-5f6161706284";
const email = "visitor@example.com";

function fixture(options: {
  production?: boolean; worker?: boolean; disabled?: boolean; missing?: boolean;
  paused?: boolean; result?: string; lookupFailure?: boolean; deliveryFailure?: boolean; ipFailure?: boolean;
} = {}) {
  const calls: unknown[][] = [];
  const warnings: string[] = [];
  let lookups = 0;
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL("../src/lib/headless-subscriptions.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencies: Record<string, unknown> = {
    "../../../../shared/status-headless": { default: policy },
    "./config": { getStatusConfig: () => ({ enabled: !options.disabled, edgeSecret: "test-edge" }) },
    "./request-body": { readJsonBody, RequestBodyError },
    "./runtime": { isStatusProduction: () => options.production === true, getStatusRuntime: () => options.worker ? {} : undefined },
    "./security": { normalizeEmail, safeClientIp: () => {
      if (options.ipFailure) throw new Error("private IP lookup failure");
      return "192.0.2.1";
    } },
    "./status-data": { findPublishedPageById: async (id: string) => {
      lookups++; assert.equal(id, pageId);
      if (options.lookupFailure) throw new Error("private database detail");
      return options.missing ? null : { id, organization_id: "right-org", subscriptions_enabled: !options.paused };
    } },
    "./subscriptions": { requestSubscription: async (...args: unknown[]) => {
      calls.push(args);
      if (options.deliveryFailure) throw new Error(`private provider detail: ${email}`);
      return options.result ?? "sent";
    } },
  };
  runInNewContext(code, { module, exports: module.exports, Request, Response,
    console: { warn: (message: string) => warnings.push(message) },
    require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  const api = module.exports as typeof import("../src/lib/headless-subscriptions");
  return { calls, warnings, lookups: () => lookups,
    subscribe: (request = signup(), id: string | undefined = pageId) => api.subscribeHeadless(request, id, "untrusted-client-address"),
  };
}

function signup(body: unknown = { email }, headers: Record<string, string> = {}, method = "POST") {
  return new Request(`https://status.selfhost.example/api/v1/pages/${pageId}/subscribe`, {
    method, headers: { "Content-Type": "application/json", Origin: "https://custom.example", ...headers },
    ...(method === "OPTIONS" ? {} : { body: JSON.stringify(body) }),
  });
}

test("headless signup uses the path's page and existing double-opt-in flow without analytics entitlement", async () => {
  const h = fixture();
  const response = await h.subscribe(signup({ email: " Visitor@Example.COM ", pageId: "other-page", organizationId: "wrong-org" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(h.calls, [[pageId, email, "192.0.2.1"]]);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  const server = signup(); server.headers.delete("Origin");
  assert.equal((await h.subscribe(server)).status, 200);
});

test("preflight supports cross-origin JSON without any subscriber lookup or email", async () => {
  const h = fixture();
  const response = await h.subscribe(signup(null, {}, "OPTIONS"));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assert.equal(response.headers.get("access-control-allow-headers"), "Content-Type");
  assert.equal(h.lookups(), 0); assert.equal(h.calls.length, 0);
});

test("unpublished, missing and paused pages cannot send confirmation emails", async () => {
  for (const [options, status, code] of [
    [{ missing: true }, 404, "not_found"], [{ paused: true }, 409, "subscriptions_disabled"],
    [{ result: "disabled" }, 409, "subscriptions_disabled"], [{ disabled: true }, 503, "status_unavailable"],
  ] as const) {
    const h = fixture(options); const response = await h.subscribe();
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { error: code });
    assert.equal(h.calls.length, "result" in options ? 1 : 0);
  }
  const h = fixture();
  assert.equal((await h.subscribe(signup(), "invalid")).status, 404);
  assert.equal(h.lookups(), 0); assert.equal(h.calls.length, 0);
});

test("new, already-confirmed, full, throttled and undeliverable requests are indistinguishable", async () => {
  for (const result of ["sent", "already-confirmed", "full", "rate-limited"]) {
    const response = await fixture({ result }).subscribe();
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
  }
  const h = fixture({ deliveryFailure: true }); const response = await h.subscribe();
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(h.warnings, ["headless_subscription_request_failed"]);
});

test("JSON, email and actual streamed byte limits are validated before page lookups", async () => {
  const h = fixture();
  for (const body of [null, [], {}, { email: 123 }, { email: "invalid" }, { email: "a".repeat(255) + "@example.com" }]) {
    assert.equal((await h.subscribe(signup(body))).status, 400);
  }
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
    assert.equal((await h.subscribe(signup({ email }, { "Content-Type": type }))).status, 415);
  }
  const malformed = new Request(signup().url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal((await h.subscribe(malformed)).status, 400);
  assert.equal((await h.subscribe(signup({ email, padding: "x".repeat(4096) }))).status, 413);
  assert.equal((await h.subscribe(signup({ email }, { "Content-Length": "4097" }))).status, 413);
  const encoder = new TextEncoder();
  const streamed = new Request(signup().url, { method: "POST", headers: { "Content-Type": "application/json" },
    body: new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('{"email":"')); controller.enqueue(encoder.encode("é".repeat(2048))); controller.close(); } }),
    duplex: "half",
  } as RequestInit);
  assert.equal((await h.subscribe(streamed)).status, 413);
  assert.equal(h.lookups(), 0); assert.equal(h.calls.length, 0);
});

test("both production runtimes require trusted ingress and trusted IPs", async () => {
  const vps = fixture({ production: true });
  assert.equal((await vps.subscribe()).status, 503);
  assert.equal((await vps.subscribe(signup({ email }, { "x-outray-edge-secret": "wrong" }))).status, 503);
  assert.equal(vps.lookups(), 0); assert.equal(vps.calls.length, 0);
  assert.equal((await vps.subscribe(signup({ email }, { "x-outray-edge-secret": "test-edge" }))).status, 200);
  assert.equal((await fixture({ production: true, worker: true }).subscribe()).status, 200);
  const badIp = fixture({ production: true, worker: true, ipFailure: true });
  assert.equal((await badIp.subscribe()).status, 503); assert.equal(badIp.calls.length, 0);
});

test("data failures are uncached, generic CORS errors rather than leaked provider details", async () => {
  const h = fixture({ lookupFailure: true }); const response = await h.subscribe();
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "status_unavailable" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(h.warnings, ["headless_subscription_unavailable"]);
  assert.equal(h.calls.length, 0);
});
