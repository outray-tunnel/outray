import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  decodeIncidentCursor, encodeIncidentCursor, incidentListPage, incidentListWhere, parseIncidentListQuery,
} from "../src/lib/uptime/incident-query";

function query(value = "") {
  const parsed = parseIncidentListQuery(new URLSearchParams(value));
  assert.equal(parsed.success, true);
  if (!parsed.success) throw new Error(parsed.error);
  return parsed.data;
}

function compile(value = "") {
  return new PgDialect().sqlToQuery(incidentListWhere("tenant-a", query(value))!);
}

test("incident list defaults preserve the original all-sources 100-row response", () => {
  assert.deepEqual(query(), { q: "", view: "all", source: "all", cursor: null, limit: 100 });
  assert.equal(query("limit=25").limit, 25);
  assert.deepEqual(compile().params, ["tenant-a", "uptime_monitor", "uptime_manual"]);
});

test("list options reject malformed values before querying", () => {
  for (const value of ["view=open", "source=uptime_manual", "limit=0", "limit=101", "limit=-1", "limit=2.5", "limit=", "limit=Infinity", "cursor=", "cursor=not-a-cursor"]) {
    assert.equal(parseIncidentListQuery(new URLSearchParams(value)).success, false, value);
  }
  assert.equal(parseIncidentListQuery(new URLSearchParams({ q: "a".repeat(161) })).success, false);
});

test("title search is a parameterized literal substring, including SQL wildcard characters", () => {
  const value = "API 50%_\\' OR 1=1";
  const compiled = compile(new URLSearchParams({ q: value }).toString());
  assert.match(compiled.sql, /strpos\(lower\("incidents"\."title"\), lower\(\$4\)\) > 0/);
  assert.equal(compiled.params[3], value);
  assert.equal(compiled.sql.includes(value), false);
});

test("active excludes unpublished manual incidents while drafts require no published update", () => {
  const active = compile("view=active");
  assert.match(active.sql, /"incidents"\."status" = \$4/);
  assert.ok(active.params.includes("open"));
  assert.match(active.sql, /or exists/);
  assert.match(active.sql, /"uptime_incident_updates"\."published_at" is not null/);
  assert.equal(active.params.filter((param) => param === "tenant-a").length, 2);
  const drafts = compile("view=drafts&source=manual");
  assert.match(drafts.sql, /not exists/);
  assert.equal(drafts.params.filter((param) => param === "uptime_manual").length, 3);
  const resolved = compile("view=resolved&source=automatic");
  assert.deepEqual(resolved.params, ["tenant-a", "uptime_monitor", "uptime_manual", "uptime_monitor", "resolved"]);
});

test("cursor preserves both descending order keys and rejects invalid payloads", () => {
  const row = { startedAt: new Date("2026-09-30T09:00:00.123Z"), id: "incident-b" };
  const cursor = encodeIncidentCursor(row);
  assert.deepEqual(decodeIncidentCursor(cursor), row);
  const compiled = compile(new URLSearchParams({ cursor }).toString());
  assert.match(compiled.sql, /"incidents"\."started_at" < \$4 or \("incidents"\."started_at" = \$5 and "incidents"\."id" < \$6\)/);
  assert.deepEqual(compiled.params.slice(-3), [row.startedAt.toISOString(), row.startedAt.toISOString(), row.id]);
  for (const invalid of [
    {}, { v: 2, startedAt: row.startedAt, id: row.id },
    { v: 1, startedAt: "not-a-date", id: row.id },
    { v: 1, startedAt: "2026-02-30T09:00:00.123Z", id: row.id },
    { v: 1, startedAt: row.startedAt, id: "" },
  ]) {
    assert.equal(decodeIncidentCursor(Buffer.from(JSON.stringify(invalid)).toString("base64url")), null);
  }
});

test("pagination uses a lookahead row without skipping tied start timestamps", () => {
  const startedAt = new Date("2026-09-30T09:00:00.123Z");
  const rows = ["z", "y", "x"].map((id) => ({ id, startedAt }));
  const first = incidentListPage(rows, 2);
  assert.deepEqual(first.rows.map((row) => row.id), ["z", "y"]);
  assert.deepEqual(decodeIncidentCursor(first.nextCursor!), rows[1]);
  const last = incidentListPage(rows.slice(2), 2);
  assert.deepEqual(last.rows.map((row) => row.id), ["x"]);
  assert.equal(last.nextCursor, null);
  assert.deepEqual(incidentListPage([], 25), { rows: [], nextCursor: null });
});
