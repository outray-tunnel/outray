import { parseArgs } from "node:util";
import pg from "pg";
import postgresConfiguration from "../../../shared/postgres-ssl";

const { postgresSsl } = postgresConfiguration;

const usage = `Manage an existing user's platform-admin profile.

npm run admin:profile -- --email you@example.com --grant [--apply]
npm run admin:profile -- --user-id USER_ID --revoke [--apply]

Uses DATABASE_URL from the current environment. Without --apply, only previews.
Sign in with GitHub/Google first; this command never creates a user.`;

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      "user-id": { type: "string" },
      grant: { type: "boolean" },
      revoke: { type: "boolean" },
      apply: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  if (Boolean(values.email) === Boolean(values["user-id"]) ||
      Boolean(values.grant) === Boolean(values.revoke)) {
    throw new Error("Choose exactly one of --email/--user-id and one of --grant/--revoke. Use --help for examples.");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL must target the installation you intend to manage.");

  const client = new pg.Client({
    connectionString,
    ssl: postgresSsl(connectionString, process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false"),
    connectionTimeoutMillis: 10_000,
    statement_timeout: 10_000,
    application_name: "outray-admin-profile",
  });
  try {
    await client.connect();
    await client.query("BEGIN");
    const column = values.email ? "email" : "id";
    const identifier = values.email ?? values["user-id"];
    const { rows } = await client.query<{
      id: string; email: string; is_admin: boolean;
    }>(`SELECT id, email, is_admin FROM users WHERE ${column} = $1 FOR UPDATE`, [identifier]);
    if (rows.length !== 1) throw new Error("No matching user. Sign in with GitHub/Google first, then use the exact profile email or user ID.");
    const user = rows[0];
    if (values.grant) {
      const linked = await client.query(
        "SELECT 1 FROM accounts WHERE user_id = $1 AND provider_id IN ('github', 'google') LIMIT 1",
        [user.id],
      );
      if (!linked.rowCount) throw new Error("Admin access requires a linked GitHub or Google account.");
    }
    const isAdmin = values.grant === true;
    if (values.apply) {
      await client.query("UPDATE users SET is_admin = $1, updated_at = NOW() WHERE id = $2", [isAdmin, user.id]);
      await client.query("COMMIT");
      console.log(`Platform admin ${isAdmin ? "granted to" : "revoked for"} ${user.email} (${user.id}).`);
    } else {
      await client.query("ROLLBACK");
      console.log(`Preview: ${user.email} (${user.id}) isAdmin ${user.is_admin} → ${isAdmin}. No changes made; add --apply to save.`);
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    // Database errors may contain connection details or SQL; keep operator output bounded.
    if (error instanceof Error && !("code" in error)) throw error;
    throw new Error("Database operation failed. Check connectivity and apply pending migrations on the intended installation.");
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Could not update the admin profile.");
  process.exitCode = 1;
});
