import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { parseSubscriberQuery, serializeSubscriber, subscriberCursor, subscriberSearchPattern } from "../src/lib/uptime/subscriber-api";

test("subscriber search and keyset pagination validate untrusted inputs", () => {
  assert.deepEqual(parseSubscriberQuery(new URLSearchParams()), { q: "", status: null, limit: 25, cursor: null });
  const createdAt = new Date("2026-10-13T09:00:00.000Z");
  const parsed = parseSubscriberQuery(new URLSearchParams({ q: " user@example ", status: "confirmed", limit: "100",
    cursor: subscriberCursor({ id: "subscriber-a", createdAt }) }));
  assert.deepEqual(parsed, { q: "user@example", status: "confirmed", limit: 100, cursor: { id: "subscriber-a", createdAt } });
  for (const fields of [
    { status: "admin" }, { limit: "0" }, { limit: "101" }, { limit: "1.5" }, { limit: "NaN" }, { limit: "" },
    { q: "x".repeat(255) }, { cursor: "" }, { cursor: "not-json" }, { cursor: "a".repeat(513) },
    { cursor: Buffer.from(JSON.stringify({ createdAt: "invalid", id: "x" })).toString("base64url") },
    { cursor: Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id: "x", organizationId: "foreign" })).toString("base64url") },
  ]) assert.ok("error" in parseSubscriberQuery(new URLSearchParams(fields)), JSON.stringify(fields));
  assert.equal(subscriberSearchPattern("_100%\\"), "%\\_100\\%\\\\%");
});

test("subscriber serialization never returns confirmation secrets or internal tenant identity", () => {
  const value = serializeSubscriber({ id: "subscriber", email: "customer@example.test", status: "confirmed",
    organizationId: "secret-org", pageId: "secret-page", tokenHash: "secret-confirmation", tokenExpiresAt: new Date(),
    createdAt: new Date(), updatedAt: new Date(), confirmedAt: null, unsubscribedAt: null, lastSentAt: null });
  assert.deepEqual(Object.keys(value).sort(), ["id", "email", "status", "createdAt", "confirmedAt", "unsubscribedAt", "lastSentAt"].sort());
});

test("every subscriber API rejects non-managers before querying email PII or reading a mutation body", async () => {
  for (const [filename, method] of [["index.ts", "GET"], ["settings.ts", "PATCH"], ["$subscriberId.ts", "PATCH"]]) {
    const source = await readFile(new URL(`../src/routes/api/$orgSlug/uptime/subscribers/${filename}`, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} as { Route: { server: { handlers: Record<string, (input: unknown) => Promise<Response>> } } } };
    const denied = Response.json({ error: "Forbidden" }, { status: 403 });
    runInNewContext(compiled, { Response, module, exports: module.exports, require: (specifier: string) => {
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => (definition: unknown) => definition };
      if (specifier === "@/db") return { db: new Proxy({}, { get: () => { throw new Error("Denied managers cannot query PII"); } }) };
      if (specifier === "@/lib/uptime/api") return { requireUptimeManager: async (_request: Request, slug: string) => {
        assert.equal(slug, "url-tenant"); return { error: denied };
      }, jsonBody: () => { throw new Error("Denied mutations cannot read a body"); } };
      return {};
    } });
    const response = await module.exports.Route.server.handlers[method]({ request: new Request("https://example.test/api/url-tenant/uptime/subscribers"), params: { orgSlug: "url-tenant", subscriberId: "foreign" } });
    assert.equal(response, denied);
  }
});

test("subscriber settings migration is additive and default-on with an unbroken snapshot chain", async () => {
  const [migration, previous, snapshot, journal] = await Promise.all([
    readFile(new URL("../drizzle/0032_uptime_subscriber_management.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/0031_snapshot.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../drizzle/meta/0032_snapshot.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.match(migration, /^ALTER TABLE "uptime_status_pages" ADD COLUMN "subscriptions_enabled" boolean DEFAULT true NOT NULL;\s*$/);
  assert.equal(snapshot.prevId, previous.id);
  assert.ok(journal.entries.some((entry: { tag: string }) => entry.tag === "0032_uptime_subscriber_management"));
  const column = snapshot.tables["public.uptime_status_pages"].columns.subscriptions_enabled;
  assert.equal(column.notNull, true); assert.equal(column.default, true);
});
