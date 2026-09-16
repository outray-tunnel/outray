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

function fakeDatabase(input: {
  machine?: FakeToken;
  legacy?: FakeToken;
}) {
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
    database:
      database as unknown as Parameters<typeof authenticateApiToken>[0],
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
  assert.equal(await authenticateApiToken(database, "not-an-outray-token"), null);
  assert.equal(calls.length, 0);
});
