import assert from "node:assert/strict";
import test from "node:test";
import { SecretsClientError, secretsClient } from "../src/lib/secrets-client";

const version = {
  id: "version-3",
  version: 3,
  createdAt: "2026-10-07T00:00:00.000Z",
  key: "API_TOKEN",
  source: "rollback",
  sourceVersion: 1,
  createdByType: "user",
  createdById: "opaque-user-id",
  isCurrent: true,
};

function invalidResponse(error: unknown) {
  return error instanceof SecretsClientError && error.status === 502 && error.code === "INVALID_RESPONSE";
}

test("history metadata uses encoded paths, caller cancellation, and uncached same-origin reads", async (t) => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return Response.json({ versions: [version] });
  });
  const signal = new AbortController().signal;
  const data = await secretsClient.versions("acme/team", "api/vault", "prod/env", "secret/id", signal);
  await secretsClient.versions("acme/team", "api/vault", "prod/env", "secret/id");
  assert.equal(data[0].version, 3);
  assert.equal(requests.length, 2);
  for (const { url, init } of requests) {
    assert.equal(url, "/api/acme%2Fteam/secrets/projects/api%2Fvault/environments/prod%2Fenv/secrets/secret%2Fid/versions");
    assert.equal(init.method ?? "GET", "GET");
    assert.equal(init.cache, "no-store");
    assert.equal(init.credentials, "same-origin");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("Accept"), "application/json");
    assert.equal(headers.get("Cache-Control"), "no-store");
  }
  assert.equal(requests[0].init.signal, signal);
  assert.equal(requests[1].init.signal, undefined);
});

test("history normalizes current server provenance without exposing values or opaque actor IDs", async (t) => {
  const sensitive = "HISTORY_MUST_REMAIN_METADATA_ONLY";
  t.mock.method(globalThis, "fetch", async () => Response.json({
    secret: { key: "API_TOKEN", value: sensitive },
    versions: [{ ...version, value: sensitive, ciphertext: sensitive, encryptionKey: sensitive,
      createdByName: "Akin", action: "update" }],
  }));
  const [data] = await secretsClient.versions("acme", "api", "production", "secret-1");
  assert.deepEqual(data, {
    id: "version-3", version: 3, createdAt: version.createdAt,
    createdBy: "Akin", action: "update", isCurrent: true,
    key: "API_TOKEN", source: "rollback", sourceVersion: 1, createdByType: "user",
  });
  assert.equal(JSON.stringify(data).includes(sensitive), false);
  assert.equal(JSON.stringify(data).includes(version.createdById), false);
});

test("history keeps absent current markers distinct from explicit false and never promotes the first row", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ versions: [
    { ...version, isCurrent: false },
    { version: 2, createdAt: version.createdAt, createdById: "opaque-machine-id", createdByType: "machine" },
    { version: 1, createdAt: version.createdAt, createdBy: "Legacy display name", action: "create" },
  ] }));
  const data = await secretsClient.versions("acme", "api", "production", "secret-1");
  assert.deepEqual(data.map((item) => item.isCurrent), [false, undefined, undefined]);
  assert.equal(data[1].id, "2");
  assert.equal(data[1].createdBy, null);
  assert.equal(data[1].createdByType, "machine");
  assert.equal(data[1].key, null);
  assert.equal(data[1].source, null);
  assert.equal(data[1].sourceVersion, null);
  assert.equal(data[2].createdBy, "Legacy display name");
  assert.equal(data[2].action, "create");
});

test("history supports bare and existing collection aliases, including genuinely empty history", async (t) => {
  for (const payload of [[version], { versions: [version] }, { items: [version] }, { data: [version] }]) {
    t.mock.method(globalThis, "fetch", async () => Response.json(payload));
    assert.equal((await secretsClient.versions("acme", "api", "production", "secret-1"))[0].version, 3);
  }
  for (const payload of [[], { versions: [] }, { items: [] }, { data: [] }]) {
    t.mock.method(globalThis, "fetch", async () => Response.json(payload));
    assert.deepEqual(await secretsClient.versions("acme", "api", "production", "secret-1"), []);
  }
});

test("missing or malformed history is a failed request, not a successful empty timeline", async (t) => {
  const payloads: unknown[] = [
    null, "sign in", 1, {}, { data: {} }, { versions: null }, { items: "not a list" },
    { versions: null, items: [] }, { versions: {}, data: [] }, { items: "not a list", data: [] },
    { versions: [null] }, { versions: [{}] }, { versions: ["not a version"] },
    ...[undefined, "3", 0, -1, 1.5, null, Number.MAX_SAFE_INTEGER + 1]
      .map((value) => ({ versions: [{ ...version, version: value }] })),
    ...[undefined, null, 3, {}, "", "not a date"]
      .map((value) => ({ versions: [{ ...version, createdAt: value }] })),
  ];
  for (const payload of payloads) {
    t.mock.method(globalThis, "fetch", async () => Response.json(payload));
    await assert.rejects(secretsClient.versions("acme", "api", "production", "secret-1"), invalidResponse);
  }
});

test("HTTP history errors and successful HTML remain errors instead of empty timelines", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    error: "History unavailable", code: "HISTORY_UNAVAILABLE",
  }, { status: 503 }));
  await assert.rejects(secretsClient.versions("acme", "api", "production", "secret-1"), (error: unknown) =>
    error instanceof SecretsClientError && error.status === 503 &&
    error.code === "HISTORY_UNAVAILABLE" && error.message === "History unavailable");
  t.mock.method(globalThis, "fetch", async () => new Response("<!doctype html><title>Sign in</title>"));
  await assert.rejects(secretsClient.versions("acme", "api", "production", "secret-1"), SyntaxError);
});

test("history forwards cancellation to pending transport", async (t) => {
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => {
    requestSignal = init.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  const controller = new AbortController();
  const pending = secretsClient.versions("acme", "api", "production", "secret-1", controller.signal);
  assert.equal(requestSignal, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("history rejects post-JSON cancellation even if transport ignores abort", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => {
    const response = Response.json({ versions: [version] });
    t.mock.method(response, "json", async () => {
      controller.abort();
      return { versions: [version] };
    });
    return response;
  });
  await assert.rejects(secretsClient.versions("acme", "api", "production", "secret-1", controller.signal),
    { name: "AbortError" });
});

test("historical reveal and copy keep audited intent/version and forward cancellation with uncached POST", async (t) => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return Response.json({ value: "fixture-value", expiresIn: 17 });
  });
  const signal = new AbortController().signal;
  for (const intent of ["reveal", "copy"] as const) {
    assert.deepEqual(await secretsClient.revealSecret("acme/team", "api/vault", "prod/env", "secret/id",
      { intent, version: 2 }, signal), { value: "fixture-value", expiresIn: 17 });
  }
  for (const [index, { url, init }] of requests.entries()) {
    assert.equal(url, "/api/acme%2Fteam/secrets/projects/api%2Fvault/environments/prod%2Fenv/secrets/secret%2Fid/reveal");
    assert.equal(init.method, "POST");
    assert.equal(init.signal, signal);
    assert.equal(init.cache, "no-store");
    assert.equal(init.credentials, "same-origin");
    assert.deepEqual(JSON.parse(String(init.body)), { intent: index === 0 ? "reveal" : "copy", version: 2 });
    assert.equal(new Headers(init.headers).get("Content-Type"), "application/json");
  }
});

test("reveal retains legacy envelopes and clamps the in-memory expiry to one through thirty seconds", async (t) => {
  const payloads = [
    { payload: { value: "fixture-value" }, expiresIn: 30 },
    { payload: { secret: { value: "fixture-value", expiresIn: 0 } }, expiresIn: 1 },
    { payload: { data: { value: "fixture-value", expiresIn: 99 } }, expiresIn: 30 },
    { payload: { value: "fixture-value", expiresIn: 4.8 }, expiresIn: 4 },
  ];
  for (const { payload, expiresIn } of payloads) {
    t.mock.method(globalThis, "fetch", async () => Response.json(payload));
    assert.deepEqual(await secretsClient.revealSecret("acme", "api", "production", "secret-1", { intent: "reveal" }),
      { value: "fixture-value", expiresIn });
  }
});

test("reveal forwards cancellation to pending transport", async (t) => {
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => {
    requestSignal = init.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  const controller = new AbortController();
  const pending = secretsClient.revealSecret("acme", "api", "production", "secret-1",
    { intent: "reveal", version: 2 }, controller.signal);
  assert.equal(requestSignal, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("reveal discards post-JSON plaintext when transport ignores cancellation", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => {
    const response = Response.json({ value: "fixture-value", expiresIn: 30 });
    t.mock.method(response, "json", async () => {
      controller.abort();
      return { value: "fixture-value", expiresIn: 30 };
    });
    return response;
  });
  await assert.rejects(secretsClient.revealSecret("acme", "api", "production", "secret-1",
    { intent: "copy", version: 2 }, controller.signal), { name: "AbortError" });
});

test("reveal preserves authorization errors and never retries an audited read automatically", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => {
    attempts++;
    return Response.json({ error: "You cannot reveal this secret", code: "FORBIDDEN" }, { status: 403 });
  });
  await assert.rejects(secretsClient.revealSecret("acme", "api", "production", "secret-1", { intent: "reveal" }),
    (error: unknown) => error instanceof SecretsClientError && error.status === 403 && error.code === "FORBIDDEN");
  assert.equal(attempts, 1);
});
