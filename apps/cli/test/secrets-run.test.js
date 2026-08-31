const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildChildEnvironment,
  diffSecretSnapshots,
  isTerminalWatchError,
  recordWatchFailure,
  recordWatchSuccess,
  runWithSecretsOnce,
  runWithSecretsWatch,
} = require("../dist/secrets-run.js");
const { SecretsApiError } = require("../dist/secrets-api.js");

test("remote values win, removed keys stay removed, and CLI credentials are stripped", () => {
  const environment = buildChildEnvironment(
    {
      KEEP: "local",
      SHARED: "local",
      REMOVED: "local-fallback",
      OUTRAY_TOKEN: "credential",
      OUTRAY_API_KEY: "compat-credential",
    },
    { SHARED: "remote", NEW: "remote" },
    ["SHARED", "NEW", "REMOVED"],
  );
  assert.deepEqual(environment, {
    KEEP: "local",
    SHARED: "remote",
    NEW: "remote",
  });
});

test("diffs added, updated, and removed keys deterministically", () => {
  assert.deepEqual(
    diffSecretSnapshots(
      new Map([
        ["A", 1],
        ["C", 1],
      ]),
      new Map([
        ["A", 2],
        ["B", 1],
      ]),
    ),
    { added: ["B"], updated: ["A"], removed: ["C"] },
  );
});

test("runs a child with remote secrets and no OutRay credential", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "outray-secret-run-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, "child.json");
  let listOptions;
  const api = {
    async list(_target, options) {
      listOptions = options;
      return {
        organization: {},
        project: {},
        environment: {},
        secrets: [
          { id: "1", key: "SHARED", value: "remote", version: 1, updatedAt: "now" },
        ],
      };
    },
  };
  const script = `require('fs').writeFileSync(process.argv[1], JSON.stringify({shared:process.env.SHARED,token:process.env.OUTRAY_TOKEN,key:process.env.OUTRAY_API_KEY}))`;
  const code = await runWithSecretsOnce({
    api,
    target: { organization: "acme", project: "api", environment: "dev" },
    command: [process.execPath, "-e", script, output],
    baseEnvironment: {
      PATH: process.env.PATH,
      SHARED: "local",
      OUTRAY_TOKEN: "credential",
      OUTRAY_API_KEY: "compat",
    },
    confirmProduction: true,
  });
  assert.equal(code, 0);
  assert.deepEqual(listOptions, {
    values: true,
    confirmProduction: true,
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), {
    shared: "remote",
  });
});

test("watch warns on the third transient failure and announces recovery", () => {
  const health = { consecutiveFailures: 0, warningShown: false };
  assert.equal(recordWatchFailure(health), false);
  assert.equal(recordWatchFailure(health), false);
  assert.equal(recordWatchFailure(health), true);
  assert.deepEqual(health, { consecutiveFailures: 3, warningShown: true });
  assert.equal(recordWatchFailure(health), false);
  assert.equal(recordWatchSuccess(health), true);
  assert.deepEqual(health, { consecutiveFailures: 0, warningShown: false });
  assert.equal(recordWatchSuccess(health), false);
});

test("watch treats expired or unauthorized access as terminal", () => {
  assert.equal(isTerminalWatchError(new SecretsApiError("unauthorized", 401)), true);
  assert.equal(isTerminalWatchError(new SecretsApiError("forbidden", 403)), true);
  assert.equal(isTerminalWatchError(new SecretsApiError("deleted", 404)), true);
  assert.equal(isTerminalWatchError(new SecretsApiError("gone", 410)), true);
  assert.equal(
    isTerminalWatchError(
      new SecretsApiError(
        "production confirmation required",
        409,
        "PRODUCTION_CONFIRMATION_REQUIRED",
      ),
    ),
    true,
  );
  assert.equal(isTerminalWatchError(new SecretsApiError("conflict", 409)), false);
  assert.equal(isTerminalWatchError(new SecretsApiError("offline", 503)), false);
  assert.equal(isTerminalWatchError(new Error("offline")), false);
});

test("watch stops its child when authorization is lost", async () => {
  let revisionCalls = 0;
  const revisionOptions = [];
  const api = {
    async revision(_target, options) {
      revisionOptions.push(options);
      revisionCalls++;
      if (revisionCalls === 1) {
        return { revision: "1", count: 1, updatedAt: "now" };
      }
      throw new SecretsApiError("expired", 401);
    },
    async list() {
      return {
        organization: {}, project: {}, environment: {},
        secrets: [
          { id: "1", key: "API_KEY", value: "secret", version: 1, updatedAt: "now" },
        ],
      };
    },
  };
  let stderr = "";
  const code = await Promise.race([
    runWithSecretsWatch({
      api,
      target: { organization: "acme", project: "api", environment: "prod" },
      command: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
      baseEnvironment: { PATH: process.env.PATH },
      pollIntervalMs: 1_000,
      confirmProduction: true,
      stderr: { write(chunk) { stderr += String(chunk); return true; } },
    }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("watch did not stop")), 4_000).unref();
    }),
  ]);
  assert.equal(code, 1);
  assert.match(stderr, /access ended \(401\); stopping command/);
  assert.deepEqual(revisionOptions, [
    { confirmProduction: true },
    { confirmProduction: true },
  ]);
});
