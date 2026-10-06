import assert from "node:assert/strict";
import test from "node:test";
import { SecretsClientError, secretsClient } from "../src/lib/secrets-client";

const project = {
  id: "vault-1", slug: "api", name: "API", description: "Application credentials",
  environmentCount: 1, secretCount: 3,
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z",
};
const environments = [{
  id: "env-1", slug: "production", name: "Production", description: "API deployments",
  isProduction: true, color: "violet", revision: 4, secretCount: 3,
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z",
}];
const response = { project, environments };

test("project reads encode organization/vault paths and forward cancellation without caching responses", async (t) => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requestUrl = url;
    requestInit = init;
    return Response.json(response);
  });
  const signal = new AbortController().signal;
  const data = await secretsClient.project("acme/team", "api/vault", signal);
  assert.equal(requestUrl, "/api/acme%2Fteam/secrets/projects/api%2Fvault");
  assert.equal(requestInit?.signal, signal);
  assert.equal(requestInit?.cache, "no-store");
  assert.equal(requestInit?.credentials, "same-origin");
  assert.equal(data.name, "API");
  assert.equal(data.description, "Application credentials");
  assert.equal(data.secretCount, 3);
  assert.equal(data.environmentCount, 1);
  assert.equal(data.environments[0].description, "API deployments");
  assert.equal(data.environments[0].revision, 4);
  assert.equal(data.environments[0].isProduction, true);
  assert.equal(data.environments[0].color, "violet");
});

test("project reads accept current split responses, empty catalogs, and legacy envelope aliases", async (t) => {
  const flat = { ...project, environments };
  const payloads = [response, flat, { project: flat }, { data: flat },
    { data: project, environments }, { data: response }];
  for (const payload of payloads) {
    t.mock.method(globalThis, "fetch", async () => Response.json(payload));
    const data = await secretsClient.project("acme", "api");
    assert.equal(data.slug, "api");
    assert.equal(data.environmentCount, 1);
    assert.equal(data.secretCount, 3);
    assert.equal(data.environments[0].slug, "production");
  }
  t.mock.method(globalThis, "fetch", async () => Response.json({
    project: { name: "Empty vault", environmentCount: 0, secretCount: 0 }, environments: [],
  }));
  const empty = await secretsClient.project("acme", "empty");
  assert.equal(empty.name, "Empty vault");
  assert.deepEqual(empty.environments, []);
  assert.deepEqual([empty.environmentCount, empty.secretCount], [0, 0]);
});

test("legacy environment names/identities/count aliases keep defaults and top-level catalogs win", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    project: { name: "API", environments: [{ name: "Nested" }] },
    environments: [{ slug: "prod", secretsCount: 2 }],
  }));
  const data = await secretsClient.project("acme", "api");
  assert.equal(data.id, "api");
  assert.equal(data.slug, "api");
  assert.equal(data.environmentCount, 1);
  assert.equal(data.secretCount, 2);
  assert.deepEqual(data.environments.map((environment) => ({
    id: environment.id, name: environment.name, slug: environment.slug,
    secretCount: environment.secretCount, revision: environment.revision,
    isProduction: environment.isProduction, updatedAt: environment.updatedAt,
  })), [{ id: "prod", name: "prod", slug: "prod", secretCount: 2, revision: 0,
    isProduction: true, updatedAt: "1970-01-01T00:00:00.000Z" }]);
});

test("project reads normalize only explicit color names and never return value payload fields", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    project: { ...project, secretValues: ["do-not-return"] },
    environments: [
      { ...environments[0], color: "  BLUE  ", values: ["do-not-return"] },
      { ...environments[0], id: "env-2", color: "red; display:none" },
    ],
  }));
  const data = await secretsClient.project("acme", "api");
  assert.deepEqual(data.environments.map((environment) => environment.color), ["blue", null]);
  assert.equal("secretValues" in data, false);
  assert.equal("values" in data.environments[0], false);
});

test("malformed project JSON is an error, never a successful zero catalog", async (t) => {
  const malformed: unknown[] = [null, [], "login required", {}, { data: {} }, { project: {} },
    { project }, { ...project }, { project: null, environments: [] },
    { project: "API", environments: [] }, { data: [], environments: [] },
    { ...response, environments: undefined }, { ...response, environments: null },
    { ...response, environments: "not a list" }, { ...response, environments: {} },
    { ...response, project: { ...project, secretCount: "3" } },
    { ...response, project: { ...project, environmentCount: -1 } },
    { ...response, project: { ...project, name: " " } },
    { ...response, project: { ...project, updatedAt: "invalid" } },
    { ...response, environments: [null] }, { ...response, environments: [{}] },
    { ...response, environments: [{ ...environments[0], id: "" }] },
    { ...response, environments: [{ ...environments[0], secretCount: "3" }] },
    { ...response, environments: [{ ...environments[0], secretsCount: -1 }] },
    { ...response, environments: [{ ...environments[0], revision: 0.5 }] },
    { ...response, environments: [{ ...environments[0], revision: Number.MAX_SAFE_INTEGER + 1 }] },
    { ...response, environments: [{ ...environments[0], isProduction: "false" }] },
    { ...response, environments: [{ ...environments[0], color: {} }] },
  ];
  for (const payload of malformed) {
    t.mock.method(globalThis, "fetch", async () => Response.json(payload));
    await assert.rejects(secretsClient.project("acme", "api"), (error: unknown) =>
      error instanceof SecretsClientError && error.code === "INVALID_RESPONSE");
  }
});

test("HTTP failures and successful HTML responses cannot masquerade as empty project metadata", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => {
    attempts++;
    return Response.json({ error: "Vault unavailable" }, { status: 503 });
  });
  await assert.rejects(secretsClient.project("acme", "api"), /Vault unavailable/);
  assert.equal(attempts, 1);
  t.mock.method(globalThis, "fetch", async () => new Response("<!doctype html><title>Sign in</title>"));
  await assert.rejects(secretsClient.project("acme", "api"), SyntaxError);
});

test("project reads abort pending transport when their caller leaves the environment", async (t) => {
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => {
    requestSignal = init.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  const controller = new AbortController();
  const pending = secretsClient.project("acme", "api", controller.signal);
  assert.equal(requestSignal, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("project reads reject cancellation after JSON resolution even when transport ignores abort", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => {
    const result = Response.json(response);
    t.mock.method(result, "json", async () => {
      controller.abort();
      return response;
    });
    return result;
  });
  await assert.rejects(secretsClient.project("acme", "api", controller.signal), { name: "AbortError" });
});
