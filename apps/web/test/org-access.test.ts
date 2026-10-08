import assert from "node:assert/strict";
import test from "node:test";
import { createOrganizationAccessResolver } from "../src/lib/org-access";
import { dashboardPoolOptions } from "../src/lib/dashboard-pool-options";

test("organization access resolves one session and only the requested user membership", async () => {
  const lookups: string[] = [];
  const resolve = createOrganizationAccessResolver({
    getSession: async () => {
      lookups.push("session");
      return { user: { id: "user-a" } };
    },
    findOrganization: async (userId, slug) => {
      lookups.push(`${userId}:${slug}`);
      return { id: "org-a", slug };
    },
  });
  const request = new Request("https://outray.test/api/team/stats/overview");
  const [a, b] = await Promise.all([
    resolve(request, "team"),
    resolve(request, "team"),
  ]);
  assert.deepEqual(lookups, ["session", "user-a:team"]);
  assert.strictEqual(a, b);
  assert.deepEqual(a, {
    session: { user: { id: "user-a" } },
    organization: { id: "org-a", slug: "team" },
  });
});

test("organization access never shares authorization across requests or users", async () => {
  const calls: string[] = [];
  const resolve = createOrganizationAccessResolver({
    getSession: async (request) => ({
      user: { id: request.headers.get("x-test-user")! },
    }),
    findOrganization: async (userId, slug) => {
      calls.push(`${userId}:${slug}`);
      return userId === "allowed" ? { id: "private-org" } : undefined;
    },
  });
  const allowed = () =>
    new Request("https://outray.test", {
      headers: { "x-test-user": "allowed" },
    });
  assert.ok("organization" in (await resolve(allowed(), "private")));
  assert.deepEqual(
    await resolve(
      new Request("https://outray.test", {
        headers: { "x-test-user": "denied" },
      }),
      "private",
    ),
    { status: 403 },
  );
  assert.ok("organization" in (await resolve(allowed(), "private")));
  assert.deepEqual(calls, [
    "allowed:private",
    "denied:private",
    "allowed:private",
  ]);
});

test("different slugs in one request share a session, never the membership result", async () => {
  let sessions = 0;
  const resolve = createOrganizationAccessResolver({
    getSession: async () => {
      sessions += 1;
      return { user: { id: "user-a" } };
    },
    findOrganization: async (_, slug) =>
      slug === "allowed" ? { slug } : undefined,
  });
  const request = new Request("https://outray.test");
  const [allowed, denied] = await Promise.all([
    resolve(request, "allowed"),
    resolve(request, "denied"),
  ]);
  assert.ok("organization" in allowed);
  assert.deepEqual(denied, { status: 403 });
  assert.equal(sessions, 1);
});

test("anonymous requests never reach the membership database", async () => {
  const resolve = createOrganizationAccessResolver({
    getSession: async () => null,
    findOrganization: async () => {
      throw new Error("Unexpected membership read");
    },
  });
  assert.deepEqual(await resolve(new Request("https://outray.test"), "team"), {
    status: 401,
  });
});

test("membership changes are observed on the next request instead of caching grants", async () => {
  let member = true;
  const resolve = createOrganizationAccessResolver({
    getSession: async () => ({ user: { id: "user-a" } }),
    findOrganization: async () => (member ? { id: "org-a" } : undefined),
  });
  assert.ok(
    "organization" in
      (await resolve(new Request("https://outray.test"), "team")),
  );
  member = false;
  assert.deepEqual(await resolve(new Request("https://outray.test"), "team"), {
    status: 403,
  });
});

test("database failures propagate, never becoming cached successful access", async () => {
  const resolve = createOrganizationAccessResolver({
    getSession: async () => ({ user: { id: "user-a" } }),
    findOrganization: async () => {
      throw new Error("Database offline");
    },
  });
  await assert.rejects(
    resolve(new Request("https://outray.test"), "team"),
    /Database offline/,
  );
});

test("dashboard connections survive short pauses without increasing pool capacity", () => {
  assert.equal(dashboardPoolOptions.idleTimeoutMillis, 60_000);
  assert.equal(dashboardPoolOptions.max, 25);
  assert.equal(dashboardPoolOptions.connectionTimeoutMillis, 10_000);
});
