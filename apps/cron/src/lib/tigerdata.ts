import pg from "pg";
import { config } from "../config";

const { Pool } = pg;

/**
 * Determine SSL configuration based on environment.
 *
 * SSL Modes:
 * - "" (empty/auto): Let pg use sslmode from connection string (default)
 * - "disable": Explicitly disable SSL
 * - "require": Use SSL but don't verify certificates
 * - "verify-ca": Use SSL, verify CA certificate
 * - "verify-full": Use SSL, verify CA certificate and hostname
 *
 * TIGER_DATA_SSL_CA can be set to a base64-encoded CA certificate for custom CAs.
 */
function getSSLConfig(): pg.PoolConfig["ssl"] {
  const sslMode = config.tigerDataSslMode;

  // Empty/auto: don't override, let pg use connection string's sslmode
  if (!sslMode) {
    return undefined;
  }

  // Explicitly disable SSL
  if (sslMode === "disable") {
    return false;
  }

  // SSL enabled modes
  if (sslMode === "require" || sslMode === "verify-ca" || sslMode === "verify-full") {
    const sslConfig: pg.ConnectionOptions["ssl"] = {
      // require: don't verify, verify-ca/verify-full: verify
      rejectUnauthorized: sslMode !== "require",
    };

    // If a custom CA certificate is provided (base64 encoded)
    if (config.tigerDataSslCa) {
      sslConfig.ca = Buffer.from(config.tigerDataSslCa, "base64").toString("utf-8");
    }

    return sslConfig;
  }

  // Unknown mode - log warning and use auto (undefined)
  console.warn(`Unknown TIGER_DATA_SSL_MODE: "${sslMode}", using connection string default`);
  return undefined;
}

export const pool = new Pool({
  connectionString: config.tigerDataUrl,
  ssl: getSSLConfig(),
});

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function execute(text: string, params?: unknown[]): Promise<void> {
  await pool.query(text, params);
}
