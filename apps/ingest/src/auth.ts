import { createHash } from "node:crypto";
import pg from "pg";
import instancePolicy from "../../../shared/instance-config.js";
import postgresPolicy from "../../../shared/postgres-ssl.js";
import hostedPolicy from "../../../shared/hosted-plan-limits.js";

const { instanceConfig } = instancePolicy;
const { postgresSsl } = postgresPolicy;
const { HOSTED_PLAN_LIMITS, resolveHostedPlan } = hostedPolicy;

const { Pool } = pg;

export interface IngestAuthContext {
  organizationId: string;
  retentionDays: number;
  telemetryBytesPerMonth: number;
  tokenId: string;
}

type Queryable = Pick<pg.Pool, "query">;

export interface AuthenticationOptions {
  /** Workers pass installation policy explicitly; never mutate process.env. */
  environment?: Record<string, string | undefined>;
  /** Keeps last-used writes alive until the per-request database client closes. */
  backgroundTask?: (task: Promise<unknown>) => void;
}

interface TokenRow {
  id: string;
  organization_id: string;
  plan: string | null;
}

interface MachineTokenRow extends TokenRow {
  scopes: unknown;
  revoked_at: Date | string | null;
  expires_at: Date | string | null;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function authContext(
  token: TokenRow,
  options: AuthenticationOptions,
): IngestAuthContext {
  const instance = instanceConfig(options.environment);
  const plan = HOSTED_PLAN_LIMITS[resolveHostedPlan(token.plan)];
  return {
    organizationId: token.organization_id,
    retentionDays: instance.selfHosted
      ? instance.retentionDays
      : Math.min(90, plan.retentionDays),
    telemetryBytesPerMonth: instance.selfHosted
      ? instance.limits.telemetryBytesPerMonth
      : plan.telemetryBytesPerMonth,
    tokenId: token.id,
  };
}

function hasObservabilityScope(scopes: unknown): boolean {
  return (
    Array.isArray(scopes) &&
    scopes.some((scope) => scope === "observability:write")
  );
}

function isExpired(value: Date | string | null): boolean {
  return value !== null && new Date(value).getTime() <= Date.now();
}

async function authenticateLegacyToken(
  pool: Queryable,
  apiKey: string,
  options: AuthenticationOptions,
): Promise<IngestAuthContext | null> {
  const result = await pool.query<TokenRow>(
    `SELECT token.id, token.organization_id, subscription.plan
     FROM auth_tokens AS token
     LEFT JOIN subscriptions AS subscription
       ON subscription.organization_id = token.organization_id
     WHERE token.token = $1
     LIMIT 1`,
    [apiKey],
  );

  const token = result.rows[0];
  if (!token) return null;

  console.warn("legacy_observability_token_fallback", {
    tokenId: token.id,
    organizationId: token.organization_id,
  });
  const usage = pool
    .query("UPDATE auth_tokens SET last_used_at = NOW() WHERE id = $1", [
      token.id,
    ])
    .catch(() => console.error("Could not update token usage"));
  options.backgroundTask?.(usage);

  return authContext(token, options);
}

export async function authenticateApiToken(
  pool: Queryable,
  apiKey: string,
  options: AuthenticationOptions = {},
): Promise<IngestAuthContext | null> {
  // Enforce the installation flag here as well as in dashboard navigation;
  // callers can reach the standalone OTLP endpoint directly.
  if (!instanceConfig(options.environment).products.includes("observability"))
    return null;
  if (!apiKey.startsWith("outray_")) return null;

  // Look up the hashed credential first. A matching revoked or expired token
  // fails closed and must never regain access through the legacy table.
  const machineResult = await pool.query<MachineTokenRow>(
    `SELECT token.id, token.organization_id, token.scopes,
            token.revoked_at, token.expires_at, subscription.plan
     FROM secrets_machine_tokens AS token
     LEFT JOIN subscriptions AS subscription
       ON subscription.organization_id = token.organization_id
     WHERE token.token_hash = $1
     LIMIT 1`,
    [tokenHash(apiKey)],
  );

  const machineToken = machineResult.rows[0];
  if (machineToken) {
    if (machineToken.revoked_at || isExpired(machineToken.expires_at)) {
      return null;
    }

    if (hasObservabilityScope(machineToken.scopes)) {
      const usage = pool
        .query(
          "UPDATE secrets_machine_tokens SET last_used_at = NOW() WHERE id = $1",
          [machineToken.id],
        )
        .catch(() => console.error("Could not update token usage"));
      options.backgroundTask?.(usage);
      return authContext(machineToken, options);
    }

    // During the two-release migration, a token may already have a hashed
    // tunnel-only row while its legacy row still carries its previous ingest
    // capability. Only that exact legacy credential receives compatibility.
    return authenticateLegacyToken(pool, apiKey, options);
  }

  return authenticateLegacyToken(pool, apiKey, options);
}

export class ApiTokenAuthenticator {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string, sslRejectUnauthorized = true) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseSsl(databaseUrl, sslRejectUnauthorized),
      max: 10,
    });
  }

  async authenticate(apiKey: string): Promise<IngestAuthContext | null> {
    return authenticateApiToken(this.pool, apiKey);
  }

  /** Transactions must use one exclusive connection, not interleaved pool queries. */
  async withDatabaseConnection<T>(
    work: (connection: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const connection = await this.pool.connect();
    try {
      return await work(connection);
    } finally {
      connection.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

function databaseSsl(
  connectionString: string,
  rejectUnauthorized: boolean,
): false | { rejectUnauthorized: boolean } {
  return postgresSsl(connectionString, rejectUnauthorized);
}

export function apiKeyFromHeaders(headers: Headers): string | null {
  const authorization = headers.get("authorization")?.trim();
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return (
    bearer ||
    headers.get("x-outray-api-key")?.trim() ||
    headers.get("x-api-key")?.trim() ||
    null
  );
}
