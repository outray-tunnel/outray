import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import pg from "pg";
import publicHosts from "../../../../shared/public-hosts";
import postgresConfig from "../../../../shared/postgres-ssl";
import instancePolicy from "../../../../shared/instance-config";

const { Pool } = pg;

const canonicalStatusHost = publicHosts.canonicalStatusHostname();
const statusUpstream = new URL(process.env.STATUS_UPSTREAM_URL || `http://127.0.0.1:${process.env.STATUS_PORT || "4323"}`);
if (statusUpstream.protocol !== "http:" || statusUpstream.username || statusUpstream.password ||
    statusUpstream.pathname !== "/" || statusUpstream.search || statusUpstream.hash) {
  throw new Error("STATUS_UPSTREAM_URL must be an internal HTTP origin");
}
const statusEnabled = instancePolicy.instanceConfig().products.includes("uptime") && (
  process.env.UPTIME_ENABLED === "true" ||
  (process.env.OUTRAY_DEPLOYMENT_MODE === "self-hosted" && process.env.UPTIME_ENABLED !== "false")
);
const edgeSecret = process.env.STATUS_EDGE_SECRET || "";
const databaseUrl = process.env.DATABASE_URL || "";

let pool: pg.Pool | undefined;

function statusDomainPool(): pg.Pool {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for status host routing");
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      connectionTimeoutMillis: 2_000,
      idleTimeoutMillis: 30_000,
      query_timeout: 2_000,
      ssl: postgresConfig.postgresSsl(databaseUrl, process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false"),
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
       AND p.organization_id = d.organization_id
     WHERE d.domain = $1 AND d.purpose = 'status' AND d.status = 'active'
       AND p.published = true
     LIMIT 1`,
    [host],
  );
  return result.rowCount === 1;
}

export function isTrustedStatusProxyPeer(peer: string, configured = process.env.STATUS_TRUSTED_PROXY_IPS || ""): boolean {
  const normalized = peer.startsWith("::ffff:") && isIP(peer.slice(7)) === 4 ? peer.slice(7) : peer;
  if (["127.0.0.1", "::1"].includes(normalized)) return true;
  return configured.split(",").some((entry) => {
    const address = entry.trim();
    return isIP(address) !== 0 && address === normalized;
  });
}

function trustedClientIp(req: IncomingMessage): string {
  // Only loopback or explicitly configured Caddy container IPs may supply this
  // header. Caddy overwrites client values with the directly connected address.
  const peer = req.socket.remoteAddress || "";
  const forwarded = req.headers["x-outray-client-ip"];
  const candidate = isTrustedStatusProxyPeer(peer) && typeof forwarded === "string" ? forwarded.trim() : peer;
  return isIP(candidate) ? candidate : "127.0.0.1";
}

const hopHeaders = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "x-outray-edge-secret", "x-outray-client-ip",
]);

export function proxyToStatus(req: IncomingMessage, res: ServerResponse): void {
  if (!statusEnabled || !edgeSecret) {
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
    hostname: statusUpstream.hostname,
    port: statusUpstream.port || 80,
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
