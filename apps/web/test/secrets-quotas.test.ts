import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import hostedPolicy from "../../../shared/hosted-plan-limits";
import { assertSecretsQuotaGrowth, type SecretsQuotaLimits } from "../src/lib/secrets/quota-policy";
import { secretsErrorResponse } from "../src/lib/secrets/http";
import { SecretsError } from "../src/lib/secrets/types";

const { HOSTED_PLAN_LIMITS } = hostedPolicy;

const limits: SecretsQuotaLimits = {
  maxSecretVaults: 1, maxSecretEnvironments: 3, maxSecretEntries: 100,
};

test("each secret resource permits exact capacity and rejects further growth", () => {
  for (const plan of Object.values(HOSTED_PLAN_LIMITS)) {
    for (const key of Object.keys(limits) as (keyof SecretsQuotaLimits)[]) {
      const limit = plan[key];
      assert.doesNotThrow(() => assertSecretsQuotaGrowth(key, limit, limit - 1, 1));
      assert.throws(() => assertSecretsQuotaGrowth(key, limit, limit, 1), (error) => {
        assert.ok(error instanceof SecretsError);
        assert.equal(error.status, 403);
        assert.equal(error.code, "PLAN_LIMIT_REACHED");
        assert.deepEqual(error.details, { resource: key, limit, current: limit, added: 1 });
        return true;
      });
    }
  }
});

test("quota failures preserve a clear 403 API error and numerical capacity details", async () => {
  let thrown: unknown;
  try { assertSecretsQuotaGrowth("maxSecretEntries", 100, 99, 3); }
  catch (error) { thrown = error; }
  const response = secretsErrorResponse(thrown);
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.code, "PLAN_LIMIT_REACHED");
  assert.match(body.error, /100 active secret entries per organization/);
  assert.deepEqual(body.details, { resource: "maxSecretEntries", limit: 100, current: 99, added: 3 });
});

test("a downgrade does not block existing-data updates, net-zero moves, or deletion", () => {
  for (const added of [0, -1, -100]) {
    assert.doesNotThrow(() => assertSecretsQuotaGrowth("maxSecretEntries", 100, 500, added));
  }
  assert.throws(() => assertSecretsQuotaGrowth("maxSecretEntries", 100, 500, 1), SecretsError);
  assert.doesNotThrow(() => assertSecretsQuotaGrowth("maxSecretEntries", -1, 1_000_000, 10_000));
});

type Resource = "secretProjects" | "secretEnvironments" | "secretEntries";
type Row = { organizationId: string; projectId?: string; deletedAt: Date | null };
type Predicate = { kind: "and"; predicates: Predicate[] } |
  { kind: "eq"; column: string; value: unknown } | { kind: "isNull"; column: string };
type Growth = { vaults?: number; entries?: number; environments?: { projectId: string | null; added: number }[] };

async function capacityHarness(plan: SecretsQuotaLimits = limits) {
  const source = await readFile(new URL("../src/lib/secrets/quotas.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const rows: Record<Resource, Row[]> = { secretProjects: [], secretEnvironments: [], secretEntries: [] };
  const calls: string[] = [];
  let locked = false;
  const tables = Object.fromEntries(Object.keys(rows).map((table) => [table, {
    table, organizationId: "organizationId", projectId: "projectId", deletedAt: "deletedAt",
  }]));
  function matches(row: Row, predicate: Predicate): boolean {
    if (predicate.kind === "and") return predicate.predicates.every((item) => matches(row, item));
    if (predicate.kind === "isNull") return row[predicate.column as keyof Row] === null;
    return row[predicate.column as keyof Row] === predicate.value;
  }
  const tx = {
    select() {
      let resource: Resource;
      const query = {
        from(table: { table: Resource }) { resource = table.table; return query; },
        async where(predicate: Predicate) {
          assert.ok(locked, "resource counts must run while holding the organization lock");
          calls.push(`count:${resource}`);
          return [{ count: rows[resource].filter((row) => matches(row, predicate)).length }];
        },
      };
      return query;
    },
  };
  const module = { exports: {} as { assertSecretCapacity(tx: typeof tx, organizationId: string, growth: Growth): Promise<void> } };
  runInNewContext(compiled, { module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "drizzle-orm") return {
        and: (...predicates: Predicate[]) => ({ kind: "and", predicates }),
        count: () => "count",
        eq: (column: string, value: unknown) => ({ kind: "eq", column, value }),
        isNull: (column: string) => ({ kind: "isNull", column }),
      };
      if (specifier === "../../db/secrets-schema") return tables;
      if (specifier === "../organization-entitlements.server") return {
        async getOrganizationLimits(organizationId: string, database: unknown) {
          assert.equal(organizationId, "org-1");
          assert.equal(database, tx, "limits must be resolved through the mutation transaction");
          assert.ok(locked);
          calls.push("limits");
          return plan;
        },
      };
      if (specifier === "./quota-policy") return { assertSecretsQuotaGrowth };
      throw new Error(`Unexpected quota import ${specifier}`);
    },
  });
  let tail = Promise.resolve();
  async function transaction<T>(task: () => Promise<T>) {
    let unlock!: () => void;
    const previous = tail;
    tail = new Promise<void>((resolve) => { unlock = resolve; });
    await previous;
    locked = true;
    try { return await task(); } finally { locked = false; unlock(); }
  }
  return {
    rows, calls, transaction,
    assertCapacity: (growth: Growth) => module.exports.assertSecretCapacity(tx, "org-1", growth),
  };
}

test("counts are organization-wide active entries and per-vault active environments", async () => {
  const harness = await capacityHarness();
  harness.rows.secretEntries.push(...Array.from({ length: 99 }, () => ({ organizationId: "org-1", deletedAt: null })));
  harness.rows.secretEntries.push({ organizationId: "org-1", deletedAt: new Date() }, { organizationId: "other", deletedAt: null });
  harness.rows.secretEnvironments.push(...Array.from({ length: 2 }, () => ({ organizationId: "org-1", projectId: "vault-1", deletedAt: null })));
  harness.rows.secretEnvironments.push({ organizationId: "org-1", projectId: "vault-2", deletedAt: null });
  await harness.transaction(() => harness.assertCapacity({ entries: 1, environments: [{ projectId: "vault-1", added: 1 }] }));
  await assert.rejects(harness.transaction(() => harness.assertCapacity({ entries: 2 })), SecretsError);
  await assert.rejects(harness.transaction(() => harness.assertCapacity({ environments: [{ projectId: "vault-1", added: 2 }] })), SecretsError);
});

test("new vault default environments and restored vault capacity are checked together", async () => {
  const harness = await capacityHarness();
  await harness.transaction(() => harness.assertCapacity({ vaults: 1, environments: [{ projectId: null, added: 3 }] }));
  const tooSmall = await capacityHarness({ ...limits, maxSecretEnvironments: 2 });
  await assert.rejects(tooSmall.transaction(() => tooSmall.assertCapacity({ vaults: 1, environments: [{ projectId: null, added: 3 }] })), SecretsError);
  harness.rows.secretProjects.push({ organizationId: "org-1", deletedAt: null });
  await assert.rejects(harness.transaction(() => harness.assertCapacity({ vaults: 1, entries: 50, environments: [{ projectId: "restored-vault", added: 3 }] })), SecretsError);
});

test("unlimited capacity and zero-growth writes do not count or reject existing records", async () => {
  const harness = await capacityHarness({ maxSecretVaults: -1, maxSecretEnvironments: -1, maxSecretEntries: -1 });
  await harness.transaction(() => harness.assertCapacity({ entries: 100_000, vaults: 100, environments: [{ projectId: "vault-1", added: 100 }] }));
  assert.deepEqual(harness.calls, ["limits"]);
  harness.calls.length = 0;
  await harness.transaction(() => harness.assertCapacity({ entries: 0 }));
  assert.deepEqual(harness.calls, []);
});

test("serialized simultaneous growth requests cannot overshoot the final entry slot", async () => {
  const harness = await capacityHarness();
  harness.rows.secretEntries.push(...Array.from({ length: 99 }, () => ({ organizationId: "org-1", deletedAt: null })));
  const outcomes = await Promise.allSettled(Array.from({ length: 20 }, () => harness.transaction(async () => {
    await harness.assertCapacity({ entries: 1 });
    harness.rows.secretEntries.push({ organizationId: "org-1", deletedAt: null });
  })));
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(harness.rows.secretEntries.length, 100);
  // This is an offline lock model; production uses the PostgreSQL organization row lock.
});

test("all entry/container growth paths check quotas after their organization lock", async () => {
  const [projects, entries, governance, database, bulk] = await Promise.all([
    "projects", "entries", "governance", "database", "bulk",
  ].map((name) => readFile(new URL(`../src/lib/secrets/${name}.ts`, import.meta.url), "utf8")));
  assert.match(projects, /lockOrganization\(tx, access\.organization\.id\)[\s\S]*assertSecretCapacity\(tx, access\.organization\.id, \{[\s\S]*vaults: 1/);
  assert.match(projects, /environments: \[\{ projectId: project\.id, added: 1 \}\]/);
  assert.match(entries, /activeOrganizationKey\([\s\S]*assertSecretCapacity\(tx, access\.organization\.id, \{ entries: environments\.length \}\)/);
  assert.match(entries, /assertSecretCapacity\(tx, access\.organization\.id, \{ entries: createdKeys\.length \}\)/);
  assert.equal((governance.match(/await assertSecretCapacity\(/g) ?? []).length, 4, "vault, environment, bulk, and single-secret restores must be covered");
  assert.match(database, /async function activeOrganizationKey[\s\S]*await lockOrganization\(tx, organizationId\)/);
  assert.match(bulk, /async function moveSecretsBulk[\s\S]*activeOrganizationKey\(tx, access\.organization\.id\)/);
  assert.doesNotMatch(entries.slice(entries.indexOf("export async function revealSecret"), entries.indexOf("export async function listSecretVersions")), /assertSecretCapacity/);
  assert.doesNotMatch(entries.slice(entries.indexOf("export async function rollbackSecret"), entries.indexOf("export async function importSecrets")), /assertSecretCapacity/);
});
