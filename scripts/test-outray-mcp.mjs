import pg from "pg";
import { readFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer, createConnection } from "node:net";
import { parse } from "dotenv";
import { tsImport } from "tsx/esm/api";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const development = parse(await readFile(join(root, ".env")));
const source = new URL(process.env.MCP_TEST_ADMIN_DATABASE_URL || development.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(source.hostname)) throw new Error("MCP integration tests require a local PostgreSQL administrator connection");
const name = `outray_mcp_test_${crypto.randomUUID().replaceAll("-", "")}`;
const admin = new pg.Client({ connectionString: source.toString() });
const target = new URL(source); target.pathname = `/${name}`;
const directory = await mkdtemp(join(tmpdir(), "outray-mcp-redis-"));
const testBundle = join(root, "apps/web/node_modules/.tmp", `${name}.mjs`);
let databaseCreated = false;
let redis;
let connection;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`); databaseCreated = true;
  connection = new pg.Client({ connectionString: target.toString() });
  await connection.connect();
  // Historical migrations predate the complete blank-database baseline. Build
  // the current pre-MCP schema, then exercise the actual additive MCP migration.
  const schema = await tsImport(join(root, "apps/web/src/db/schema.ts"), import.meta.url);
  const baseline = Object.fromEntries(Object.entries(schema).filter(([key]) => !key.startsWith("oauth") && !["jwks", "mcpConnections", "mcpActivity"].includes(key)));
  const empty = generateDrizzleJson({});
  for (const sql of await generateMigration(empty, generateDrizzleJson(baseline))) await connection.query(sql);
  for (const file of ["0042_outray_mcp.sql", "0043_mcp_secret_audit_actor.sql"]) {
    const migration = await readFile(join(root, "apps/web/drizzle", file), "utf8");
    for (const sql of migration.split("--> statement-breakpoint")) if (sql.trim()) await connection.query(sql);
  }
  await connection.end(); connection = undefined;
  const socket = createServer();
  await new Promise((done, fail) => { socket.once("error", fail); socket.listen(0, "127.0.0.1", done); });
  const port = socket.address().port;
  await new Promise((done) => socket.close(done));
  redis = spawn("redis-server", ["--bind", "127.0.0.1", "--port", String(port), "--save", "", "--appendonly", "no", "--dir", directory], { stdio: "ignore" });
  redis.on("error", () => {});
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    ready = await new Promise((done) => {
      const client = createConnection({ host: "127.0.0.1", port });
      client.once("connect", () => { client.destroy(); done(true); });
      client.once("error", () => done(false));
    });
    if (ready) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!ready) throw new Error("Disposable Redis could not start");
  console.log("Testing MCP against a disposable PostgreSQL database and Redis process.");
  await mkdir(dirname(testBundle), { recursive: true });
  // Match the application's bundled Node runtime for cross-workspace TS imports.
  await build({ entryPoints: [join(root, "apps/web/test/mcp-database.integration.test.ts")], outfile: testBundle,
    bundle: true, platform: "node", format: "esm", target: "node22", packages: "external",
    tsconfig: join(root, "apps/web/tsconfig.app.json"), loader: { ".css": "empty" }, logLevel: "silent" });
  const child = spawn(process.execPath, ["--test", "--test-timeout=120000", testBundle], {
    cwd: join(root, "apps/web"), stdio: "inherit", env: {
      ...process.env, DATABASE_URL: target.toString(), MCP_TEST_DATABASE_URL: target.toString(),
      MCP_TEST_PRODUCTION: process.argv.includes("--production") ? "1" : "0",
      REDIS_URL: `redis://127.0.0.1:${port}`, NODE_ENV: "test", TSX_TSCONFIG_PATH: join(root, "apps/web/tsconfig.app.json"),
      BETTER_AUTH_SECRET: "outray-integration-test-only-8b1d0e3264f5a970", ZEPTO_API_KEY: "test-only",
      OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID: "test-key", OUTRAY_SECRETS_ACTIVE_MASTER_KEY: Buffer.alloc(32, 71).toString("base64"),
      GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "",
    },
  });
  process.exitCode = await new Promise((done) => { child.once("exit", (code) => done(code ?? 1)); child.once("error", () => done(1)); });
} finally {
  if (connection) await connection.end().catch(() => {});
  if (redis) { redis.kill("SIGTERM"); await new Promise((done) => { if (redis.exitCode !== null) done(); else { redis.once("exit", done); setTimeout(done, 2000).unref(); } }); }
  if (databaseCreated) { await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [name]); await admin.query(`DROP DATABASE "${name}"`); }
  await admin.end(); await rm(directory, { recursive: true, force: true }); await rm(testBundle, { force: true });
}
