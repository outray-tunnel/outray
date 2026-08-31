const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SecretsApiClient,
  SecretsApiError,
} = require("../dist/secrets-api.js");

const target = {
  organization: "acme team",
  project: "api",
  environment: "dev",
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("uses Bearer auth and the agreed target query contract", async () => {
  const calls = [];
  const client = new SecretsApiClient(
    "https://outray.test/",
    "machine-secret",
    async (url, init) => {
      calls.push({ url: String(url), init });
      return json({ organization: {}, project: {}, environment: {}, secrets: [] });
    },
  );
  await client.list(target, { values: false });

  assert.match(calls[0].url, /^https:\/\/outray\.test\/api\/cli\/secrets\?/);
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get("organization"), "acme team");
  assert.equal(url.searchParams.get("project"), "api");
  assert.equal(url.searchParams.get("environment"), "dev");
  assert.equal(url.searchParams.get("values"), "false");
  assert.equal(calls[0].init.headers.Authorization, "Bearer machine-secret");
});

test("sends writes and deletes without exposing the token in errors", async () => {
  const calls = [];
  const client = new SecretsApiClient("https://outray.test", "do-not-print", async (url, init) => {
    calls.push({ url: String(url), init });
    if (init.method === "PUT") {
      return json({ created: 1, updated: 0, unchanged: 0, revision: 8 });
    }
    return json({ error: "denied", details: { currentRevision: 9 } }, 403);
  });

  assert.deepEqual(await client.put(target, { API_KEY: "secret" }, {
    expectedRevision: 7,
    expectedVersions: { API_KEY: null },
  }), {
    created: 1,
    updated: 0,
    unchanged: 0,
    revision: 8,
  });
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    secrets: { API_KEY: "secret" },
    expectedRevision: 7,
    expectedVersions: { API_KEY: null },
  });
  await assert.rejects(
    () => client.delete(target, "API_KEY", {
      expectedRevision: 8,
      expectedVersion: 3,
    }),
    (error) => {
      assert.ok(error instanceof SecretsApiError);
      assert.equal(error.status, 403);
      assert.equal(error.message, "denied");
      assert.deepEqual(error.details, { currentRevision: 9 });
      assert.doesNotMatch(error.message, /do-not-print/);
      return true;
    },
  );
});

test("propagates production confirmation to every value and runtime operation", async () => {
  const calls = [];
  const client = new SecretsApiClient(
    "https://outray.test",
    "machine-secret",
    async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/targets")) return json({ organizations: [] });
      if (String(url).includes("/revision")) {
        return json({ revision: 1, count: 0, updatedAt: null });
      }
      if (init.method === "PUT") {
        return json({ created: 1, updated: 0, unchanged: 0, revision: 2 });
      }
      if (init.method === "DELETE") return json({ deleted: 1, revision: 2 });
      if (String(url).includes("/rollback")) {
        return json({ secret: { id: "id-1", key: "API_KEY", version: 4 }, revision: 2 });
      }
      return json({ organization: {}, project: {}, environment: {}, secrets: [] });
    },
  );

  await client.list(target, { values: true, confirmProduction: true });
  await client.put(target, { API_KEY: "secret" }, {
    expectedRevision: 1,
    expectedVersions: { API_KEY: 3 },
    confirmProduction: true,
  });
  await client.delete(target, "API_KEY", {
    expectedRevision: 1,
    expectedVersion: 3,
    confirmProduction: true,
  });
  await client.rollback(target, "id-1", 1, {
    expectedRevision: 1,
    expectedVersion: 3,
    confirmProduction: true,
  });
  await client.revision(target, { confirmProduction: true });
  await client.targets();

  for (const call of calls.slice(0, 5)) {
    assert.equal(
      new URL(call.url).searchParams.get("confirmProduction"),
      "true",
    );
  }
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    confirmProduction: true,
  });
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    secrets: { API_KEY: "secret" },
    expectedRevision: 1,
    expectedVersions: { API_KEY: 3 },
    confirmProduction: true,
  });
  assert.equal(new URL(calls[2].url).searchParams.get("key"), "API_KEY");
  assert.deepEqual(JSON.parse(calls[2].init.body), {
    expectedRevision: 1,
    expectedVersion: 3,
    confirmProduction: true,
  });
  assert.deepEqual(JSON.parse(calls[3].init.body), {
    secretId: "id-1",
    version: 1,
    expectedRevision: 1,
    expectedVersion: 3,
    confirmProduction: true,
  });
  assert.equal(calls[5].url, "https://outray.test/api/cli/secrets/targets");
});
