import assert from "node:assert/strict";
import test from "node:test";
import { SecretsClientError, secretsClient } from "../src/lib/secrets-client";

const record = {
  id: "audit-event", action: "share.created", targetType: "share", targetId: "share-id", targetName: "Shared secrets",
  projectId: "vault-id", environmentId: "environment-id", entryId: null,
  actorType: "user", actorCredential: "session", actorId: "member-id", actorTokenId: null,
  actorName: "Ada Example", actorEmail: "ada@example.invalid", result: "success",
  requestId: "request-id", ipAddress: "192.0.2.25", userAgent: "OutRay test client",
  createdAt: "2026-10-07T08:00:00.000Z", metadata: { count: 2, maxViews: 10 },
};

test("audit reads encode organization/cursor parameters and retain uncached same-origin transport", async (t) => {
  let url = ""; let options: RequestInit | undefined;
  t.mock.method(globalThis, "fetch", async (nextUrl: string, init: RequestInit) => {
    url = nextUrl; options = init; return Response.json({ events: [record], nextCursor: "next-cursor" });
  });
  const page = await secretsClient.audit("team /?β", "cursor +/=β");
  const parsed = new URL(url, "https://test.invalid");
  assert.equal(parsed.pathname, "/api/team%20%2F%3F%CE%B2/secrets/audit");
  assert.equal(parsed.searchParams.get("limit"), "50"); assert.equal(parsed.searchParams.get("cursor"), "cursor +/=β");
  assert.equal(options?.credentials, "same-origin"); assert.equal(options?.cache, "no-store");
  assert.equal(new Headers(options?.headers).get("Accept"), "application/json");
  assert.equal(page.nextCursor, "next-cursor"); assert.equal(page.events.length, 1);
});

test("audit normalizes recorded detail fields while preserving legacy resource-type compatibility", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: [record], nextCursor: null }));
  const [data] = (await secretsClient.audit("acme")).events;
  assert.equal(data.resourceType, "secret", "existing consumers keep their legacy type mapping");
  assert.equal(data.targetType, "share", "the original target remains available for accurate new filters");
  assert.equal(data.resourceId, "share-id"); assert.equal(data.resourceName, "Shared secrets");
  assert.equal(data.result, "success"); assert.equal(data.actorCredential, "session");
  assert.equal(data.actorTokenId, null); assert.equal(data.entryId, null);
  assert.equal(data.requestId, "request-id"); assert.equal(data.ipAddress, "192.0.2.25"); assert.equal(data.userAgent, "OutRay test client");
  assert.equal(data.actorName, "Ada Example"); assert.equal(data.actorEmail, "ada@example.invalid");
  assert.deepEqual(data.metadata, { count: 2, maxViews: 10 });
});

test("an explicit target type wins even when a legacy resource type accompanies the response", async (t) => {
  for (const targetType of ["bulk", "share", "machine_token", "organization_key"]) {
    t.mock.method(globalThis, "fetch", async () => Response.json({ events: [{ ...record, targetType, resourceType: "secret" }] }));
    const [data] = (await secretsClient.audit("acme")).events;
    assert.equal(data.targetType, targetType); assert.equal(data.resourceType, "secret");
  }
});

test("legacy audit collections remain readable without inventing an outcome or credential", async (t) => {
  const legacy = { id: "legacy", action: "environment.created", resourceType: "environment", resourceName: "Development", userName: "Legacy member", userEmail: "legacy@example.invalid", createdAt: record.createdAt };
  for (const payload of [{ events: [legacy] }, { audit: [legacy] }, { items: [legacy] }, { data: [legacy] }]) {
    t.mock.method(globalThis, "fetch", async () => Response.json(payload));
    const [data] = (await secretsClient.audit("acme")).events;
    assert.equal(data.resourceType, "environment"); assert.equal(data.targetType, "environment");
    assert.equal(data.actorType, "user"); assert.equal(data.actorName, "Legacy member");
    assert.equal(data.result, null); assert.equal(data.actorCredential, null); assert.equal(data.requestId, null);
  }
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: [], nextCursor: null }));
  assert.deepEqual(await secretsClient.audit("acme"), { events: [], nextCursor: null });
});

test("only recognized explicit audit outcomes are preserved and all unknown values remain unknown", async (t) => {
  for (const result of ["success", "failure", "denied", undefined, null, "unknown", "SUCCESS", true, 1]) {
    t.mock.method(globalThis, "fetch", async () => Response.json({ events: [{ ...record, result }] }));
    const [data] = (await secretsClient.audit("acme")).events;
    assert.equal(data.result, result === "success" || result === "failure" || result === "denied" ? result : null);
  }
});

test("machine and system provenance normalize without confusing machines with human sessions", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: [
    { ...record, actorType: "machine_token", actorCredential: "machine", actorId: "token-id", actorTokenId: "token-id", actorName: "Deployer", actorEmail: null, metadata: { machineTokenPrefix: "or_prefix" } },
    { ...record, actorType: "system", actorCredential: "system", actorId: null, actorName: null, actorEmail: null },
  ] }));
  const [machine, system] = (await secretsClient.audit("acme")).events;
  assert.equal(machine.actorType, "machine"); assert.equal(machine.actorTokenId, "token-id");
  assert.equal(machine.actorCredential, "machine"); assert.equal(machine.actorName, "Deployer"); assert.equal(machine.actorEmail, null);
  assert.equal(system.actorType, "system"); assert.equal(system.actorCredential, "system"); assert.equal(system.actorId, null);
});

test("audit normalization does not copy unexpected top-level secret or ciphertext payloads", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ events: [{ ...record,
    value: "never-copy-this-value", token: "never-copy-this-token", ciphertext: "never-copy-this-ciphertext",
    oldValue: "never-copy-this-old-value", body: "never-copy-this-body", shareKey: "never-copy-this-key",
  }] }));
  const [data] = (await secretsClient.audit("acme")).events;
  assert.doesNotMatch(JSON.stringify(data), /never-copy-this/);
  for (const key of ["value", "token", "ciphertext", "oldValue", "body", "shareKey"]) assert.equal(key in data, false);
});

test("audit request errors retain the server message and do not become successful empty pages", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Audit access denied", code: "FORBIDDEN" }, { status: 403 }));
  await assert.rejects(secretsClient.audit("acme"), (error: unknown) => error instanceof SecretsClientError && error.status === 403 && error.code === "FORBIDDEN" && /Audit access denied/.test(error.message));
  t.mock.method(globalThis, "fetch", async () => new Response("<!doctype html><title>Sign in</title>"));
  await assert.rejects(secretsClient.audit("acme"), SyntaxError);
});
