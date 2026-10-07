import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readMigrationFiles } from "drizzle-orm/migrator";

const migrationFolder = new URL("../drizzle/", import.meta.url);

async function statements(name: string) {
  const source = await readFile(new URL(name, migrationFolder), "utf8");
  return source.split("--> statement-breakpoint")
    .map((statement) => statement.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

test("0026 preserves existing monitor behavior before installing new-monitor defaults", async () => {
  const sql = await statements("0026_uptime_incident_publishing.sql");
  const thresholdBackfill = sql.indexOf('UPDATE "uptime_monitors" SET "failure_threshold" = 2;');
  const automaticBackfill = sql.indexOf('UPDATE "uptime_monitors" SET "incident_publishing" = \'automatic\';');

  assert.ok(thresholdBackfill > sql.indexOf('ALTER TABLE "uptime_monitors" ADD COLUMN "failure_threshold" integer;'));
  assert.ok(sql.indexOf('ALTER TABLE "uptime_monitors" ALTER COLUMN "failure_threshold" SET NOT NULL;') > thresholdBackfill);
  assert.ok(sql.indexOf('ALTER TABLE "uptime_monitors" ALTER COLUMN "failure_threshold" SET DEFAULT 3;') > thresholdBackfill);
  assert.ok(automaticBackfill > sql.indexOf('ALTER TABLE "uptime_monitors" ADD COLUMN "incident_publishing" text;'));
  assert.ok(sql.indexOf('ALTER TABLE "uptime_monitors" ALTER COLUMN "incident_publishing" SET NOT NULL;') > automaticBackfill);
  assert.ok(sql.indexOf('ALTER TABLE "uptime_monitors" ALTER COLUMN "incident_publishing" SET DEFAULT \'manual\';') > automaticBackfill);
  assert.ok(sql.includes('ALTER TABLE "uptime_monitors" ADD COLUMN "publish_after_minutes" integer DEFAULT 5 NOT NULL;'));
  assert.equal(sql.filter((statement) => statement.startsWith('UPDATE "uptime_monitors"')).length, 2,
    "existing monitors must not be reconfigured by an additional backfill");
});

test("0026 preserves publication of existing automatic incidents without publishing other sources", async () => {
  const sql = await statements("0026_uptime_incident_publishing.sql");
  const backfill = 'UPDATE "incidents" SET "uptime_publication_state" = \'published\', "uptime_published_at" = "started_at" WHERE "source_type" = \'uptime_monitor\';';
  const backfillIndex = sql.indexOf(backfill);
  assert.ok(backfillIndex > sql.indexOf('ALTER TABLE "incidents" ADD COLUMN "uptime_publication_state" text;'));
  assert.ok(backfillIndex > sql.indexOf('ALTER TABLE "incidents" ADD COLUMN "uptime_published_at" timestamp (3) with time zone;'));
  assert.equal(sql.filter((statement) => statement.startsWith('UPDATE "incidents"')).length, 1);
  assert.ok(sql.findIndex((statement) => statement.includes('ADD CONSTRAINT "incidents_uptime_publication_state_check"')) > backfillIndex);
  assert.match(sql.join("\n"), /"source_type" <> 'uptime_monitor' AND "uptime_publication_state" IS NULL/);
  assert.ok(sql.some((statement) => statement.startsWith('CREATE INDEX "incidents_uptime_publication_idx"')));
});

test("0027 reconciles generated snapshot history without repeating or mutating the 0026 schema", async () => {
  assert.deepEqual(await statements("0027_tidy_gwen_stacy.sql"), ["SELECT 1;"],
    "a duplicate ALTER/CREATE fails the transactional migration batch and rolls back pending 0026");
  const journal = JSON.parse(await readFile(new URL("meta/_journal.json", migrationFolder), "utf8")) as {
    entries: Array<{ idx: number; tag: string; when: number; breakpoints: boolean }>;
  };
  const pending = journal.entries.filter((entry) => entry.idx === 26 || entry.idx === 27);
  assert.deepEqual(pending.map(({ idx, tag, when, breakpoints }) => ({ idx, tag, when, breakpoints })), [
    { idx: 26, tag: "0026_uptime_incident_publishing", when: 1790978400000, breakpoints: true },
    { idx: 27, tag: "0027_tidy_gwen_stacy", when: 1791004285235, breakpoints: true },
  ], "keep migration identities and ordering intact");

  // This reads committed migration files only; it never opens a database.
  const migrations = readMigrationFiles({ migrationsFolder: fileURLToPath(migrationFolder) });
  const selected = migrations.filter((migration) => pending.some((entry) => entry.when === migration.folderMillis));
  assert.equal(selected.length, 2);
  assert.deepEqual(selected.map((migration) => migration.folderMillis), pending.map((entry) => entry.when));
  assert.ok(selected[0].sql.some((statement) => statement.includes('SET "failure_threshold" = 2')));
  assert.equal(selected[1].sql.length, 1);
});

test("0027 retains the current publishing snapshot so future generation does not duplicate 0026 again", async () => {
  type Column = { name: string; type: string; notNull: boolean; default?: string | number };
  type Table = { columns: Record<string, Column>; indexes: Record<string, unknown>; checkConstraints: Record<string, unknown> };
  const snapshot = JSON.parse(await readFile(new URL("meta/0027_snapshot.json", migrationFolder), "utf8")) as {
    id: string; prevId: string; tables: Record<string, Table>;
  };
  const previous = JSON.parse(await readFile(new URL("meta/0025_snapshot.json", migrationFolder), "utf8")) as { id: string };
  assert.ok(snapshot.id);
  assert.equal(snapshot.prevId, previous.id);
  const monitors = snapshot.tables["public.uptime_monitors"];
  assert.deepEqual(["failure_threshold", "incident_publishing", "publish_after_minutes"].map((name) => ({
    name, notNull: monitors.columns[name]?.notNull, default: monitors.columns[name]?.default,
  })), [
    { name: "failure_threshold", notNull: true, default: 3 },
    { name: "incident_publishing", notNull: true, default: "'manual'" },
    { name: "publish_after_minutes", notNull: true, default: 5 },
  ]);
  for (const name of ["failure_threshold", "incident_publishing", "publish_after_minutes"]) {
    assert.ok(monitors.checkConstraints[`uptime_monitors_${name}_check`]);
  }
  const incidents = snapshot.tables["public.incidents"];
  assert.equal(incidents.columns.uptime_publication_state?.notNull, false);
  assert.equal(incidents.columns.uptime_published_at?.notNull, false);
  assert.ok(incidents.indexes.incidents_uptime_publication_idx);
  assert.ok(incidents.checkConstraints.incidents_uptime_publication_state_check);
});
