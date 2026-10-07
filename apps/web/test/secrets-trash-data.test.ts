import assert from "node:assert/strict";
import test from "node:test";
import {
  filterTrash,
  trashCountLabel,
  trashKind,
  trashLocation,
  trashRestoreDescription,
} from "../src/components/secrets/trash-data";
import type { SecretTrashItem } from "../src/lib/secrets-client";

function item(id: string, overrides: Partial<SecretTrashItem> = {}): SecretTrashItem {
  return {
    id,
    batchId: `batch-${id}`,
    type: "secret",
    name: "DATABASE_URL",
    itemCount: 1,
    isProduction: false,
    deletedAt: "2026-10-06T09:00:00Z",
    expiresAt: "2026-11-06T09:00:00Z",
    metadata: { projectSlug: "payments", environmentSlug: "development" },
    ...overrides,
  };
}

test("Trash kinds distinguish vaults, environments, individual secrets, deletion batches, and moves", () => {
  assert.equal(trashKind(item("vault", { type: "project" })), "Vault");
  assert.equal(trashKind(item("environment", { type: "environment" })), "Environment");
  assert.equal(trashKind(item("secret")), "Secret");
  assert.equal(trashKind(item("delete", { type: "bulk", metadata: { reason: "delete" } })), "Secret batch");
  assert.equal(trashKind(item("legacy", { type: "bulk", metadata: null })), "Secret batch");
  assert.equal(trashKind(item("move", { type: "bulk", metadata: { reason: "move" } })), "Moved secrets");
  assert.equal(trashKind(item("not-a-move", { type: "environment", metadata: { reason: "move" } })), "Environment");
});

test("locations use only recognized string slugs and avoid treating environment fallback slugs as vaults", () => {
  assert.equal(trashLocation(item("normal")), "payments / development");
  assert.equal(trashLocation(item("spaces", { metadata: { projectSlug: " payments ", environmentSlug: " production " } })), "payments / production");
  assert.equal(trashLocation(item("vault", { type: "project", metadata: { slug: "legacy-vault" } })), "legacy-vault");
  assert.equal(trashLocation(item("prefer-project", { type: "project", metadata: { projectSlug: "payments", slug: "legacy-vault" } })), "payments");
  assert.equal(trashLocation(item("environment", { type: "environment", metadata: { slug: "development" } })), null);
  assert.equal(trashLocation(item("invalid", { metadata: { projectSlug: { value: "payments" }, environmentSlug: 42, slug: "ignored", projectId: "not-a-location" } })), null);
  assert.equal(trashLocation(item("blank", { metadata: { projectSlug: " ", environmentSlug: "" } })), null);
  assert.equal(trashLocation(item("missing", { metadata: null })), null);
});

test("parent counts use stored subtree metadata instead of describing every item as a secret", () => {
  assert.equal(trashCountLabel(item("one-secret")), "1 secret");
  assert.equal(trashCountLabel(item("batch", { type: "bulk", itemCount: 4 })), "4 secrets");
  assert.equal(trashCountLabel(item("vault", { type: "project", itemCount: 8, metadata: { environments: 2, secrets: 5 } })), "2 environments · 5 secrets");
  assert.equal(trashCountLabel(item("environment", { type: "environment", itemCount: 6, metadata: { secrets: 5 } })), "5 secrets");
  assert.equal(trashCountLabel(item("empty-vault", { type: "project", itemCount: 1, metadata: { environments: 0, secrets: 0 } })), "0 environments · 0 secrets");
  assert.equal(trashCountLabel(item("singular", { type: "project", itemCount: 3, metadata: { environments: 1, secrets: 1 } })), "1 environment · 1 secret");
  assert.equal(trashCountLabel(item("legacy", { type: "project", itemCount: 8, metadata: null })), "8 items");
  assert.equal(trashCountLabel(item("invalid", { type: "environment", itemCount: 1, metadata: { secrets: "500" } })), "1 item");
  assert.equal(trashCountLabel(item("invalid-negative", { type: "project", itemCount: 2, metadata: { environments: -1, secrets: 1.5 } })), "2 items");
});

test("restore descriptions explain source-only move recovery and the restored contents", () => {
  const moved = trashRestoreDescription(item("move", { type: "bulk", metadata: { reason: "move" } }));
  assert.match(moved, /original source values/i);
  assert.match(moved, /destination values stay unchanged/i);
  assert.doesNotMatch(moved, /undo(?:es)? (?:the )?move|remove(?:s)? (?:the )?destination/i);
  assert.match(trashRestoreDescription(item("vault", { type: "project" })), /vault.*environments and secrets/i);
  assert.match(trashRestoreDescription(item("environment", { type: "environment" })), /environment and the secrets deleted with it/i);
  assert.match(trashRestoreDescription(item("secret")), /original environment/i);
  assert.match(trashRestoreDescription(item("delete", { type: "bulk", metadata: { reason: "delete" } })), /original environment/i);
});

test("search matches supported names, kind labels, and source slugs case-insensitively", () => {
  const items = [
    item("first"),
    item("vault", { type: "project", name: "Billing vault", metadata: { projectSlug: "billing" } }),
    item("environment", { type: "environment", name: "Production", metadata: { projectSlug: "billing", environmentSlug: "production" } }),
    item("move", { type: "bulk", name: "3 secrets from Staging", itemCount: 3, metadata: { reason: "move" } }),
  ];
  assert.deepEqual(filterTrash(items, " DATABASE_url ", "all").map(({ id }) => id), ["first"]);
  assert.deepEqual(filterTrash(items, "billing", "all").map(({ id }) => id), ["vault", "environment"]);
  assert.deepEqual(filterTrash(items, "PAYMENTS / DEVELOPMENT", "all").map(({ id }) => id), ["first"]);
  assert.deepEqual(filterTrash(items, "vault", "all").map(({ id }) => id), ["vault"]);
  assert.deepEqual(filterTrash(items, "moved secrets", "all").map(({ id }) => id), ["move"]);
  assert.deepEqual(filterTrash(items, "no-match", "all"), []);
});

test("type filters include individual and bulk secrets without mutating server ordering", () => {
  const items = [
    item("z-secret"),
    item("a-vault", { type: "project", name: "Payment vault" }),
    item("y-batch", { type: "bulk", name: "2 secrets from Development", itemCount: 2 }),
    item("b-environment", { type: "environment", name: "Production" }),
  ];
  const before = JSON.stringify(items);
  for (const row of items) {
    Object.freeze(row.metadata);
    Object.freeze(row);
  }
  Object.freeze(items);
  assert.deepEqual(filterTrash(items, "  ", "all").map(({ id }) => id), items.map(({ id }) => id));
  assert.deepEqual(filterTrash(items, "", "secrets").map(({ id }) => id), ["z-secret", "y-batch"]);
  assert.deepEqual(filterTrash(items, "", "vaults").map(({ id }) => id), ["a-vault"]);
  assert.deepEqual(filterTrash(items, "", "environments").map(({ id }) => id), ["b-environment"]);
  assert.deepEqual(filterTrash(items, "development", "vaults").map(({ id }) => id), ["a-vault"]);
  assert.deepEqual(filterTrash(items, "database", "vaults"), []);
  assert.equal(JSON.stringify(items), before);
});

test("Trash search never scans unknown plaintext, IDs, or arbitrary metadata fields", () => {
  const items = [item("metadata-only", {
    metadata: {
      projectSlug: "payments",
      environmentSlug: "development",
      value: "never-search-plaintext",
      url: "https://example.invalid/#fragment-key",
      projectId: "never-search-project-id",
      extraName: "unrecognized-label",
    },
  })];
  for (const query of ["never-search-plaintext", "fragment-key", "never-search-project-id", "unrecognized-label", "metadata-only", "batch-metadata-only"]) {
    assert.deepEqual(filterTrash(items, query, "all"), []);
  }
});
