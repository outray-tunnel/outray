import assert from "node:assert/strict";
import test from "node:test";
import { SecretsClientError, secretsClient } from "../src/lib/secrets-client";

const environment = {
  id: "env-1", slug: "production", name: "Production", description: "API deployments",
  color: "violet", isProduction: true, revision: 4, secretCount: 3,
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z",
};
const project = {
  id: "vault-1", slug: "api", name: "API", description: "Application credentials",
  environmentCount: 1, secretCount: 3, environments: [environment],
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z",
};

function invalidResponse(error: unknown) {
  return error instanceof SecretsClientError && error.code === "INVALID_RESPONSE" && error.status === 502;
}

test("vault catalog reads encode organizations and use cancellable, uncached same-origin GET requests", async (t) => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return Response.json({ projects: [project] });
  });
  const signal = new AbortController().signal;
  const data = await secretsClient.projects("acme/team ?", signal);
  await secretsClient.projects("acme/team ?");
  assert.equal(data[0].name, "API");
  assert.equal(requests.length, 2);
  for (const { url, init } of requests) {
    assert.equal(url, "/api/acme%2Fteam%20%3F/secrets/projects");
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

test("vault catalogs accept bare collections, collection aliases, and nested data envelopes", async (t) => {
  const payloads = [
    [project], { projects: [project] }, { items: [project] }, { data: [project] },
    { data: { projects: [project] } }, { data: { items: [project] } },
    { data: { data: [project] } }, { data: { data: { projects: [project] } } },
    { projects: [project], items: [project], data: [project],
      projectCount: 1, environmentCount: 1, secretCount: 3 },
  ];
  for (const payload of payloads) {
    t.mock.method(globalThis, "fetch", async () => Response.json(payload));
    const data = await secretsClient.projects("acme");
    assert.equal(data.length, 1);
    assert.equal(data[0].slug, "api");
    assert.equal(data[0].description, "Application credentials");
    assert.deepEqual([data[0].environmentCount, data[0].secretCount], [1, 3]);
    assert.equal(data[0].environments[0].revision, 4);
  }
});

test("explicit empty vault collections remain valid and missing legacy environments normalize to empty", async (t) => {
  const emptyPayloads = [[], { projects: [] }, { items: [] }, { data: [] },
    { data: { projects: [] } }, { data: { data: { items: [] } } },
    { projects: [], items: [], data: [], projectCount: 0, environmentCount: 0, secretCount: 0 }];
  for (const payload of emptyPayloads) {
    t.mock.method(globalThis, "fetch", async () => Response.json(payload));
    assert.deepEqual(await secretsClient.projects("acme"), []);
  }
  t.mock.method(globalThis, "fetch", async () => Response.json({ projects: [
    { name: "Legacy vault", environmentCount: 2, secretCount: 9 },
    { slug: "empty", description: null, environments: [], deletedAt: null },
  ] }));
  const data = await secretsClient.projects("acme");
  assert.deepEqual(data.map((item) => [item.id, item.slug, item.name, item.environments]), [
    ["legacy-vault", "legacy-vault", "Legacy vault", []], ["empty", "empty", "empty", []],
  ]);
  assert.deepEqual([data[0].environmentCount, data[0].secretCount], [2, 9]);
  assert.deepEqual([data[1].environmentCount, data[1].secretCount], [0, 0]);
  assert.equal(data[0].createdAt, "1970-01-01T00:00:00.000Z");
});

test("vault catalog rows return only metadata and cannot be reinterpreted as project/data envelopes", async (t) => {
  const sensitive = "SENSITIVE_CATALOG_VALUE";
  t.mock.method(globalThis, "fetch", async () => Response.json({ projects: [{
    ...project, values: [sensitive], secretValues: [sensitive], ciphertext: sensitive,
    secrets: [{ key: "API_KEY", value: sensitive }], metadata: { value: sensitive },
    project: { name: "Wrong nested vault", environments: [] },
    data: { name: "Wrong data vault", environments: [] },
    environments: [{
      ...environment, color: "  BLUE  ", values: [sensitive], value: sensitive, ciphertext: sensitive,
      secretValues: [sensitive], secrets: [{ value: sensitive }], metadata: { value: sensitive },
    }],
  }] }));
  const [data] = await secretsClient.projects("acme");
  assert.equal(data.name, "API");
  assert.equal(data.slug, "api");
  assert.equal(data.environments[0].color, "blue");
  assert.deepEqual(Object.keys(data).sort(), ["id", "slug", "name", "description", "environments",
    "environmentCount", "secretCount", "createdAt", "updatedAt", "deletedAt"].sort());
  assert.deepEqual(Object.keys(data.environments[0]).sort(), ["id", "slug", "name", "description",
    "color", "secretCount", "revision", "isProduction", "createdAt", "updatedAt", "deletedAt"].sort());
  assert.equal(JSON.stringify(data).includes(sensitive), false);
});

test("catalog environment metadata retains project-read defaults, count aliases, and color allowlisting", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json([{ name: "Legacy vault", environments: [
    { slug: "prod", secretsCount: 2 },
    { name: "Staging", isProduction: false, color: "red; display:none", deletedAt: null },
  ] }]));
  const [data] = await secretsClient.projects("acme");
  assert.deepEqual([data.environmentCount, data.secretCount], [2, 2]);
  assert.deepEqual(data.environments.map((item) => ({ id: item.id, name: item.name, slug: item.slug,
    secretCount: item.secretCount, revision: item.revision, isProduction: item.isProduction,
    color: item.color, updatedAt: item.updatedAt })), [
    { id: "prod", name: "prod", slug: "prod", secretCount: 2, revision: 0, isProduction: true,
      color: null, updatedAt: "1970-01-01T00:00:00.000Z" },
    { id: "staging", name: "Staging", slug: "staging", secretCount: 0, revision: 0,
      isProduction: false, color: null, updatedAt: "1970-01-01T00:00:00.000Z" },
  ]);
});

test("missing or malformed collection aliases cannot masquerade as an empty vault catalog", async (t) => {
  const malformed: unknown[] = [
    null, "login required", 1, {}, { data: {} }, { data: { data: {} } },
    { projects: null }, { items: {} }, { data: "not a list" },
    { projects: "not a list", items: [] }, { projects: {}, data: [] },
    { projects: [], items: null }, { projects: [], data: null },
    { data: { projects: null, items: [] } }, { data: { projects: [], data: {} } },
    { projects: [null], items: [] }, { projects: [{}], data: [] },
    { projects: [], items: [{ name: "Invalid", environments: null }] },
    { projects: [], data: { projects: "not a list", items: [] } },
  ];
  for (const payload of malformed) {
    t.mock.method(globalThis, "fetch", async () => Response.json(payload));
    await assert.rejects(secretsClient.projects("acme"), invalidResponse);
  }
});

test("every supplied catalog summary count must be a nonnegative safe integer", async (t) => {
  for (const key of ["projectCount", "environmentCount", "secretCount"]) {
    for (const value of [null, "0", -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      for (const payload of [
        { projects: [], [key]: value },
        { data: { projects: [], [key]: value } },
      ]) {
        t.mock.method(globalThis, "fetch", async () => Response.json(payload));
        await assert.rejects(secretsClient.projects("acme"), invalidResponse);
      }
    }
  }
});

test("vault catalog rows inherit strict identity, text, date, count, and explicit environment validation", async (t) => {
  const malformedRows: unknown[] = [
    null, [], "API", {}, { id: "vault-1" },
    ...["id", "slug", "name"].flatMap((key) => [
      { ...project, [key]: " " }, { ...project, [key]: 3 },
    ]),
    { ...project, description: {} }, { ...project, createdAt: "not a date" },
    { ...project, updatedAt: null }, { ...project, deletedAt: "not a date" },
    ...["environmentCount", "secretCount"].flatMap((key) => [
      { ...project, [key]: "1" }, { ...project, [key]: -1 },
      { ...project, [key]: 0.5 }, { ...project, [key]: Number.MAX_SAFE_INTEGER + 1 },
    ]),
    ...[null, "not a list", {}, [null], [{}]].map((environments) => ({ ...project, environments })),
    ...["id", "slug", "name"].flatMap((key) => [
      { ...project, environments: [{ ...environment, [key]: " " }] },
      { ...project, environments: [{ ...environment, [key]: 3 }] },
    ]),
    ...["secretCount", "secretsCount", "revision"].flatMap((key) => [
      { ...project, environments: [{ ...environment, [key]: "1" }] },
      { ...project, environments: [{ ...environment, [key]: -1 }] },
      { ...project, environments: [{ ...environment, [key]: 0.5 }] },
      { ...project, environments: [{ ...environment, [key]: Number.MAX_SAFE_INTEGER + 1 }] },
    ]),
    ...[{ description: {} }, { color: {} }, { isProduction: "false" },
      { createdAt: "invalid" }, { updatedAt: null }, { deletedAt: 3 }]
      .map((fields) => ({ ...project, environments: [{ ...environment, ...fields }] })),
  ];
  for (const row of malformedRows) {
    t.mock.method(globalThis, "fetch", async () => Response.json({ projects: [row] }));
    await assert.rejects(secretsClient.projects("acme"), invalidResponse);
  }
});

test("HTTP failures and successful HTML responses are errors, never empty vault catalogs", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => {
    attempts++;
    return Response.json({ error: "Vault catalog unavailable", code: "CATALOG_UNAVAILABLE" }, { status: 503 });
  });
  await assert.rejects(secretsClient.projects("acme"), (error: unknown) =>
    error instanceof SecretsClientError && error.status === 503 &&
    error.code === "CATALOG_UNAVAILABLE" && error.message === "Vault catalog unavailable");
  assert.equal(attempts, 1);
  t.mock.method(globalThis, "fetch", async () => new Response("<!doctype html><title>Sign in</title>"));
  await assert.rejects(secretsClient.projects("acme"));
});

test("vault catalogs forward caller cancellation to pending transport", async (t) => {
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => {
    requestSignal = init.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  const controller = new AbortController();
  const pending = secretsClient.projects("acme", controller.signal);
  assert.equal(requestSignal, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("vault catalogs reject post-JSON cancellation even when transport ignores abort", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => {
    const response = Response.json({ projects: [project] });
    t.mock.method(response, "json", async () => {
      controller.abort();
      return { projects: [project] };
    });
    return response;
  });
  await assert.rejects(secretsClient.projects("acme", controller.signal), { name: "AbortError" });
});
