import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGzip, gzipSync } from "node:zlib";
import dotenv from "dotenv";
import pg from "pg";
import Redis from "ioredis";
import { planRedisCleanup, applyRedisCleanup, backupRedis } from "./development-redis-cleanup.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const tinybirdSources = ["otel_spans", "otel_logs", "otel_metrics"];
const timeTables = ["tunnel_events", "protocol_events", "request_captures", ...tinybirdSources];
const connectionNames = ["DATABASE_URL", "TIMESCALE_URL", "SHARE_DATABASE_URL", "REDIS_URL"];
const quote = (s) => `"${s.replaceAll('"', '""')}"`;
const literal = (s) => `'${s.replaceAll("'", "''")}'`;

export function databaseIdentity(value) {
  const u = new URL(value);
  const redis = u.protocol.startsWith("redis");
  let host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (["localhost", "127.0.0.1", "[::1]"].includes(host)) host = "loopback";
  const path = decodeURIComponent(u.pathname.slice(1));
  return `${host}:${u.port || (redis ? "6379" : "5432")}/${redis ? Number(path || "0") : path}`;
}

export function assertDevelopmentTargets(environment, production = {}) {
  if (environment.NODE_ENV === "production" || process.env.NODE_ENV === "production") throw new Error("Production mode is forbidden.");
  const forbidden = new Set(["host", "hostaddr", "port", "dbname", "database", "service", "servicefile", "options", "path", "db"]);
  const targets = {};
  for (const name of connectionNames) {
    if (!environment[name]) throw new Error(`${name} is required in the root .env.`);
    const u = new URL(environment[name]);
    if (!(name === "REDIS_URL" ? /^rediss?:$/ : /^postgres(ql)?:$/).test(u.protocol)) throw new Error(`${name}: invalid protocol.`);
    if (!/(^localhost$|^127\.0\.0\.1$|^\[::1\]$|(^|[.-])(dev|development)([.-]|$))/.test(u.hostname.toLowerCase())) throw new Error(`${name}: a verified development host is required.`);
    if ([...u.searchParams.keys()].some((key) => forbidden.has(key.toLowerCase()))) throw new Error(`${name}: connection-routing overrides are forbidden.`);
    if (name !== "REDIS_URL" && u.pathname.length < 2) throw new Error(`${name}: explicit database required.`);
    if (name !== "REDIS_URL" && !u.username) throw new Error(`${name}: explicit database user required.`);
    if (name === "REDIS_URL" && !/^\/(?:\d+)?$/.test(u.pathname || "/")) throw new Error("REDIS_URL: invalid database index.");
    // Compare against EVERY production service, never connect to any of them.
    for (const key of connectionNames) {
      if (production[key] && [...new URL(production[key]).searchParams.keys()].some((key) => forbidden.has(key.toLowerCase()))) throw new Error("Production reference has connection-routing overrides; comparison is unsafe.");
      if (production[key] && databaseIdentity(u) === databaseIdentity(production[key])) throw new Error(`${name}: target overlaps production.`);
    }
    targets[name] = databaseIdentity(u);
  }
  if (environment.TINYBIRD_BRANCH && environment.TINYBIRD_BRANCH !== "development") throw new Error("Only Tinybird development is allowed.");
  return targets;
}

function loadEnvironment() {
  const environment = dotenv.parse(readFileSync(join(root, ".env")));
  const prodPath = join(root, ".env.prod");
  const production = existsSync(prodPath) ? dotenv.parse(readFileSync(prodPath)) : {};
  const targets = assertDevelopmentTargets(environment, production);
  return { environment, targets };
}

function client(environment, name) {
  const u = new URL(environment[name]);
  return new pg.Client({
    host: u.hostname.replace(/^\[|\]$/g, ""), port: Number(u.port || "5432"),
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)), connectionTimeoutMillis: 10_000,
    options: "-c search_path=public", statement_timeout: 180_000,
    ssl: u.searchParams.get("sslmode") === "require" ? { rejectUnauthorized: environment.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : false,
  });
}

async function tinybirdConfiguration() {
  const cfg = JSON.parse(readFileSync(join(root, ".tinyb")));
  if (!/^https:\/\/api\.[a-z0-9.-]+\.tinybird\.co\/?$/.test(cfg.host)) throw new Error("Unexpected Tinybird API origin.");
  let output;
  try { output = execFileSync("tb", ["--branch", "development", "--show-tokens", "token", "ls"], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TB_VERSION_WARNING: "0", TB_CLI_TELEMETRY_OPTOUT: "1" }, timeout: 30_000,
  }); } catch { throw new Error("Development Tinybird credential lookup failed; no tokens are printed."); }
  const tokens = {};
  for (const block of output.split(/^-{10,}$/m)) {
    const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    const token = block.match(/^token:\s*(.+)$/m)?.[1]?.trim();
    if (name && token) tokens[name] = token;
  }
  const tiny = { host: cfg.host.replace(/\/$/, ""), admin: tokens["workspace admin token"], ingest: tokens.OUTRAY_INGEST_TOKEN, query: tokens.OUTRAY_QUERY_TOKEN };
  if (!tiny.admin || !tiny.ingest || !tiny.query) throw new Error("Development Tinybird tokens unavailable.");
  const workspace = await tinyRequest(tiny, "/v1/workspace");
  if (workspace.name !== "development" || !workspace.is_branch || workspace.id === cfg.id) throw new Error("Refusing non-development Tinybird workspace.");
  tiny.workspaceId = workspace.id;
  return tiny;
}

async function tinyRequest(tiny, path, init = {}) {
  const response = await fetch(`${tiny.host}${path}`, { ...init,
    headers: { Authorization: `Bearer ${tiny.admin}`, ...init.headers }, signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`Tinybird request failed (${response.status}) for ${path.split("?")[0]}.`);
  return response.json();
}

async function tinySql(tiny, sql) {
  return (await tinyRequest(tiny, `/v0/sql?${new URLSearchParams({ q: `${sql} FORMAT JSON` })}`)).data;
}

async function resources() {
  const { environment, targets } = loadEnvironment();
  const tiny = await tinybirdConfiguration();
  const database = client(environment, "DATABASE_URL"), timescale = client(environment, "TIMESCALE_URL"), shares = client(environment, "SHARE_DATABASE_URL");
  const redis = new Redis(environment.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
  redis.on("error", () => {});
  const connections = [database, timescale, shares, redis];
  try {
    await Promise.all(connections.map((connection) => connection.connect()));
  } catch (error) {
    await Promise.allSettled([database.end(), timescale.end(), shares.end()]); redis.disconnect(); throw error;
  }
  return { environment, targets: { ...targets, tinybird: `${tiny.host}/development/${tiny.workspaceId}` }, tiny, database, timescale, shares, redis,
    close: async () => { await Promise.allSettled([database.end(), timescale.end(), shares.end(), redis.quit()]); } };
}

async function inspect(r, { allowRetainedHistory = false } = {}) {
  const organizations = (await r.database.query("SELECT id,slug,name FROM organizations ORDER BY slug")).rows;
  const keep = organizations.find((org) => org.slug === "acme");
  if (!keep) throw new Error("Acme must already exist; no writes performed.");
  const owner = (await r.database.query("SELECT user_id AS id FROM members WHERE organization_id=$1 ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END LIMIT 1", [keep.id])).rows[0];
  if (!owner) throw new Error("Acme has no member; refusing reset.");
  const removed = organizations.filter((org) => org.id !== keep.id);
  const removedTunnels = (await r.database.query("SELECT id,url,protocol FROM tunnels WHERE organization_id=ANY($1::text[])", [removed.map((org) => org.id)])).rows;
  const pgTables = (await r.database.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='organization_id' ORDER BY table_name")).rows.map((row) => row.table_name);
  const cascadeTables = (await r.database.query("SELECT conrelid::regclass::text AS name FROM pg_constraint WHERE contype='f' AND confrelid='organizations'::regclass AND confdeltype='c'")).rows.map((row) => row.name);
  if (pgTables.some((table) => !cascadeTables.includes(table))) throw new Error("An organization table lacks its cascading FK; inspect schema before reset.");
  const primary = {};
  for (const table of pgTables) primary[table] = (await r.database.query(`SELECT organization_id,COUNT(*)::int AS rows FROM ${quote(table)} GROUP BY organization_id`)).rows;
  const timescale = {};
  for (const table of timeTables) timescale[table] = (await r.timescale.query(`SELECT organization_id,COUNT(*)::int AS rows FROM ${quote(table)} GROUP BY organization_id`)).rows;
  const tinybird = {};
  for (const source of tinybirdSources) tinybird[source] = await tinySql(r.tiny, `SELECT OrganizationId,count() AS rows FROM ${source} GROUP BY OrganizationId`);
  const shares = (await r.shares.query("SELECT organization_id,COUNT(*)::int AS rows FROM secret_share_ownership GROUP BY organization_id")).rows;
  const redis = await planRedisCleanup(r.redis, keep.id, removed.map((org) => org.id), removedTunnels.map((t) => t.id));
  const keepTunnels = (await r.database.query("SELECT id FROM tunnels WHERE organization_id=$1", [keep.id])).rows;
  if (keepTunnels.some((row) => redis.removedTunnelIds.includes(row.id))) throw new Error("Redis cleanup overlaps an Acme tunnel; no reset allowed.");
  for (const view of allowRetainedHistory ? [] : ["tunnel_stats_1m", "protocol_stats_1m"]) {
    const retained = (await r.timescale.query(`SELECT COUNT(*)::int AS rows FROM ${quote(view)} WHERE tunnel_id=ANY($1::text[])`, [keepTunnels.map((row) => row.id)])).rows[0].rows;
    if (retained) throw new Error("Acme has existing aggregate history; use a selective refresh plan before resetting.");
  }
  return { version: 1, createdAt: new Date().toISOString(), targets: r.targets, keep, owner, removed, removedTunnels, primary, timescale, tinybird, shares, redis };
}

async function fileHash(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function dumpDatabase(environment, name, path, shareOnly = false) {
  const u = new URL(environment[name]);
  const args = ["--format=custom", "--no-owner", "--no-acl", "--host", u.hostname.replace(/^\[|\]$/g, ""), "--port", u.port || "5432", "--username", decodeURIComponent(u.username), "--dbname", decodeURIComponent(u.pathname.slice(1)), "--file", path];
  if (shareOnly) for (const table of ["secret_share_links", "secret_share_ownership", "secret_share_rate_limits"]) args.push("--table", `public.${table}`);
  await writeFile(path, "", { flag: "wx", mode: 0o600 });
  await new Promise((success, failure) => {
    const child = spawn("pg_dump", args, { cwd: root, env: { PATH: process.env.PATH,
      PGPASSWORD: decodeURIComponent(u.password), PGSSLMODE: u.searchParams.get("sslmode") || "prefer" }, stdio: ["ignore", "ignore", "pipe"] });
    child.stderr.resume();
    child.on("error", () => failure(new Error(`${name}: pg_dump could not start.`)));
    child.on("exit", (code) => code === 0 ? success() : failure(new Error(`${name}: pg_dump failed (${code}); reset is blocked.`)));
  });
  await chmod(path, 0o600);
  execFileSync("pg_restore", ["--list", path], { stdio: ["ignore", "pipe", "pipe"] });
}

export function tinybirdBackupProjection(source) {
  if (!tinybirdSources.includes(source)) throw new Error("Unexpected Tinybird source.");
  const schema = readFileSync(join(root, "tinybird/datasources", `${source}.datasource`), "utf8").split("SCHEMA >")[1].split(/\n(?:ENGINE|FORWARD_QUERY|INDEXES)/)[0];
  const columns = [...schema.matchAll(/`([^`]+)`[^\n]+`json:\$\.([^`]+)`/g)];
  if (columns.length < 20) throw new Error("Backup schema mapping incomplete.");
  return columns.map(([, column, property]) => `\`${column}\` AS \`${property.replace(/\[:\]$/, "")}\``).join(", ");
}

async function backupTinybird(r, source, path, expected) {
  const projection = tinybirdBackupProjection(source);
  const order = source === "otel_spans" ? "OrganizationId,Timestamp,TraceId,SpanId,IngestedAt" : "OrganizationId,Timestamp,EventId,IngestedAt";
  async function* batches() {
    for (let offset = 0; offset < expected; offset += 10_000) {
      const sql = `SELECT ${projection} FROM ${source} WHERE OrganizationId != ${literal(r.keep.id)} ORDER BY ${order} LIMIT 10000 OFFSET ${offset} FORMAT JSONEachRow`;
      const response = await fetch(`${r.tiny.host}/v0/sql`, { method: "POST", body: sql,
        headers: { Authorization: `Bearer ${r.tiny.admin}`, "Content-Type": "text/plain" }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`${source}: backup batch failed (${response.status}).`);
      for await (const chunk of Readable.fromWeb(response.body)) yield chunk;
      if ((offset + 10_000) % 200_000 === 0) console.log(`Archiving ${source}: ${Math.min(offset + 10_000, expected)}/${expected}.`);
    }
  }
  let rows = 0;
  const counter = new Transform({ transform(chunk, _encoding, callback) { for (const byte of chunk) rows += Number(byte === 10); callback(null, chunk); } });
  await pipeline(Readable.from(batches()), counter, createGzip(), createWriteStream(path, { flags: "wx", mode: 0o600 }));
  if (rows !== expected) throw new Error(`${source}: backup count mismatch (${rows}/${expected}); no reset allowed.`);
  return rows;
}

async function backup(r) {
  console.log("Inventorying development stores and verifying Redis ownership...");
  const snapshot = await inspect(r);
  const parent = join(homedir(), ".codex", "backups");
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const folder = await mkdtemp(join(parent, "outray-development-reset-"));
  console.log(`Backup directory: ${folder}`);
  r.keep = snapshot.keep;
  const files = [];
  await writeFile(join(folder, "inventory.json"), JSON.stringify(snapshot), { flag: "wx", mode: 0o600 });
  for (const [name, filename, shareOnly] of [["DATABASE_URL", "postgres.dump", false], ["TIMESCALE_URL", "timescale.dump", false], ["SHARE_DATABASE_URL", "shares.dump", true]]) {
    await dumpDatabase(r.environment, name, join(folder, filename), shareOnly); files.push(filename); console.log(`Backed up ${filename}.`);
  }
  for (const source of tinybirdSources) {
    const expected = snapshot.tinybird[source].filter((row) => row.OrganizationId !== snapshot.keep.id).reduce((sum, row) => sum + Number(row.rows), 0);
    const filename = `${source}.ndjson.gz`;
    await backupTinybird(r, source, join(folder, filename), expected); files.push(filename); console.log(`Backed up ${source}: ${expected} rows.`);
  }
  const redisFile = "redis-plan.json";
  await writeFile(join(folder, redisFile), JSON.stringify(snapshot.redis), { flag: "wx", mode: 0o600 }); files.push(redisFile);
  await backupRedis(r.redis, snapshot.redis.inspectedKeys, join(folder, "redis-dump.json")); files.push("redis-dump.json");
  const manifest = { ...snapshot, files: await Promise.all(files.map(async (name) => ({ name, bytes: (await stat(join(folder, name))).size, sha256: await fileHash(join(folder, name)) }))) };
  await writeFile(join(folder, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
  await writeFile(join(folder, "RESTORE.md"), `# Development backup\n\nCreated ${snapshot.createdAt}. Production was never connected.\n\nPostgreSQL files are validated pg_dump custom archives. Restore into separately created disposable databases using pg_restore before selectively recovering data; Timescale restoration needs its extension and timescaledb_pre_restore()/timescaledb_post_restore(). Do not blindly restore over current data.\n\nTinybird .ndjson.gz files contain all removed-tenant rows, with JSON keys matching each datasource ingestion schema. Decompress and append to the development branch only. All exports were counted against the inventory.\n\nredis-plan.json contains binary DUMP backups (base64) and original TTLs for exact deleted keys; use RESTORE with appropriate remaining TTLs, and SADD globalMembersToRemove to restore the online organization index. Authentication/user records were preserved.\n\nThis backup contains private development data. Keep it private and delete it when no longer needed.\n`, { flag: "wx", mode: 0o600 });
  console.log(`Backup ready: ${join(folder, "manifest.json")}`);
}

async function validateBackup(r, manifestPath) {
  if (!manifestPath || !resolve(manifestPath).startsWith(join(homedir(), ".codex", "backups", "outray-development-reset-"))) throw new Error("An explicit development backup manifest is required.");
  const m = JSON.parse(await readFile(manifestPath, "utf8"));
  if (m.version !== 1 || m.keep.slug !== "acme" || JSON.stringify(m.targets) !== JSON.stringify(r.targets)) throw new Error("Backup target mismatch.");
  const required = ["postgres.dump", "timescale.dump", "shares.dump", "redis-plan.json", "redis-dump.json", ...tinybirdSources.map((source) => `${source}.ndjson.gz`)];
  if (!Array.isArray(m.files) || required.some((name) => !m.files.some((file) => file.name === name && file.bytes > 0))) throw new Error("Backup artifacts are incomplete.");
  for (const file of m.files) {
    if (file.name.includes("/") || await fileHash(join(dirname(manifestPath), file.name)) !== file.sha256) throw new Error("Backup integrity check failed.");
  }
  const orgs = (await r.database.query("SELECT id,slug FROM organizations")).rows;
  if (!orgs.some((org) => org.id === m.keep.id && org.slug === "acme") || orgs.some((org) => org.id !== m.keep.id && !m.removed.some((old) => old.id === org.id))) throw new Error("Organization inventory changed; create a new backup.");
  // Refuse normal application writes after the backup. Never silently delete
  // records that were added while the operator was taking the archive.
  const counts = (rows, field) => rows.filter((row) => row[field] !== m.keep.id).map((row) => [row[field], Number(row.rows)]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  for (const [connection, tables] of [[r.database, m.primary], [r.timescale, m.timescale]]) {
    for (const [table, archived] of Object.entries(tables)) {
      const current = (await connection.query(`SELECT organization_id,COUNT(*)::int AS rows FROM ${quote(table)} WHERE organization_id<>$1 GROUP BY organization_id`, [m.keep.id])).rows;
      if (JSON.stringify(counts(current, "organization_id")) !== JSON.stringify(counts(archived, "organization_id"))) throw new Error(`${table}: rows changed since backup; take a fresh backup before reset.`);
    }
  }
  const mutable = (await r.database.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='updated_at'")).rows;
  for (const { table_name: table } of mutable.filter((row) => Object.hasOwn(m.primary, row.table_name))) {
    if ((await r.database.query(`SELECT 1 FROM ${quote(table)} WHERE organization_id<>$1 AND updated_at>$2::timestamptz LIMIT 1`, [m.keep.id, m.createdAt])).rowCount) throw new Error(`${table}: modified since backup; take a fresh backup.`);
  }
  for (const source of tinybirdSources) {
    const current = await tinySql(r.tiny, `SELECT OrganizationId,count() AS rows FROM ${source} WHERE OrganizationId != ${literal(m.keep.id)} GROUP BY OrganizationId`);
    if (JSON.stringify(counts(current, "OrganizationId")) !== JSON.stringify(counts(m.tinybird[source], "OrganizationId"))) throw new Error(`${source}: changed since backup; take a fresh backup.`);
    const fresh = await tinySql(r.tiny, `SELECT count() AS rows FROM ${source} WHERE OrganizationId != ${literal(m.keep.id)} AND IngestedAt > parseDateTime64BestEffort(${literal(m.analyticsArchivedAt || m.createdAt)},9)`);
    if (Number(fresh[0]?.rows)) throw new Error(`${source}: ingested since backup; take a fresh backup.`);
  }
  const currentShares = (await r.shares.query("SELECT organization_id,COUNT(*)::int AS rows FROM secret_share_ownership WHERE organization_id<>$1 GROUP BY organization_id", [m.keep.id])).rows;
  if (JSON.stringify(counts(currentShares, "organization_id")) !== JSON.stringify(counts(m.shares, "organization_id"))) throw new Error("External shares changed since backup; take a fresh backup.");
  return m;
}

async function deleteOwnedShares(client, keepId) {
  const rows = (await client.query("SELECT share_id FROM secret_share_ownership WHERE organization_id <> $1", [keepId])).rows;
  if (!rows.length) return 0;
  // Deleting the links cascades ownership; the public runtime role has no
  // direct DELETE grant on organization metadata and does not need one.
  return (await client.query("DELETE FROM secret_share_links WHERE id=ANY($1::text[])", [rows.map((row) => row.share_id)])).rowCount;
}

async function reset(r, path, { databaseLocked = false, onDatabaseCommit = () => {} } = {}) {
  const m = await validateBackup(r, path);
  const removedIds = m.removed.map((org) => org.id);
  const progress = { startedAt: new Date().toISOString(), targets: r.targets, keep: m.keep, stores: {}, jobs: {} };
  const checkpoint = () => writeFile(join(dirname(path), "reset-progress.json"), JSON.stringify(progress, null, 2), { mode: 0o600 });
  // Check delete permissions and exact archived row counts across every
  // datasource before committing any destructive work in another store.
  for (const source of tinybirdSources) {
    const dryRun = await tinyRequest(r.tiny, `/v0/datasources/${source}/delete`, { method: "POST", body: new URLSearchParams({
      delete_condition: `OrganizationId != ${literal(m.keep.id)}`, dry_run: "true",
    }) });
    const expected = m.tinybird[source].filter((row) => row.OrganizationId !== m.keep.id).reduce((sum, row) => sum + Number(row.rows), 0);
    if (dryRun.rows_to_be_deleted === undefined || Number(dryRun.rows_to_be_deleted) !== expected) throw new Error(`${source}: deletion dry-run does not match the backup.`);
    console.log(`Tinybird ${source}: validated deletion of ${expected} backed-up rows.`);
  }
  // Replan to include fresh tenant counters while refusing nonempty shared queues.
  const redisPlan = await planRedisCleanup(r.redis, m.keep.id, removedIds, m.removedTunnels.map((t) => t.id));
  const keepTunnels = (await r.database.query("SELECT id FROM tunnels WHERE organization_id=$1", [m.keep.id])).rows;
  if (keepTunnels.some((row) => redisPlan.removedTunnelIds.includes(row.id))) throw new Error("Redis cleanup overlaps an Acme tunnel.");
  for (const view of ["tunnel_stats_1m", "protocol_stats_1m"]) {
    if ((await r.timescale.query(`SELECT 1 FROM ${quote(view)} WHERE tunnel_id=ANY($1::text[]) LIMIT 1`, [keepTunnels.map((row) => row.id)])).rowCount) throw new Error("Acme aggregate history appeared after backup; a selective refresh plan is required.");
  }
  // Save every fresh Redis DUMP before executing the guarded atomic cleanup.
  await writeFile(join(dirname(path), `redis-reset-${Date.now()}.json`), JSON.stringify(redisPlan), { flag: "wx", mode: 0o600 });
  await applyRedisCleanup(r.redis, redisPlan);
  progress.stores.redis = "complete"; await checkpoint();
  console.log("Removed verified non-Acme Redis keys; shared queues were empty.");
  // Revoke/delete organization tokens first, preventing fresh accepted ingestion.
  if (!databaseLocked) await r.database.query("BEGIN");
  try {
    await r.database.query("SET LOCAL lock_timeout='10s'");
    await r.database.query("SELECT id FROM organizations ORDER BY id FOR UPDATE");
    await r.database.query("UPDATE sessions SET active_organization_id=NULL WHERE active_organization_id=ANY($1::text[])", [removedIds]);
    await deleteOwnedShares(r.database, m.keep.id);
    const result = await r.database.query("DELETE FROM organizations WHERE id=ANY($1::text[]) AND id<>$2", [removedIds, m.keep.id]);
    await r.database.query("COMMIT"); onDatabaseCommit(); progress.stores.postgres = "complete"; await checkpoint(); console.log(`Deleted ${result.rowCount} development organizations and their cascading records.`);
  } catch (error) { await r.database.query("ROLLBACK"); throw error; }
  await r.shares.query("BEGIN");
  try { const count = await deleteOwnedShares(r.shares, m.keep.id); await r.shares.query("COMMIT"); progress.stores.shares = "complete"; await checkpoint(); console.log(`Removed ${count} non-Acme external owned share links; anonymous shares preserved.`); }
  catch (error) { await r.shares.query("ROLLBACK"); throw error; }
  // Old analytics-only/orphan tenants are also removed, never Acme.
  await r.timescale.query("BEGIN");
  try {
    for (const table of timeTables) {
      const result = await r.timescale.query(`DELETE FROM ${quote(table)} WHERE organization_id <> $1`, [m.keep.id]);
      console.log(`Timescale ${table}: removed ${result.rowCount}.`);
    }
    await r.timescale.query("COMMIT");
  } catch (error) { await r.timescale.query("ROLLBACK"); throw error; }
  // Rebuild all existing history, including materialized-only historical rows.
  for (const view of ["tunnel_stats_1m", "protocol_stats_1m"]) {
    await r.timescale.query("CALL refresh_continuous_aggregate($1::regclass,NULL,NULL,force => true)", [view]);
    console.log(`Refreshed ${view}.`);
  }
  progress.stores.timescale = "complete"; await checkpoint();
  for (const source of tinybirdSources) {
    const form = new URLSearchParams({ delete_condition: `OrganizationId != ${literal(m.keep.id)}` });
    const job = await tinyRequest(r.tiny, `/v0/datasources/${source}/delete`, { method: "POST", body: form });
    const jobId = job.job_id || job.id;
    if (!jobId) throw new Error("Tinybird deletion returned no job.");
    progress.jobs[source] = { jobId, status: "running" }; await checkpoint();
    const deadline = Date.now() + 10 * 60_000;
    for (;;) {
      if (Date.now() >= deadline) throw new Error(`${source}: deletion job wait timed out; its ID is saved in reset-progress.json.`);
      const state = await tinyRequest(r.tiny, `/v0/jobs/${encodeURIComponent(jobId)}`);
      if (state.status === "done") break;
      if (["error", "failed", "cancelled"].includes(state.status)) throw new Error(`${source}: deletion job failed.`);
      await new Promise((done) => setTimeout(done, 1500));
    }
    progress.jobs[source].status = "done"; await checkpoint();
    console.log(`Tinybird ${source}: deletion completed.`);
  }
  await writeFile(join(dirname(path), "reset-completed.json"), JSON.stringify({ completedAt: new Date().toISOString(), keep: m.keep, removed: m.removed }), { mode: 0o600 });
}

async function refreshPrimaryAndReset(r, path) {
  if (!path || !resolve(path).startsWith(join(homedir(), ".codex", "backups", "outray-development-reset-"))) throw new Error("An explicit development backup manifest is required.");
  const archived = JSON.parse(await readFile(path, "utf8"));
  if (archived.version !== 1 || archived.keep.slug !== "acme" || JSON.stringify(archived.targets) !== JSON.stringify(r.targets)) throw new Error("Backup target mismatch.");
  if (existsSync(join(dirname(path), "reset-progress.json"))) throw new Error("A partial reset already exists; inspect its checkpoints first.");
  // Preserve the original archive. Reuse analytics archives only if the full
  // preflight below still matches them; validateBackup checks that before writes.
  for (const file of archived.files) if (file.name.includes("/") || await fileHash(join(dirname(path), file.name)) !== file.sha256) throw new Error("Backup integrity check failed.");
  await r.database.query("BEGIN");
  let databaseCommitted = false;
  try {
    await r.database.query("SET LOCAL lock_timeout='10s'");
    // Include cascading children without organization_id, e.g. agent messages,
    // update bodies, and share ciphertext, as well as direct tenant tables.
    const publicTables = (await r.database.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map((row) => row.table_name);
    await r.database.query(`LOCK TABLE ${publicTables.map(quote).join(", ")} IN SHARE MODE`);
    const orgs = (await r.database.query("SELECT id,slug FROM organizations")).rows;
    if (orgs.length !== archived.removed.length + 1 || orgs.some((org) => org.id !== archived.keep.id && !archived.removed.some((old) => old.id === org.id))) throw new Error("Organization inventory changed; a new complete backup is required.");
    const fresh = { ...archived, createdAt: new Date().toISOString(), analyticsArchivedAt: archived.analyticsArchivedAt || archived.createdAt, primary: {} };
    for (const table of Object.keys(archived.primary)) fresh.primary[table] = (await r.database.query(`SELECT organization_id,COUNT(*)::int AS rows FROM ${quote(table)} GROUP BY organization_id`)).rows;
    const stamp = Date.now();
    const filename = `postgres-refreshed-${stamp}.dump`;
    await dumpDatabase(r.environment, "DATABASE_URL", join(dirname(path), filename));
    await rename(join(dirname(path), "postgres.dump"), join(dirname(path), `postgres-original-${stamp}.dump`));
    await rename(join(dirname(path), filename), join(dirname(path), "postgres.dump"));
    fresh.files = archived.files.map((file) => file.name === "postgres.dump" ? { name: file.name } : file);
    const pgFile = fresh.files.find((file) => file.name === "postgres.dump");
    pgFile.bytes = (await stat(join(dirname(path), "postgres.dump"))).size;
    pgFile.sha256 = await fileHash(join(dirname(path), "postgres.dump"));
    const original = { ...archived, files: archived.files.map((file) => file.name === "postgres.dump" ? { ...file, name: `postgres-original-${stamp}.dump` } : file) };
    await writeFile(join(dirname(path), `manifest-original-${stamp}.json`), JSON.stringify(original, null, 2), { flag: "wx", mode: 0o600 });
    await writeFile(path, JSON.stringify(fresh, null, 2), { mode: 0o600 });
    // Do not move the analytics freshness cutoff forward when reusing archives.
    for (const source of tinybirdSources) {
      const newer = await tinySql(r.tiny, `SELECT count() AS rows FROM ${source} WHERE OrganizationId != ${literal(fresh.keep.id)} AND IngestedAt > parseDateTime64BestEffort(${literal(fresh.analyticsArchivedAt)},9)`);
      if (Number(newer[0]?.rows)) throw new Error(`${source}: newer ingestion requires a fresh analytics backup.`);
    }
    console.log("Latest PostgreSQL data backed up; writes are briefly locked until its reset commits.");
    await reset(r, path, { databaseLocked: true, onDatabaseCommit: () => { databaseCommitted = true; } });
  } catch (error) { if (!databaseCommitted) await r.database.query("ROLLBACK"); throw error; }
}

async function seed(r) {
  const orgs = (await r.database.query("SELECT id,slug,name FROM organizations")).rows;
  if (orgs.length !== 1 || orgs[0].slug !== "acme") throw new Error("Seed requires only Acme to remain.");
  const org = orgs[0];
  const user = (await r.database.query("SELECT user_id AS id FROM members WHERE organization_id=$1 ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END LIMIT 1", [org.id])).rows[0];
  const fixtures = await import("./seed-development.mjs");
  const { seed: seedUptime } = await import("./seed-uptime-development.mjs");
  const { seedAcmeSecrets } = await import("./seed-acme-secrets-development.mjs");
  const { readSecretsKeyring } = await import("../apps/web/src/lib/secrets/crypto.ts");
  const keyring = readSecretsKeyring(r.environment);
  try {
    await fixtures.seedPrimaryDatabase(r.database, org, user);
    console.log("Seeded tunnels, addresses, alert rules, incident and notification history.");
    console.log("Timescale seed:", JSON.stringify(await fixtures.seedTimescale(r.timescale, org.id, { requestCount: 100_000, protocolCount: 16_000, batchSize: 5000 })));
    await fixtures.seedRedis(r.redis, org, user);
    await seedUptime(r.database, "acme");
    console.log("Secrets seed:", JSON.stringify(await seedAcmeSecrets(r.database, keyring, org.id)));
    if ((await r.database.query("SELECT 1 FROM secret_projects WHERE organization_id=$1 AND slug='vault' AND deleted_at IS NULL", [org.id])).rowCount) {
      const { seedDemoSecrets } = await import("./seed-secrets-development.mjs");
      console.log("Existing Acme vault seed:", JSON.stringify(await seedDemoSecrets(r.database, keyring, "vault", "acme")));
    }
  } finally { keyring.active.key.fill(0); for (const key of keyring.previous) key.key.fill(0); }
  await seedTelemetry(r);
  console.log("Acme large development seed complete.");
}

async function seedTelemetry(r) {
  const orgs = (await r.database.query("SELECT id,slug FROM organizations")).rows;
  if (orgs.length !== 1 || orgs[0].slug !== "acme") throw new Error("Telemetry seed requires only Acme.");
  const org = orgs[0];
  const fixtures = await import("./seed-development.mjs");
  const clocks = await tinySql(r.tiny, `SELECT toUnixTimestamp64Milli(IngestedAt) AS clock FROM otel_spans WHERE OrganizationId=${literal(org.id)} GROUP BY IngestedAt`);
  if (clocks.length > 1) throw new Error("Multiple telemetry snapshots exist; inspect before resuming.");
  const now = clocks.length ? Number(clocks[0].clock) : Date.now();
  if (!Number.isSafeInteger(now) || now > Date.now()) throw new Error("Invalid seed snapshot clock.");
  async function storedIds(source, column) {
    const values = new Set();
    for (let offset = 0; ; offset += 5000) {
      const rows = await tinySql(r.tiny, `SELECT DISTINCT ${column} AS id FROM ${source} WHERE OrganizationId=${literal(org.id)} ORDER BY ${column} LIMIT 5000 OFFSET ${offset}`);
      for (const row of rows) values.add(row.id);
      if (rows.length < 5000) return values;
    }
  }
  const ids = {
    otel_spans: await storedIds("otel_spans", "SpanId"),
    otel_logs: await storedIds("otel_logs", "EventId"),
    otel_metrics: await storedIds("otel_metrics", "EventId"),
  };
  console.log(`Resuming telemetry snapshot: ${ids.otel_spans.size} spans, ${ids.otel_logs.size} logs, ${ids.otel_metrics.size} metric records already present.`);
  async function append(source, rows) {
    const property = source === "otel_spans" ? "span_id" : "event_id";
    rows = rows.filter((row) => !ids[source].has(row[property]));
    if (!rows.length) return;
    const response = await fetch(`${r.tiny.host}/v0/events?name=${source}&wait=true`, { method: "POST",
      headers: { Authorization: `Bearer ${r.tiny.ingest}`, "Content-Type": "application/x-ndjson", "Content-Encoding": "gzip" },
      body: gzipSync(rows.map((row) => JSON.stringify(row)).join("\n")), signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`${source}: seed ingestion failed (${response.status}).`);
    const result = await response.json();
    if (Number(result.quarantined_rows || 0)) throw new Error(`${source}: quarantined seed rows.`);
    if (Number(result.successful_rows) !== rows.length) throw new Error(`${source}: incomplete seed ingestion acknowledgement.`);
    for (const row of rows) ids[source].add(row[property]);
  }
  for (let offset = 0; offset < 100_000; offset += 2000) {
    await Promise.all(Array.from({ length: 4 }, async (_, batch) => {
      const records = fixtures.buildTinybirdRecords(org.id, { now, anchor: now - 5000, spanStart: offset + batch * 500, spanCount: 500, spanTotal: 100_000, metricPoints: 0 });
      await Promise.all([append("otel_spans", records.spans), append("otel_logs", records.logs)]);
    }));
    if ((offset + 2000) % 20_000 === 0) console.log(`Observability: ${offset + 2000}/100000 traces (${(offset + 2000) * 4} spans).`);
  }
  for (let offset = 0; offset < 2880; offset += 50) {
    const records = fixtures.buildTinybirdRecords(org.id, { now, anchor: now - 5000, spanCount: 0, metricStart: offset, metricPoints: Math.min(50, 2880 - offset), metricTotal: 2880 });
    await append("otel_metrics", records.metrics);
    if ((offset + 50) % 500 === 0) console.log(`Metric history: ${Math.min(offset + 50, 2880)}/2880 points.`);
  }
  for (const view of ["tunnel_stats_1m", "protocol_stats_1m"]) await r.timescale.query("CALL refresh_continuous_aggregate($1::regclass,NULL,NULL)", [view]);
  console.log("Acme observability seed complete; analytics summaries refreshed.");
}

async function verify(r) {
  const result = await inspect(r, { allowRetainedHistory: true });
  const foreignPrimary = Object.entries(result.primary).filter(([, rows]) => rows.some((row) => row.organization_id !== result.keep.id));
  const foreignTime = Object.entries(result.timescale).filter(([, rows]) => rows.some((row) => row.organization_id !== result.keep.id));
  const foreignTiny = Object.entries(result.tinybird).filter(([, rows]) => rows.some((row) => row.OrganizationId !== result.keep.id));
  if (result.removed.length || foreignPrimary.length || foreignTime.length || foreignTiny.length || result.shares.some((row) => row.organization_id !== result.keep.id) || result.redis.deleteKeys.length || result.redis.globalMembersToRemove.length) throw new Error("Non-Acme data remains; inspect before declaring completion.");
  const retained = (await r.database.query("SELECT COUNT(*)::int AS count FROM users")).rows[0].count;
  const tunnels = (await r.database.query("SELECT id FROM tunnels WHERE organization_id=$1", [result.keep.id])).rows.map((row) => row.id);
  for (const view of ["tunnel_stats_1m", "protocol_stats_1m"]) {
    if ((await r.timescale.query(`SELECT 1 FROM ${quote(view)} WHERE NOT(tunnel_id=ANY($1::text[])) LIMIT 1`, [tunnels])).rowCount) throw new Error(`${view}: foreign aggregate history remains.`);
  }
  console.log(JSON.stringify({ organization: result.keep, primary: result.primary, timescale: result.timescale, tinybird: result.tinybird, redisInspected: result.redis.inspectedKeys, preservedUserAccounts: retained }, null, 2));
}

async function main() {
  // This archived implementation inventories/deletes tunnel history in
  // Timescale and would miss the new Tinybird tunnel datasources. Fail before
  // loading environment files or connecting to any store, for every mode.
  // Keep the pure exported policy/projection helpers for existing tests.
  throw new Error("Legacy development reset is disabled after the tunnel Tinybird migration. Its backup and deletion plan does not include the new tunnel datasources. Adapt and verify the complete cross-store backup/reset plan before running a reset; no stores were opened.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(`Development operation failed: ${error.code || error.message || error.name}. Credentials are not printed.`); process.exitCode = 1; });
}
