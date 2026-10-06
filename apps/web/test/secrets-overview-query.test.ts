import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  secretsOverviewQuery,
  type SecretsOverviewSnapshot,
} from "../src/components/secrets/overview-query";
import { SecretsClientError, secretsClient } from "../src/lib/secrets-client";

const response = {
  summary: { projects: 1, environments: 1, secrets: 3, deletedItems: 2, lastRotationAt: null },
  projects: [{
    id: "vault-1", slug: "api", name: "API", description: "Application credentials",
    environmentCount: 1, secretCount: 3,
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z",
    environments: [{
      id: "env-1", slug: "production", name: "Production", isProduction: true,
      revision: 4, secretCount: 3,
      createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z",
    }],
  }],
  recentActivity: [{
    id: "event-1", action: "secret.created", targetType: "secret", targetName: "API_KEY",
    createdAt: "2026-10-05T00:00:00.000Z",
  }],
};
const empty = { summary: { projects: 0, environments: 0, secrets: 0 }, projects: [], recentActivity: [] };

test("overview query scopes metadata to the organization and passes cancellation", async (t) => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requestUrl = url;
    requestInit = init;
    return Response.json(response);
  });
  const client = new QueryClient();
  try {
    const before = Date.now();
    const options = secretsOverviewQuery("acme/team");
    const data = await client.fetchQuery(options);
    assert.equal(requestUrl, "/api/acme%2Fteam/secrets/overview");
    assert.ok(requestInit?.signal instanceof AbortSignal);
    assert.equal(requestInit?.cache, "no-store");
    assert.equal(requestInit?.credentials, "same-origin");
    assert.deepEqual(options.queryKey, ["secrets", "overview", "acme/team"]);
    assert.deepEqual([data.projectCount, data.environmentCount, data.secretCount], [1, 1, 3]);
    assert.equal(data.projects[0].slug, "api");
    assert.equal(data.projects[0].description, "Application credentials");
    assert.equal(data.projects[0].environments[0].isProduction, true);
    assert.equal(data.projects[0].environments[0].revision, 4);
    assert.equal(data.recentActivity[0].resourceType, "secret");
    assert.equal(data.recentActivity[0].resourceName, "API_KEY");
    assert.ok(data.receivedAt >= before && data.receivedAt <= Date.now());
    assert.equal(client.getQueryData(["secrets", "overview", "other-team"]), undefined);
  } finally { client.clear(); }
});

test("overview accepts current empty responses and legacy payload/list/count aliases", async (t) => {
  const payloads = [
    empty,
    { overview: response },
    { data: {
      projectCount: 1, environmentCount: 1, secretCount: 3,
      projects: { projects: response.projects }, audit: { items: response.recentActivity },
    } },
    { projects: response.projects, recentActivity: { events: response.recentActivity } },
  ];
  for (const payload of payloads) {
    t.mock.method(globalThis, "fetch", async () => Response.json(payload));
    const data = await secretsClient.overview("acme");
    const expected = payload === empty ? [0, 0, 0] : [1, 1, 3];
    assert.deepEqual([data.projectCount, data.environmentCount, data.secretCount], expected);
    assert.equal(data.projects.length, expected[0]);
  }
});

test("malformed overview JSON is an error, never a successful empty snapshot", async (t) => {
  const malformed: unknown[] = [
    null, [], "login required", {}, { data: {} }, { overview: {} },
    { ...empty, projects: undefined }, { ...empty, recentActivity: undefined },
    { ...empty, projects: "not a list" }, { ...empty, recentActivity: {} },
    { ...empty, summary: "not a summary" },
    { ...empty, summary: { ...empty.summary, secrets: "0" } },
    { ...empty, summary: { ...empty.summary, projects: -1 } },
    { ...empty, summary: { ...empty.summary, environments: 0.5 } },
    { ...empty, projects: [null] }, { ...empty, projects: [{}] },
    { ...empty, projects: [{ name: "API", environments: {} }] },
    { ...empty, projects: [{ name: "API", environments: [null] }] },
    { ...empty, projects: [{ name: "API", secretCount: "3" }] },
    { ...empty, projects: [{ name: "API", environments: [{ name: "Production", revision: -1 }] }] },
    { ...empty, recentActivity: [null] }, { ...empty, recentActivity: [{}] },
  ];
  const client = new QueryClient();
  try {
    for (const payload of malformed) {
      t.mock.method(globalThis, "fetch", async () => Response.json(payload));
      const options = secretsOverviewQuery("acme");
      await assert.rejects(client.fetchQuery(options), (error: unknown) =>
        error instanceof SecretsClientError && error.code === "INVALID_RESPONSE",
      );
      assert.equal(client.getQueryData(options.queryKey), undefined);
    }
  } finally { client.clear(); }
});

test("HTTP and successful HTML responses cannot masquerade as an empty overview", async (t) => {
  const client = new QueryClient();
  const options = secretsOverviewQuery("acme");
  try {
    let attempts = 0;
    t.mock.method(globalThis, "fetch", async () => {
      attempts++;
      return Response.json({ error: "Overview unavailable" }, { status: 503 });
    });
    await assert.rejects(client.fetchQuery(options), /Overview unavailable/);
    assert.equal(attempts, 1);
    assert.equal(client.getQueryData(options.queryKey), undefined);
    t.mock.method(globalThis, "fetch", async () => new Response("<!doctype html><title>Sign in</title>"));
    await assert.rejects(client.fetchQuery(options), /invalid response\. Please try again/);
    assert.equal(client.getQueryData(options.queryKey), undefined);
  } finally { client.clear(); }
});

test("failed refresh keeps the last successful metadata and timestamp", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json(response));
  const client = new QueryClient();
  const options = secretsOverviewQuery("acme");
  try {
    const prior = await client.fetchQuery(options);
    t.mock.method(globalThis, "fetch", async () => Response.json({}));
    await client.invalidateQueries({ queryKey: options.queryKey, refetchType: "none" });
    await assert.rejects(client.fetchQuery(options), /overview response is invalid/);
    assert.equal(client.getQueryData(options.queryKey), prior);
    assert.equal(client.getQueryState(options.queryKey)?.status, "error");
  } finally { client.clear(); }
});

test("organization switches have no previous organization's placeholder", () => {
  const client = new QueryClient();
  const prior: SecretsOverviewSnapshot = {
    projectCount: 0, environmentCount: 0, secretCount: 0,
    projects: [], recentActivity: [], receivedAt: 100,
  };
  client.setQueryData(secretsOverviewQuery("acme").queryKey, prior);
  const observer = new QueryObserver(client, secretsOverviewQuery("acme"));
  assert.equal(observer.getCurrentResult().data, prior);
  observer.setOptions(secretsOverviewQuery("other-team"));
  assert.equal(observer.getCurrentResult().data, undefined);
  assert.equal(observer.getCurrentResult().isPlaceholderData, false);
  observer.destroy();
  client.clear();
});

test("overview refreshes every thirty seconds while visible and on focus/reconnect", () => {
  const options = secretsOverviewQuery("acme");
  assert.equal(options.staleTime, 30_000);
  assert.equal(options.refetchInterval, 30_000);
  assert.equal(options.refetchIntervalInBackground, false);
  assert.equal(options.refetchOnWindowFocus, true);
  assert.equal(options.refetchOnReconnect, true);
  assert.equal(options.retry, false);
  assert.equal(secretsOverviewQuery("").enabled, false);
});

test("leaving the overview aborts pending reads without caching late data", (t) => {
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => {
    requestSignal = init.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  const client = new QueryClient();
  const options = secretsOverviewQuery("acme");
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  assert.ok(requestSignal instanceof AbortSignal);
  unsubscribe();
  assert.equal(requestSignal.aborted, true);
  assert.equal(client.getQueryData(options.queryKey), undefined);
  client.clear();
});

test("overview rejects cancellation after JSON resolution even if transport ignores it", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => {
    const result = Response.json(response);
    t.mock.method(result, "json", async () => {
      controller.abort();
      return response;
    });
    return result;
  });
  await assert.rejects(secretsClient.overview("acme", controller.signal), { name: "AbortError" });
});
