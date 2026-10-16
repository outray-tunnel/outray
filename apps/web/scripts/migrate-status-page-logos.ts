import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import pg from "pg";
import postgresConfiguration from "../../../shared/postgres-ssl";
import {
  decodeLegacyStatusPageLogo,
  deleteNewStatusPageLogo,
  MAX_STATUS_LOGO_BYTES,
  storeStatusPageLogo,
  type StoredStatusPageLogo,
} from "../src/lib/uptime/status-logo-storage.server";

const { postgresSsl } = postgresConfiguration;

const USAGE = "Usage: npm run status:logos:migrate --workspace=outray-web -- --env-file /absolute/path/to/.env.prod [--apply]";
const STORAGE_ENVIRONMENT = [
  "OUTRAY_DEPLOYMENT_MODE", "NODE_ENV", "CONSOLE_PUBLIC_URL", "APP_URL",
  "STATUS_PAGE_LOGOS_DIR", "DELIVERY_PUBLIC_URL", "DELIVERY_UPLOAD_TOKEN",
] as const;
const PAGE_SIZE = 25;
const MAX_DATA_URL_LENGTH = Math.ceil(MAX_STATUS_LOGO_BYTES / 3) * 4 + 64;

function options(args: string[]) {
  let file: string | undefined;
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--env-file" && !file && args[index + 1] && !args[index + 1].startsWith("--")) {
      file = args[++index];
    } else if (args[index] === "--apply" && !apply) {
      apply = true;
    } else throw new Error(USAGE);
  }
  if (!file) throw new Error(USAGE);
  return { file: resolve(file), apply };
}

async function verifyPublicLogo(logo: StoredStatusPageLogo, original: Uint8Array) {
  const response = await fetch(logo.url, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { "cache-control": "no-cache" },
  });
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel();
    throw new Error("Public logo verification failed");
  }
  const expectedType = logo.fileName.endsWith(".png") ? "image/png" : "image/webp";
  if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== expectedType) {
    await response.body.cancel();
    throw new Error("Public logo type verification failed");
  }
  const reader = response.body.getReader();
  const digest = createHash("sha256");
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > original.byteLength || size > MAX_STATUS_LOGO_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error("Public logo size verification failed");
      }
      digest.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size !== original.byteLength || digest.digest("hex") !== createHash("sha256").update(original).digest("hex")) {
    throw new Error("Public logo content verification failed");
  }
}

async function rollbackUnreferenced(client: pg.Client, logo: StoredStatusPageLogo): Promise<boolean> {
  try {
    const references = await client.query("SELECT id FROM uptime_status_pages WHERE logo_url = $1 LIMIT 1", [logo.url]);
    if (!references.rowCount) await deleteNewStatusPageLogo(logo);
    return true;
  } catch {
    // A failed database read means an uncertain commit outcome; retaining an
    // immutable orphan is safer than deleting a potentially active page logo.
    return false;
  }
}

async function main() {
  const configuration = options(process.argv.slice(2));
  const selected = parseEnv(await readFile(configuration.file, "utf8"));
  if (!selected.DATABASE_URL) throw new Error("The selected env file must contain DATABASE_URL");
  // Never export an entire production env file (which can contain unrelated
  // provider credentials). The storage helper receives only its own settings.
  for (const key of STORAGE_ENVIRONMENT) {
    if (selected[key] === undefined) delete process.env[key];
    else process.env[key] = selected[key];
  }
  process.env.NODE_ENV ||= "production";
  const client = new pg.Client({
    connectionString: selected.DATABASE_URL,
    ssl: postgresSsl(selected.DATABASE_URL, selected.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false"),
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
  });
  client.on("error", () => {
    console.error("Database connection interrupted during status-page logo migration");
    process.exitCode = 1;
  });
  const totals = { scanned: 0, valid: 0, migrated: 0, raced: 0, invalid: 0, failed: 0, retained: 0 };
  await client.connect();
  try {
    if (!configuration.apply) await client.query("SET default_transaction_read_only = on");
    console.log(configuration.apply ? "Applying legacy status-page logo migration" : "Dry run: no uploads, disk writes, or database changes");
    let after = "";
    for (;;) {
      // Bound both batch count and individual values loaded from the database.
      const result = await client.query<{ id: string; logo_url: string | null }>(
        `SELECT id, CASE WHEN octet_length(logo_url) <= $2 THEN logo_url ELSE NULL END AS logo_url
         FROM uptime_status_pages WHERE logo_url LIKE 'data:image/%' AND id > $1
         ORDER BY id LIMIT $3`,
        [after, MAX_DATA_URL_LENGTH, PAGE_SIZE],
      );
      if (!result.rows.length) break;
      after = result.rows[result.rows.length - 1].id;
      for (const row of result.rows) {
        totals.scanned += 1;
        let image;
        try {
          image = row.logo_url ? decodeLegacyStatusPageLogo(row.logo_url) : null;
          if (!image) throw new Error("Invalid legacy logo");
          totals.valid += 1;
        } catch {
          totals.invalid += 1;
          console.error(`Skipped invalid legacy logo for page ${row.id}`);
          continue;
        }
        if (!configuration.apply) {
          console.log(`Would migrate page ${row.id} (${image.contentType}, ${image.bytes.byteLength} bytes)`);
          continue;
        }
        let stored: StoredStatusPageLogo | undefined;
        try {
          stored = await storeStatusPageLogo(image.bytes, image.contentType);
          await verifyPublicLogo(stored, image.bytes);
          const updated = await client.query(
            "UPDATE uptime_status_pages SET logo_url = $1, updated_at = now() WHERE id = $2 AND logo_url = $3 RETURNING id",
            [stored.url, row.id, row.logo_url],
          );
          if (!updated.rowCount) {
            totals.raced += 1;
            if (!await rollbackUnreferenced(client, stored)) totals.retained += 1;
            console.log(`Skipped concurrently changed page ${row.id}`);
            continue;
          }
          totals.migrated += 1;
          console.log(`Migrated page ${row.id}: ${stored.url}`);
        } catch {
          totals.failed += 1;
          if (stored && !await rollbackUnreferenced(client, stored)) totals.retained += 1;
          // SQL/transport exceptions can include bound data URLs or credentials.
          // Only the page identifier is deliberately exposed here.
          console.error(`Migration failed for page ${row.id}; its previous logo remains unless an uncertain database commit succeeded`);
        }
      }
    }
    console.log(JSON.stringify({ mode: configuration.apply ? "apply" : "dry-run", ...totals }));
    if (totals.failed || totals.invalid || totals.retained) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch(() => {
  console.error(`Status-page logo migration could not finish. Check the selected database/storage configuration. ${USAGE}`);
  process.exitCode = 1;
});
