import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import pg from "pg";

const { Pool } = pg;

const canonicalStatusHost = "status.outray.app";
const statusPort = Number.parseInt(process.env.STATUS_PORT || "4323", 10);
const statusEnabled = process.env.UPTIME_ENABLED === "true";
const edgeSecret = process.env.STATUS_EDGE_SECRET || "";
const databaseUrl = process.env.DATABASE_URL || "";

let pool: pg.Pool | undefined;

function statusDomainPool(): pg.Pool {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for status host routing");
  if (!pool) {
    const databaseHost = new URL(databaseUrl).hostname.toLowerCase();
    const local = databaseHost === "localhost" || databaseHost === "127.0.0.1" || databaseHost === "[::1]";
    pool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      connectionTimeoutMillis: 2_000,
      idleTimeoutMillis: 30_000,
      query_timeout: 2_000,
      ssl: local ? false : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
    });
  }
  return pool;
}

export function normalizeHost(hostHeader: string | undefined): string | null {
  if (!hostHeader || hostHeader.length > 260 || !/^[a-z0-9.-]+(?::[0-9]{1,5})?$/i.test(hostHeader)) return null;
  const port = hostHeader.split(":")[1];
  if (port && (Number(port) < 1 || Number(port) > 65_535)) return null;
  const host = hostHeader.split(":", 1)[0].toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253 || host.includes("..") || host.startsWith("-") || isIP(host)) return null;
  return host;
}

/** Reserve the status namespace before tunnel and custom-domain lookup. The
 * renderer itself only serves exact one-label page hosts; nested/invalid hosts
 * receive a 404 instead of ever falling through to a tunnel. */
export function isStatusPlatformHost(host: string | null): boolean {
  return host === canonicalStatusHost || !!host?.endsWith(`.${canonicalStatusHost}`);
}

/** Status domains never share a tunnel binding. No positive cache: a domain change takes effect immediately. */
export async function isActiveStatusCustomDomain(host: string, baseDomain: string): Promise<boolean> {
  if (!statusEnabled || isStatusPlatformHost(host) || host === baseDomain || host.endsWith(`.${baseDomain}`)) return false;
  const result = await statusDomainPool().query(
    `SELECT 1 FROM domains d
     JOIN uptime_status_pages p ON p.domain_id = d.id
     WHERE d.domain = $1 AND d.purpose = 'status' AND d.status = 'active'
       AND p.published = true
     LIMIT 1`,
    [host],
  );
  return result.rowCount === 1;
}

function trustedClientIp(req: IncomingMessage): string {
  // Only Caddy on the same host is allowed to supply this header. Its config
  // overwrites the client value using the directly connected remote address.
  const peer = req.socket.remoteAddress || "";
  const fromLoopback = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1";
  const forwarded = req.headers["x-outray-client-ip"];
  const candidate = fromLoopback && typeof forwarded === "string" ? forwarded.trim() : peer;
  return isIP(candidate) ? candidate : "127.0.0.1";
}

const hopHeaders = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "x-outray-edge-secret", "x-outray-client-ip",
]);

export function proxyToStatus(req: IncomingMessage, res: ServerResponse): void {
  if (!statusEnabled || !edgeSecret || !Number.isInteger(statusPort) || statusPort < 1 || statusPort > 65535) {
    res.writeHead(503, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
    res.end("Status pages are unavailable");
    return;
  }

  const headers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined && !hopHeaders.has(key)) headers[key] = value;
  }
  headers.host = req.headers.host || canonicalStatusHost;
  headers["x-outray-edge-secret"] = edgeSecret;
  headers["x-outray-client-ip"] = trustedClientIp(req);

  const upstream = httpRequest({
    hostname: "127.0.0.1",
    port: statusPort,
    method: req.method,
    path: req.url || "/",
    headers,
    timeout: 15_000,
  }, (response) => {
    const responseHeaders: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      if (value !== undefined && !hopHeaders.has(key)) responseHeaders[key] = value;
    }
    res.writeHead(response.statusCode || 502, responseHeaders);
    response.pipe(res);
  });
  upstream.on("timeout", () => upstream.destroy(new Error("Status renderer timeout")));
  upstream.on("error", () => {
    if (res.headersSent) {
      res.destroy();
    } else {
      res.writeHead(502, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      res.end("Status page unavailable");
    }
  });
  req.pipe(upstream);
}

export async function closeStatusRouting(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
