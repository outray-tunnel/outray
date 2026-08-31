import { and, eq, ne } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import { db } from "../../db";
import {
  secretAuditEvents,
  secretOrganizationKeys,
} from "../../db/secrets-schema";
import {
  readSecretsKeyring,
  unwrapOrganizationKey,
  wrapOrganizationKey,
} from "./crypto";
import { SecretsError } from "./types";

export async function runSecretsKeyRewrapCommand(options: {
  organizationId?: string;
  verifyOnly?: boolean;
} = {}) {
  const keyring = readSecretsKeyring();
  const conditions = options.organizationId
    ? [eq(secretOrganizationKeys.organizationId, options.organizationId)]
    : [];
  const rows = await db
    .select()
    .from(secretOrganizationKeys)
    .where(conditions.length ? and(...conditions) : undefined);
  let rewrapped = 0;

  if (!options.verifyOnly) {
    for (const row of rows) {
      if (row.wrappingKeyId === keyring.active.id) continue;
      const organizationKey = unwrapOrganizationKey(
        row.organizationId,
        {
          ciphertext: row.wrappedKey,
          iv: row.iv,
          authTag: row.authTag,
          algorithm: "AES-256-GCM",
          wrappingKeyId: row.wrappingKeyId,
          organizationKeyVersion: row.version,
        },
        keyring,
      );
      try {
        const wrapped = wrapOrganizationKey(
          row.organizationId,
          row.version,
          organizationKey,
          keyring.active,
        );
        const changed = await db.transaction(async (tx) => {
          const [updated] = await tx
            .update(secretOrganizationKeys)
            .set({
              wrappedKey: wrapped.ciphertext,
              iv: wrapped.iv,
              authTag: wrapped.authTag,
              wrappingKeyId: wrapped.wrappingKeyId,
              rewrappedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(secretOrganizationKeys.id, row.id),
                eq(secretOrganizationKeys.wrappingKeyId, row.wrappingKeyId),
              ),
            )
            .returning({ id: secretOrganizationKeys.id });
          if (!updated) return false;
          await tx.insert(secretAuditEvents).values({
            id: crypto.randomUUID(),
            organizationId: row.organizationId,
            actorType: "system",
            actorCredential: "system",
            actorId: null,
            actorTokenId: null,
            action: "organization_key.rewrapped",
            result: "success",
            requestId: `rewrap:${crypto.randomUUID()}`,
            targetType: "organization_key",
            targetId: row.id,
            targetName: `v${row.version}`,
            metadata: {
              version: row.version,
              previousWrappingKeyId: row.wrappingKeyId,
              wrappingKeyId: keyring.active.id,
              command: true,
            },
          });
          return true;
        });
        if (changed) rewrapped += 1;
      } finally {
        organizationKey.fill(0);
      }
    }
  }

  const remainingConditions = [
    ne(secretOrganizationKeys.wrappingKeyId, keyring.active.id),
    ...(options.organizationId
      ? [eq(secretOrganizationKeys.organizationId, options.organizationId)]
      : []),
  ];
  const remaining = await db
    .select({
      id: secretOrganizationKeys.id,
      organizationId: secretOrganizationKeys.organizationId,
      version: secretOrganizationKeys.version,
      wrappingKeyId: secretOrganizationKeys.wrappingKeyId,
    })
    .from(secretOrganizationKeys)
    .where(and(...remainingConditions));
  if (!options.verifyOnly && remaining.length) {
    throw new SecretsError(
      `${remaining.length} organization keys still reference retired master keys`,
      {
        code: "SECRETS_REWRAP_INCOMPLETE",
        status: 500,
        details: { remaining },
      },
    );
  }
  return {
    scanned: rows.length,
    rewrapped,
    remainingOldKeyReferences: remaining.length,
    activeWrappingKeyId: keyring.active.id,
  };
}

async function main() {
  const organizationArgument = process.argv.find((argument) =>
    argument.startsWith("--organization="),
  );
  const organizationId = organizationArgument?.slice("--organization=".length);
  const result = await runSecretsKeyRewrapCommand({
    ...(organizationId ? { organizationId } : {}),
    verifyOnly: process.argv.includes("--verify-only"),
  });
  console.log(JSON.stringify(result));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
