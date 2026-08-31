import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { authTokens } from "../src/db/app-schema";
import { machineTokens } from "../src/db/secrets-schema";
import {
  hashMachineToken,
  machineTokenPrefix,
} from "../src/lib/machine-tokens";

async function main() {
  const stats = await db.transaction(async (tx) => {
    // Freeze legacy writes for the scan and reconciliation. This closes the
    // in-run snapshot race; keep the fallback until the post-deploy final run.
    await tx.execute(sql`LOCK TABLE ${authTokens} IN SHARE MODE`);
    const legacyTokens = await tx.select().from(authTokens);
    let created = 0;
    let existing = 0;

    for (const legacy of legacyTokens) {
      const tokenHash = hashMachineToken(legacy.token);
      const [inserted] = await tx
        .insert(machineTokens)
        .values({
          id: crypto.randomUUID(),
          organizationId: legacy.organizationId,
          name: legacy.name,
          tokenHash,
          prefix: machineTokenPrefix(legacy.token),
          scopes: ["tunnel:connect"],
          createdById: legacy.userId,
          createdAt: legacy.createdAt,
          lastUsedAt: legacy.lastUsedAt,
        })
        .onConflictDoNothing({ target: machineTokens.tokenHash })
        .returning({ id: machineTokens.id });
      if (inserted) created += 1;
      else existing += 1;
    }

    const missing: string[] = [];
    for (const legacy of legacyTokens) {
      const [migrated] = await tx
        .select({ id: machineTokens.id })
        .from(machineTokens)
        .where(
          eq(machineTokens.tokenHash, hashMachineToken(legacy.token)),
        )
        .limit(1);
      if (!migrated) missing.push(legacy.id);
    }
    if (missing.length) {
      throw new Error(
        `${missing.length} legacy credentials are missing hashed machine-token rows`,
      );
    }

    return { legacy: legacyTokens.length, created, existing };
  });

  const machineTokenCount = await db.$count(machineTokens);
  process.stdout.write(
    `Machine-token backfill verified: legacy=${stats.legacy} created=${stats.created} existing=${stats.existing} missing=0 machine=${machineTokenCount}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `Machine-token backfill failed: ${error instanceof Error ? error.message : "Unknown error"}\n`,
  );
  process.exitCode = 1;
});
