import pg from "pg";

const { Pool } = pg;

const RETENTION_DAYS: Record<string, number> = {
  free: 3,
  ray: 14,
  beam: 30,
  pulse: 90,
  unlimited: 90,
};

export interface IngestAuthContext {
  organizationId: string;
  retentionDays: number;
  tokenId: string;
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
    if (!apiKey.startsWith("outray_")) return null;

    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      plan: string | null;
    }>(
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

    void this.pool
      .query("UPDATE auth_tokens SET last_used_at = NOW() WHERE id = $1", [
        token.id,
      ])
      .catch((error) => console.error("Could not update token usage", error));

    return {
      organizationId: token.organization_id,
      retentionDays:
        RETENTION_DAYS[token.plan || "free"] || RETENTION_DAYS.free,
      tokenId: token.id,
    };
  }

  async close() {
    await this.pool.end();
  }
}

function databaseSsl(
  connectionString: string,
  rejectUnauthorized: boolean,
): false | { rejectUnauthorized: boolean } {
  if (/localhost|127\.0\.0\.1/.test(connectionString)) return false;
  return { rejectUnauthorized };
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
