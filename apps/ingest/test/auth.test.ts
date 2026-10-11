import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { authenticateApiToken } from "../src/auth.js";

interface FakeToken {
  id: string;
  organization_id: string;
  plan: string | null;
  scopes?: string[];
  revoked_at?: Date | null;
  expires_at?: Date | null;
}

function fakeDatabase(input: { machine?: FakeToken; legacy?: FakeToken }) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const database = {
    async query(sql: string, values: unknown[] = []) {
      calls.push({ sql, values });
      if (sql.includes("FROM secrets_machine_tokens")) {
        return { rows: input.machine ? [input.machine] : [] };
      }
      if (sql.includes("FROM auth_tokens")) {
        return { rows: input.legacy ? [input.legacy] : [] };
      }
      return { rows: [] };
    },
  };
  return {
    calls,
    database: database as unknown as Parameters<typeof authenticateApiToken>[0],
  };
}

const activeMachine: FakeToken = {
  id: "machine_1",
  organization_id: "org_1",
  plan: "beam",
  scopes: ["observability:write"],
  revoked_at: null,
  expires_at: new Date("2999-01-01T00:00:00.000Z"),
};

test("authenticates active hashed machine tokens with observability scope", async () => {
  const { database, calls } = fakeDatabase({ machine: activeMachine });
  const result = await authenticateApiToken(database, "outray_machine_token");

  assert.deepEqual(result, {
    organizationId: "org_1",
    retentionDays: 30,
    telemetryBytesPerMonth: 20 * 1024 ** 3,
    tokenId: "machine_1",
  });
  assert.equal(
    calls[0]?.values[0],
    createHash("sha256").update("outray_machine_token").digest("hex"),
  );
  assert.equal(
    calls.some((call) => call.sql.includes("UPDATE secrets_machine_tokens")),
    true,
  );
});

test("disabled Observability rejects standalone ingestion credentials before any database call", async () => {
  const previous = process.env.OUTRAY_PRODUCTS;
  process.env.OUTRAY_PRODUCTS = "tunnels,secrets,uptime";
  try {
    const { database, calls } = fakeDatabase({ machine: activeMachine });
    assert.equal(
      await authenticateApiToken(database, "outray_machine_token"),
      null,
    );
    assert.equal(calls.length, 0);
  } finally {
    if (previous === undefined) delete process.env.OUTRAY_PRODUCTS;
    else process.env.OUTRAY_PRODUCTS = previous;
  }
});

test("self-hosted ingestion uses installation retention instead of the stored hosted subscription", async () => {
  const previousMode = process.env.OUTRAY_DEPLOYMENT_MODE;
  const previousRetention = process.env.OUTRAY_RETENTION_DAYS;
  process.env.OUTRAY_DEPLOYMENT_MODE = "self-hosted";
  process.env.OUTRAY_RETENTION_DAYS = "21";
  try {
    const { database } = fakeDatabase({
      machine: { ...activeMachine, plan: "free" },
    });
    assert.equal(
      (await authenticateApiToken(database, "outray_machine_token"))
        ?.retentionDays,
      21,
    );
  } finally {
    if (previousMode === undefined) delete process.env.OUTRAY_DEPLOYMENT_MODE;
    else process.env.OUTRAY_DEPLOYMENT_MODE = previousMode;
    if (previousRetention === undefined)
      delete process.env.OUTRAY_RETENTION_DAYS;
    else process.env.OUTRAY_RETENTION_DAYS = previousRetention;
  }
});

test("fails closed for revoked or expired hashed tokens", async () => {
  for (const machine of [
    { ...activeMachine, revoked_at: new Date() },
    { ...activeMachine, expires_at: new Date("2000-01-01T00:00:00.000Z") },
  ]) {
    const { database, calls } = fakeDatabase({
      machine,
      legacy: { ...activeMachine, id: "legacy_1" },
    });
    assert.equal(
      await authenticateApiToken(database, "outray_revoked_token"),
      null,
    );
    assert.equal(
      calls.some((call) => call.sql.includes("FROM auth_tokens")),
      false,
    );
  }
});

test("does not grant ingest to a new machine token without the scope", async () => {
  const { database } = fakeDatabase({
    machine: { ...activeMachine, scopes: ["tunnel:connect"] },
  });
  assert.equal(
    await authenticateApiToken(database, "outray_tunnel_only"),
    null,
  );
});

test("keeps legacy ingest credentials working during migration", async () => {
  const legacy = {
    id: "legacy_1",
    organization_id: "org_legacy",
    plan: "ray",
  };
  const { database, calls } = fakeDatabase({
    machine: { ...activeMachine, scopes: ["tunnel:connect"] },
    legacy,
  });

  assert.deepEqual(
    await authenticateApiToken(database, "outray_legacy_token"),
    {
      organizationId: "org_legacy",
      retentionDays: 14,
      telemetryBytesPerMonth: 5 * 1024 ** 3,
      tokenId: "legacy_1",
    },
  );
  assert.equal(
    calls.some((call) => call.sql.includes("UPDATE auth_tokens")),
    true,
  );
});

test("rejects malformed credentials without querying the database", async () => {
  const { database, calls } = fakeDatabase({});
  assert.equal(
    await authenticateApiToken(database, "not-an-outray-token"),
    null,
  );
  assert.equal(calls.length, 0);
});

test("ingest authentication derives monthly telemetry and retention from the shared hosted plan", async () => {
  const cases = [
    ["free", 1, 3],
    ["ray", 5, 14],
    ["beam", 20, 30],
    ["pulse", 100, 90],
    ["unlimited", -1, 90],
    ["unknown", 1, 3],
  ] as const;
  for (const [plan, gib, retentionDays] of cases) {
    const { database } = fakeDatabase({ machine: { ...activeMachine, plan } });
    const context = await authenticateApiToken(database, "outray_test", {
      environment: { OUTRAY_DEPLOYMENT_MODE: "hosted" },
    });
    assert.equal(
      context?.telemetryBytesPerMonth,
      gib === -1 ? -1 : gib * 1024 ** 3,
    );
    assert.equal(context?.retentionDays, retentionDays);
  }
});

test("self-hosted ingest honors instance-owned monthly bytes instead of hosted plans", async () => {
  const { database } = fakeDatabase({
    machine: { ...activeMachine, plan: "free" },
  });
  const context = await authenticateApiToken(database, "outray_test", {
    environment: {
      OUTRAY_DEPLOYMENT_MODE: "self-hosted",
      OUTRAY_TELEMETRY_BYTES_PER_MONTH: "123456",
      OUTRAY_RETENTION_DAYS: "60",
    },
  });
  assert.equal(context?.telemetryBytesPerMonth, 123456);
  assert.equal(context?.retentionDays, 60);
  const defaultContext = await authenticateApiToken(database, "outray_test", {
    environment: { OUTRAY_DEPLOYMENT_MODE: "self-hosted" },
  });
  assert.equal(defaultContext?.telemetryBytesPerMonth, 1024 ** 5);
});

test("explicit Worker policy is isolated from process environment and other requests", async () => {
  const { database } = fakeDatabase({ machine: activeMachine });
  const tasks: Promise<unknown>[] = [];
  const hosted = await authenticateApiToken(database, "outray_worker_token", {
    environment: { OUTRAY_DEPLOYMENT_MODE: "hosted" },
    backgroundTask: (task) => tasks.push(task),
  });
  const selfHosted = await authenticateApiToken(
    database,
    "outray_worker_token",
    {
      environment: {
        OUTRAY_DEPLOYMENT_MODE: "self-hosted",
        OUTRAY_RETENTION_DAYS: "7",
      },
      backgroundTask: (task) => tasks.push(task),
    },
  );
  assert.equal(hosted?.retentionDays, 30);
  assert.equal(selfHosted?.retentionDays, 7);
  assert.equal(tasks.length, 2);
  await Promise.all(tasks);
  const disabled = fakeDatabase({ machine: activeMachine });
  assert.equal(
    await authenticateApiToken(disabled.database, "outray_worker_token", {
      environment: { OUTRAY_PRODUCTS: "tunnels,secrets,uptime" },
    }),
    null,
  );
  assert.equal(disabled.calls.length, 0);
});
