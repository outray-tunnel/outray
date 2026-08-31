import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { withPlaintextSecretsErrors } from "../src/lib/secrets/http";
import type { SecretsActor } from "../src/lib/secrets/types";

const migrationPath = fileURLToPath(
  new URL("../drizzle/0013_secrets_vault.sql", import.meta.url),
);
const compatibilityTokenRoutePath = fileURLToPath(
  new URL("../src/routes/api/$orgSlug/auth-tokens.ts", import.meta.url),
);
const cliSecretsRoutePath = fileURLToPath(
  new URL("../src/routes/api/cli/secrets.ts", import.meta.url),
);
const cliRevisionRoutePath = fileURLToPath(
  new URL("../src/routes/api/cli/secrets/revision.ts", import.meta.url),
);
const rootRoutePath = fileURLToPath(
  new URL("../src/routes/__root.tsx", import.meta.url),
);
const secretsLayoutPath = fileURLToPath(
  new URL("../src/routes/$orgSlug/secrets.tsx", import.meta.url),
);
const createTokenModalPath = fileURLToPath(
  new URL("../src/components/create-token-modal.tsx", import.meta.url),
);
const secretsUiPath = fileURLToPath(
  new URL("../src/components/secrets/secrets-ui.tsx", import.meta.url),
);
const secretsProjectRoutePath = fileURLToPath(
  new URL(
    "../src/routes/$orgSlug/secrets/projects_.$projectSlug.tsx",
    import.meta.url,
  ),
);
const secretsTablePath = fileURLToPath(
  new URL("../src/components/secrets/secrets-table.tsx", import.meta.url),
);
const productSubSidebarPath = fileURLToPath(
  new URL("../src/components/product-sub-sidebar.tsx", import.meta.url),
);
const mobileBottomNavPath = fileURLToPath(
  new URL("../src/components/mobile-bottom-nav.tsx", import.meta.url),
);
const secretsOverviewRoutePath = fileURLToPath(
  new URL("../src/routes/$orgSlug/secrets/index.tsx", import.meta.url),
);
const secretsClientPath = fileURLToPath(
  new URL("../src/lib/secrets-client.ts", import.meta.url),
);
const routeTreePath = fileURLToPath(
  new URL("../src/routeTree.gen.ts", import.meta.url),
);

test("vault migration enforces active uniqueness and immutable encrypted versions", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /CREATE TABLE "secret_versions"/);
  assert.match(sql, /"ciphertext" text NOT NULL/);
  assert.match(sql, /"auth_tag" text NOT NULL/);
  assert.match(sql, /"value_digest" text NOT NULL/);
  assert.doesNotMatch(sql, /"plaintext"/i);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "secret_organization_keys_one_active_idx"[\s\S]*WHERE "secret_organization_keys"\."status" = 'active'/,
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "secret_entries_active_key_unique_idx"[\s\S]*WHERE "secret_entries"\."deleted_at" IS NULL/,
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "secret_versions_entry_version_unique_idx"/,
  );
});

test("vault migration preserves organization-owned tunnel registrations", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /ALTER COLUMN "user_id" DROP NOT NULL/);
  assert.match(sql, /"tunnels_user_id_users_id_fk"[\s\S]*ON DELETE set null/);
  assert.match(
    sql,
    /"secrets_machine_tokens_project_id_secret_projects_id_fk"[\s\S]*ON DELETE set null/,
  );
  assert.match(
    sql,
    /"secrets_machine_tokens_environment_id_secret_environments_id_fk"[\s\S]*ON DELETE set null/,
  );
});

test("plaintext responses are explicitly non-cacheable", async () => {
  const response = await withPlaintextSecretsErrors(async () =>
    Response.json({ value: "sensitive" }),
  );

  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("plaintext UI state is excluded from analytics and React Query caches", async () => {
  const [rootRoute, secretsLayout, createTokenModal] = await Promise.all([
    readFile(rootRoutePath, "utf8"),
    readFile(secretsLayoutPath, "utf8"),
    readFile(createTokenModalPath, "utf8"),
  ]);

  assert.match(secretsLayout, /ph-no-capture/);
  assert.match(rootRoute, /blockSelector:\s*["']\.ph-no-capture["']/);
  assert.match(rootRoute, /recordHeaders:\s*false/);
  assert.match(rootRoute, /recordBody:\s*false/);
  assert.match(rootRoute, /maskCapturedNetworkRequestFn:[\s\S]*\/secrets/);
  assert.doesNotMatch(createTokenModal, /useMutation/);
  assert.match(createTokenModal, /ph-no-capture/);
  assert.match(createTokenModal, /30_000/);
});

test("Secrets headers, primary actions, and environment cards follow the platform UI", async () => {
  const [secretsUi, projectRoute] = await Promise.all([
    readFile(secretsUiPath, "utf8"),
    readFile(secretsProjectRoutePath, "utf8"),
  ]);

  assert.doesNotMatch(secretsUi, /eyebrow\s*=\s*["']Secrets["']/);
  assert.match(secretsUi, /\{eyebrow && \(/);
  assert.match(
    secretsUi,
    /border-white bg-white text-black hover:border-zinc-200 hover:bg-zinc-200/,
  );
  assert.match(
    projectRoute,
    /aria-label=\{`Open \$\{environment\.name\} environment`\}/,
  );
  assert.match(projectRoute, /className="group block h-full rounded-2xl/);
  assert.match(
    projectRoute,
    /<\/Link>\s*<div className="absolute right-5 top-5 z-10">\s*<ActionMenu/,
  );
});

test("Trash is not exposed on the Secrets product surface", async () => {
  const [
    productSubSidebar,
    mobileBottomNav,
    overviewRoute,
    projectRoute,
    secretsTable,
    secretsClient,
    routeTree,
  ] = await Promise.all([
    readFile(productSubSidebarPath, "utf8"),
    readFile(mobileBottomNavPath, "utf8"),
    readFile(secretsOverviewRoutePath, "utf8"),
    readFile(secretsProjectRoutePath, "utf8"),
    readFile(secretsTablePath, "utf8"),
    readFile(secretsClientPath, "utf8"),
    readFile(routeTreePath, "utf8"),
  ]);
  const productSurface = [
    productSubSidebar,
    mobileBottomNav,
    overviewRoute,
    projectRoute,
    secretsTable,
    secretsClient,
  ].join("\n");

  assert.doesNotMatch(productSurface, /\bTrash\b|move(?:d)? to trash/i);
  assert.doesNotMatch(
    routeTree,
    /^import \{ Route as OrgSlugSecretsTrashRouteImport \}/m,
  );
  assert.match(projectRoute, /label: "Delete vault"/);
  assert.match(projectRoute, /label: "Delete environment"/);
  assert.match(secretsTable, /label: "Delete secret"/);
});

test("machine scopes never grant admin and respect project/environment bounds", async () => {
  const { assertActorScope, hasSecretsMetadataScope, hasSecretsScope } =
    await import("../src/lib/secrets/access-policy");
  const actor: SecretsActor = {
    type: "machine",
    credential: "machine",
    id: "token-1",
    tokenId: "token-1",
    userId: null,
    role: null,
    projectId: "project-1",
    environmentId: "environment-1",
    scopes: ["secrets:read"],
  };

  assert.equal(hasSecretsScope(actor.scopes, "secrets:read"), true);
  assert.equal(hasSecretsScope(actor.scopes, "secrets:reveal"), true);
  assert.equal(hasSecretsScope(actor.scopes, "secrets:admin"), false);
  assert.equal(hasSecretsMetadataScope(["secrets:read"]), true);
  assert.equal(hasSecretsMetadataScope(["secrets:write"]), true);
  assert.equal(hasSecretsMetadataScope(["secrets:delete"]), true);
  assert.equal(hasSecretsMetadataScope(["tunnel:connect"]), false);
  assert.equal(hasSecretsScope(["secrets:write"], "secrets:read"), false);
  assert.equal(hasSecretsScope(["secrets:delete"], "secrets:reveal"), false);
  assert.doesNotThrow(() =>
    assertActorScope(actor, {
      projectId: "project-1",
      environmentId: "environment-1",
    }),
  );
  assert.throws(
    () =>
      assertActorScope(actor, {
        projectId: "project-2",
        environmentId: "environment-1",
      }),
    /not scoped to this vault/,
  );
  assert.throws(
    () =>
      assertActorScope(actor, {
        projectId: "project-1",
        environmentId: "environment-2",
      }),
    /not scoped to this environment/,
  );
});

test("compatibility token creation locks and validates scoped targets in its insert transaction", async () => {
  const source = await readFile(compatibilityTokenRoutePath, "utf8");
  const postHandler = source.slice(
    source.indexOf("POST: async"),
    source.indexOf("DELETE: async"),
  );

  assert.ok(postHandler.indexOf("db.transaction") >= 0);
  assert.ok(
    postHandler.indexOf("lockOrganization(tx") >
      postHandler.indexOf("db.transaction"),
  );
  assert.ok(
    postHandler.indexOf('.for("share")') >
      postHandler.indexOf("lockOrganization(tx"),
  );
  assert.ok(
    postHandler.indexOf(".insert(machineTokens)") >
      postHandler.lastIndexOf('.for("share")'),
  );
  assert.doesNotMatch(
    postHandler,
    /db\.query\.secret(?:Projects|Environments)/,
  );
});

test("CLI metadata discovery is mutation-capable without broadening plaintext access", async () => {
  const [secretsRoute, revisionRoute] = await Promise.all([
    readFile(cliSecretsRoutePath, "utf8"),
    readFile(cliRevisionRoutePath, "utf8"),
  ]);
  const metadataHandler = secretsRoute.slice(
    secretsRoute.indexOf("GET: async"),
    secretsRoute.indexOf("POST: async"),
  );
  const plaintextHandler = secretsRoute.slice(
    secretsRoute.indexOf("POST: async"),
    secretsRoute.indexOf("PUT: async"),
  );

  assert.match(metadataHandler, /requireSecretsMetadataAccess/);
  assert.match(revisionRoute, /requireSecretsMetadataAccess/);
  assert.match(plaintextHandler, /"secrets:reveal"/);
  assert.doesNotMatch(plaintextHandler, /requireSecretsMetadataAccess/);
});
