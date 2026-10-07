import assert from "node:assert/strict";
import test from "node:test";
import {
  auditActionLabel, auditActorDetail, auditActorLabel, auditCategory, auditLocation,
  auditMetadataRows, auditResourceLabel, auditResourceName, auditVaultOptions,
  filterAuditEvents, groupAuditEvents, mergeAuditPages,
} from "../src/components/secrets/audit-data";
import type { SecretAuditEvent, SecretAuditPage } from "../src/lib/secrets-client";

type AuditEvent = SecretAuditEvent;
function event(id: string, overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id, action: "secret.revealed", resourceType: "secret", targetType: "secret", resourceName: "DATABASE_URL",
    actorType: "user", actorName: "Ada Example", actorEmail: "ada@example.invalid", actorId: "user-ada",
    projectId: "vault-payments", projectSlug: "payments", projectName: "Payments",
    environmentId: "env-production", environmentSlug: "production", environmentName: "Production",
    createdAt: "2026-10-07T08:00:00Z", metadata: { version: 3, current: true }, ...overrides,
  };
}
const filters = { search: "", resource: "all", actor: "all", vault: "all" };

test("audit actions are readable without leaking internal project vocabulary", () => {
  assert.equal(auditActionLabel("project.created"), "Vault created");
  assert.match(auditActionLabel("project.deleted"), /^Vault deleted$/);
  assert.match(auditActionLabel("secret.rolled_back"), /Secret (?:rolled back|version restored)/i);
  assert.match(auditActionLabel("machine_token.created"), /Machine token created/i);
  assert.match(auditActionLabel("secrets.bulk_moved"), /Secrets.*moved/i);
  assert.match(auditActionLabel("organization_key.rewrapped"), /(?:Organization|Workspace) key rewrapped/i);
  assert.doesNotMatch(auditActionLabel("project.updated"), /project|[._]/i);
});

test("action categories separate plaintext access, changes, deletion and security administration", () => {
  for (const action of ["secret.revealed", "secret.copied", "secrets.exported", "secrets.runtime_read", "share.snapshot_revealed"]) assert.equal(auditCategory(action), "access", action);
  for (const action of ["project.created", "environment.updated", "secret.updated", "secret.rolled_back", "secrets.imported", "secrets.bulk_moved", "bulk.restored"]) assert.equal(auditCategory(action), "change", action);
  for (const action of ["project.deleted", "environment.purged", "secret.deleted", "secrets.bulk_deleted"]) assert.equal(auditCategory(action), "delete", action);
  for (const action of ["machine_token.created", "machine_token.revoked", "organization_key.rotated", "organization_key.rewrapped"]) assert.equal(auditCategory(action), "security", action);
});

test("resource classification trusts preserved target type rather than legacy collapsed secret types", () => {
  assert.equal(auditResourceLabel(event("vault", { targetType: "project", resourceType: "secret" })), "Vault");
  assert.equal(auditResourceLabel(event("environment", { targetType: "environment", resourceType: "secret" })), "Environment");
  assert.match(auditResourceLabel(event("bulk", { targetType: "bulk" })), /batch/i);
  assert.match(auditResourceLabel(event("share", { targetType: "share" })), /^Share$/i);
  assert.match(auditResourceLabel(event("token", { targetType: "machine_token" })), /machine token/i);
  assert.match(auditResourceLabel(event("key", { targetType: "organization_key" })), /(?:organization|workspace) key/i);
  assert.equal(auditResourceLabel(event("legacy-vault", { targetType: undefined, resourceType: "project" })), "Vault");
});

test("resource names fall back to their true kind when records no longer have names", () => {
  assert.equal(auditResourceName(event("named")), "DATABASE_URL");
  assert.match(auditResourceName(event("missing", { targetType: "share", resourceName: null })), /share/i);
  assert.match(auditResourceName(event("token", { targetType: "machine_token", resourceName: null })), /token/i);
  assert.doesNotMatch(auditResourceName(event("missing", { resourceName: null, resourceId: "private-target-id" })), /private-target-id/);
});

test("actor labels preserve human names, machine-token identity and system distinctions", () => {
  assert.equal(auditActorLabel(event("person")), "Ada Example");
  assert.equal(auditActorLabel(event("email", { actorName: null })), "ada@example.invalid");
  assert.match(auditActorLabel(event("token", { actorType: "machine", actorName: "Deploy token", actorEmail: null })), /Deploy token/);
  assert.match(auditActorLabel(event("unnamed-machine", { actorType: "machine", actorName: null, actorEmail: null, metadata: { machineTokenPrefix: "or_machine_prefix" } })), /machine|or_machine_prefix/i);
  assert.match(auditActorLabel(event("system", { actorType: "system", actorName: null, actorEmail: null })), /^System$/);
  assert.match(auditActorDetail(event("cli", { actorCredential: "cli" })) ?? "", /CLI/i);
  assert.match(auditActorDetail(event("machine", { actorType: "machine", actorCredential: "machine", actorName: "Deploy token", actorEmail: null })) ?? "", /machine|token/i);
});

test("locations use recognizable labels and retain a useful fallback for unavailable resources", () => {
  assert.match(auditLocation(event("normal")), /Payments.*Production/);
  assert.match(auditLocation(event("slugs", { projectName: null, environmentName: null })), /payments.*production/);
  const unknown = auditLocation(event("unknown", { projectId: null, projectSlug: null, projectName: null, environmentId: null, environmentSlug: null, environmentName: null }));
  assert.equal(typeof unknown, "string"); assert.ok(unknown.length > 0);
});

test("metadata rows render only supported typed scalar facts, never arbitrary nested or secret-bearing fields", () => {
  const data = event("metadata", { metadata: {
    version: 3, sourceVersion: 1, count: 2, isProduction: false, current: false,
    valueChanged: true, descriptionChanged: false, renamed: false,
    value: "never-render-this-value", oldValue: "never-render-this-old-value", token: "never-render-this-token",
    ciphertext: "never-render-this-ciphertext", iv: "never-render-this-iv", authTag: "never-render-this-tag",
    envText: "never-render-this-env", shareKey: "never-render-this-key", arbitrary: { value: "nested-secret" },
  } });
  const rows = auditMetadataRows(data);
  assert.ok(rows.length > 0);
  for (const row of rows) { assert.equal(typeof row.label, "string"); assert.equal(typeof row.value, "string"); }
  const text = JSON.stringify(rows);
  assert.doesNotMatch(text, /never-render-this|nested-secret|ciphertext|authTag|envText|shareKey/);
  assert.match(text, /Version/i); assert.match(text, /Production/i);
  assert.ok(rows.some((row) => /production/i.test(row.label) && /^(?:no|false)$/i.test(row.value)));
  const production = auditMetadataRows(event("production", { metadata: { isProduction: true } }));
  assert.ok(production.some((row) => /production/i.test(row.label) && /^(?:yes|true|production)$/i.test(row.value)));
});

test("metadata does not coerce strings into booleans or permit invalid numeric counts", () => {
  const rows = auditMetadataRows(event("malformed", { metadata: {
    isProduction: "true", current: "false", version: "2", count: -1, moved: 2.5,
    skipped: Number.NaN, revision: Number.POSITIVE_INFINITY, valueChanged: { enabled: true },
  } }));
  assert.deepEqual(rows, []);
  assert.deepEqual(auditMetadataRows(event("missing", { metadata: null })), []);
});

test("vault options prefer stable IDs and deduplicate aliases without dropping distinct same-named vaults", () => {
  const records = [
    event("first"), event("second", { projectName: "Renamed Payments" }),
    event("other", { projectId: "vault-other", projectSlug: "other", projectName: "Payments" }),
    event("slug", { projectId: null, projectSlug: "legacy", projectName: "Legacy" }),
    event("name", { projectId: null, projectSlug: null, projectName: "Name only" }),
    event("none", { projectId: null, projectSlug: null, projectName: null }),
  ];
  const options = auditVaultOptions(records);
  const values = options.map(({ value }) => value);
  assert.equal(values.filter((value) => value === "vault-payments").length, 1);
  for (const expected of ["vault-payments", "vault-other", "legacy", "Name only"]) assert.ok(values.includes(expected));
  assert.equal(values.includes(""), false);
});

test("search matches friendly labels, raw actions, recognized actors and recorded context case-insensitively", () => {
  const records = [event("reveal"), event("vault", { action: "project.created", targetType: "project", resourceName: "Orders", projectName: "Orders", projectSlug: "orders", projectId: "vault-orders", actorName: "Grace", actorEmail: "grace@example.invalid", actorId: "user-grace", environmentId: "env-development", environmentName: "Development", environmentSlug: "development" })];
  for (const search of [" DATABASE_URL ", "Ada Example", "ada@example.invalid", "secret.revealed", "secret revealed", "Payments", "production", "vault-payments"]) {
    assert.deepEqual(filterAuditEvents(records, { ...filters, search }).map(({ id }) => id), ["reveal"], search);
  }
  assert.deepEqual(filterAuditEvents(records, { ...filters, search: "vault created" }).map(({ id }) => id), ["vault"]);
  assert.deepEqual(filterAuditEvents(records, { ...filters, search: "no match" }), []);
});

test("resource, actor and stable-vault filters combine and never mutate server ordering", () => {
  const records = [
    event("person"), event("machine", { actorType: "machine", actorName: "Deployer", actorEmail: null }),
    event("bulk", { targetType: "bulk", actorType: "system", actorName: null, actorEmail: null }),
    event("share", { targetType: "share", resourceName: "Shared secrets" }),
    event("vault", { targetType: "project", resourceType: "project", resourceName: "Orders", projectId: "vault-orders", projectSlug: "orders", projectName: "Orders" }),
  ];
  const before = JSON.stringify(records); records.forEach(Object.freeze); Object.freeze(records);
  assert.deepEqual(filterAuditEvents(records, filters).map(({ id }) => id), records.map(({ id }) => id));
  assert.deepEqual(filterAuditEvents(records, { ...filters, actor: "machine" }).map(({ id }) => id), ["machine"]);
  assert.deepEqual(filterAuditEvents(records, { ...filters, resource: "share" }).map(({ id }) => id), ["share"]);
  assert.deepEqual(filterAuditEvents(records, { ...filters, resource: "bulk" }).map(({ id }) => id), ["bulk"]);
  assert.deepEqual(filterAuditEvents(records, { ...filters, resource: "project", vault: "vault-orders" }).map(({ id }) => id), ["vault"]);
  assert.deepEqual(filterAuditEvents(records, { ...filters, actor: "machine", vault: "vault-orders" }), []);
  assert.equal(JSON.stringify(records), before);
});

test("search does not inspect unsupported plaintext, nested metadata or private transport fields", () => {
  const records = [event("safe", { metadata: {
    value: "never-search-this-value", token: "never-search-this-token", url: "https://example.invalid/#fragment-key",
    arbitrary: { displayName: "never-search-this-nested-name" },
  } })];
  for (const search of ["never-search-this", "fragment-key", "example.invalid/#", "nested-name"]) {
    assert.deepEqual(filterAuditEvents(records, { ...filters, search }), [], search);
  }
});

test("merging pages deduplicates immutable event IDs without sorting or changing source pages", () => {
  const newest = event("newest"); const shared = event("shared"); const oldest = event("oldest");
  const pages: SecretAuditPage[] = [{ events: [newest, shared], nextCursor: "cursor" }, { events: [{ ...shared, resourceName: "replacement" }, oldest], nextCursor: null }];
  const before = JSON.stringify(pages); pages.forEach((page) => { Object.freeze(page.events); Object.freeze(page); }); Object.freeze(pages);
  const result = mergeAuditPages(pages);
  assert.deepEqual(result.map(({ id }) => id), ["newest", "shared", "oldest"]);
  assert.equal(result[0], newest); assert.equal(result[1], shared); assert.equal(result[2], oldest);
  assert.equal(JSON.stringify(pages), before); assert.deepEqual(mergeAuditPages([]), []);
});

test("timeline grouping uses local calendar days, not a rolling 24-hour yesterday window", () => {
  const now = new Date(2026, 9, 7, 0, 10);
  const today = event("today", { createdAt: new Date(2026, 9, 7, 0, 5).toISOString() });
  const yesterday = event("yesterday", { createdAt: new Date(2026, 9, 6, 23, 55).toISOString() });
  const older = event("older", { createdAt: new Date(2026, 9, 5, 12).toISOString() });
  const groups = groupAuditEvents([today, yesterday, older], now.getTime());
  assert.deepEqual(groups.map(({ label }) => label).slice(0, 2), ["Today", "Yesterday"]);
  assert.equal(groups.length, 3);
  assert.notEqual(groups[2].label, "Today"); assert.notEqual(groups[2].label, "Yesterday");
  assert.notEqual(groups[0].key, groups[1].key); assert.notEqual(groups[1].key, groups[2].key);
  assert.deepEqual(groups.map(({ events }) => events.map(({ id }) => id)), [["today"], ["yesterday"], ["older"]]);
});

test("day grouping preserves first-seen day order and event references without sorting or mutating input", () => {
  const now = new Date(2026, 9, 7, 14);
  const yesterday = event("first", { createdAt: new Date(2026, 9, 6, 12).toISOString() });
  const todayA = event("second", { createdAt: new Date(2026, 9, 7, 13).toISOString() });
  const todayB = event("third", { createdAt: new Date(2026, 9, 7, 11).toISOString() });
  const records = [yesterday, todayA, todayB];
  const before = JSON.stringify(records); records.forEach(Object.freeze); Object.freeze(records);
  const groups = groupAuditEvents(records, now.getTime());
  assert.deepEqual(groups.map(({ label }) => label), ["Yesterday", "Today"]);
  assert.equal(groups[0].events[0], yesterday); assert.equal(groups[1].events[0], todayA); assert.equal(groups[1].events[1], todayB);
  assert.equal(JSON.stringify(records), before); assert.deepEqual(groupAuditEvents([], now.getTime()), []);
});

test("invalid timestamps get a distinct Not recorded section instead of Today or a fake epoch date", () => {
  const records = [event("valid"), event("invalid", { createdAt: "not-a-date" }), event("blank", { createdAt: "" })];
  const groups = groupAuditEvents(records, new Date(2026, 9, 7, 14).getTime());
  const invalid = groups.find(({ label }) => label === "Not recorded");
  assert.ok(invalid); assert.deepEqual(invalid.events.map(({ id }) => id), ["invalid", "blank"]);
  assert.equal(new Set(groups.map(({ key }) => key)).size, groups.length);
  assert.doesNotMatch(invalid.label, /1970|Invalid Date|Today|Yesterday/);
});

test("equivalent instants with different timezone offsets stay together in the same local day", () => {
  const sameInstant = new Date(2026, 9, 7, 12).getTime();
  const utc = new Date(sameInstant).toISOString();
  const equivalent = `${new Date(sameInstant - 5 * 60 * 60 * 1000).toISOString().slice(0, -1)}-05:00`;
  assert.equal(Date.parse(utc), Date.parse(equivalent));
  const groups = groupAuditEvents([event("utc", { createdAt: utc }), event("offset", { createdAt: equivalent })], sameInstant);
  assert.equal(groups.length, 1); assert.equal(groups[0].label, "Today");
  assert.deepEqual(groups[0].events.map(({ id }) => id), ["utc", "offset"]);
});
