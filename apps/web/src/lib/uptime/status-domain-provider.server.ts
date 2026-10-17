import { instanceConfig } from "../../../../../shared/instance-config";
import publicHosts from "../../../../../shared/public-hosts";

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const REQUEST_TIMEOUT_MS = 10_000;
const PROVIDER_NAME = "cloudflare";
const DCV_ROUTE_PATHS = [
  "/.well-known/acme-challenge/*",
  "/.well-known/pki-validation/*",
] as const;

interface CloudflareConfig {
  accountId: string;
  zoneId: string;
  token: string;
  workerScript: string;
}

interface CloudflareEnvelope<T> {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number }>;
}

interface CloudflareZone {
  id: string;
  name: string;
  account?: { id?: string };
}

interface CloudflareCustomHostname {
  id: string;
  hostname: string;
  status?: string;
  ssl?: { status?: string };
  custom_metadata?: Record<string, string>;
}

interface CloudflareWorkerRoute {
  id: string;
  pattern: string;
  script?: string | null;
}

interface CloudflareDnsRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  proxied?: boolean;
}

interface ProviderOwner {
  id: string;
  kind: "canonical" | "custom";
}

export interface StatusHostnameProvisioning {
  providerId: string;
  providerStatus: string;
  hostname: string;
  ready: boolean;
  failed: boolean;
}

type PersistProviderResource = (
  resource: Pick<StatusHostnameProvisioning, "providerId" | "providerStatus" | "hostname">,
) => Promise<void>;

export class StatusDomainProviderError extends Error {
  readonly httpStatus: number;
  readonly providerHttpStatus?: number;
  readonly providerCodes: number[];

  constructor(message: string, httpStatus = 503, providerHttpStatus?: number, providerCodes: number[] = []) {
    super(message);
    this.name = "StatusDomainProviderError";
    this.httpStatus = httpStatus;
    this.providerHttpStatus = providerHttpStatus;
    this.providerCodes = providerCodes;
  }
}

export function statusDomainProviderEnabled(): boolean {
  // Self-hosted installations always retain their Caddy/on-demand TLS flow,
  // even if a copied environment accidentally contains the hosted flag.
  if (instanceConfig().selfHosted) return false;
  const provider = process.env.STATUS_DOMAIN_PROVIDER?.trim().toLowerCase();
  if (!provider) {
    // The hosted OutRay status namespace needs Cloudflare for DNS, Worker
    // routing, and TLS. Never publish a page that would have no public host.
    if (process.env.NODE_ENV === "production" &&
        publicHosts.canonicalStatusHostname() === "status.outray.app") {
      throw new StatusDomainProviderError("Status domain provisioning is not configured", 503);
    }
    return false;
  }
  if (provider !== PROVIDER_NAME) {
    throw new StatusDomainProviderError("Status domain provisioning is not configured", 503);
  }
  return true;
}

export function statusDomainProviderResponse(error: unknown): Response {
  if (error instanceof StatusDomainProviderError) {
    return Response.json({ error: error.message }, { status: error.httpStatus });
  }
  return Response.json({ error: "Status domain provisioning is temporarily unavailable" }, { status: 503 });
}

export async function ensureCustomStatusHostname(input: {
  hostname: string;
  domainId: string;
  providerId?: string | null;
  persistProviderResource?: PersistProviderResource;
}): Promise<StatusHostnameProvisioning | null> {
  if (!statusDomainProviderEnabled()) return null;
  const hostname = requiredHostname(input.hostname);
  return provisionHostname(hostname, { id: input.domainId, kind: "custom" }, input.providerId || null, false,
    input.persistProviderResource);
}

export async function ensureCanonicalStatusHostname(input: {
  slug: string;
  pageId: string;
  providerId?: string | null;
  persistProviderResource?: PersistProviderResource;
}): Promise<StatusHostnameProvisioning | null> {
  if (!statusDomainProviderEnabled()) return null;
  const canonical = publicHosts.canonicalStatusHostname();
  const hostname = requiredHostname(`${input.slug}.${canonical}`);
  return provisionHostname(hostname, { id: input.pageId, kind: "canonical" }, input.providerId || null, true,
    input.persistProviderResource);
}

export async function removeCustomStatusHostname(input: {
  hostname: string;
  domainId: string;
  providerId?: string | null;
}): Promise<boolean> {
  if (!statusDomainProviderEnabled()) return false;
  const config = cloudflareConfig();
  const hostname = requiredHostname(input.hostname);
  await assertConfiguredZone(config, hostname, false);

  const owner: ProviderOwner = { id: input.domainId, kind: "custom" };
  const customHostname = await findOwnedCustomHostname(config, hostname, owner, input.providerId || null);
  await removeExactWorkerRoutes(config, hostname, Boolean(customHostname));
  if (customHostname) {
    await cloudflareRequest<unknown>(config, `/zones/${config.zoneId}/custom_hostnames/${customHostname.id}`, {
      method: "DELETE",
    }, { allowNotFound: true, operation: "delete custom hostname" });
  }
  return true;
}

async function provisionHostname(
  hostname: string,
  owner: ProviderOwner,
  providerId: string | null,
  manageDns: boolean,
  persistProviderResource?: PersistProviderResource,
): Promise<StatusHostnameProvisioning> {
  const config = cloudflareConfig();
  await assertConfiguredZone(config, hostname, manageDns);
  if (manageDns) await ensureCanonicalDnsRecord(config, hostname);
  const customHostname = await ensureOwnedCustomHostname(config, hostname, owner, providerId);

  const hostnameStatus = safeProviderStatus(customHostname.status);
  const sslStatus = safeProviderStatus(customHostname.ssl?.status);
  const failed = terminalProviderStatus(hostnameStatus) || terminalProviderStatus(sslStatus);
  const ready = hostnameStatus === "active" && sslStatus === "active";
  // Persist the provider ID before adding the route. Cloudflare only accepts
  // vanity-host routes after the SaaS hostname exists; this checkpoint also
  // makes a route failure safely retryable instead of orphaning the hostname.
  await persistProviderResource?.({
    providerId: customHostname.id,
    providerStatus: failed ? "failed" : `hostname:${hostnameStatus};ssl:${sslStatus};route:pending`,
    hostname,
  });
  if (!failed) await ensureExactWorkerRoutes(config, hostname);
  return {
    providerId: customHostname.id,
    providerStatus: ready ? "active" : failed ? "failed" : `hostname:${hostnameStatus};ssl:${sslStatus};route:active`,
    hostname,
    ready,
    failed,
  };
}

function cloudflareConfig(): CloudflareConfig {
  const accountId = process.env.STATUS_CLOUDFLARE_ACCOUNT_ID?.trim() || "";
  const zoneId = process.env.STATUS_CLOUDFLARE_ZONE_ID?.trim() || "";
  const token = process.env.STATUS_CLOUDFLARE_API_TOKEN?.trim() || "";
  const workerScript = process.env.STATUS_CLOUDFLARE_WORKER_SCRIPT?.trim() || "outray-status-worker";
  if (!/^[0-9a-f]{32}$/i.test(accountId) || !/^[0-9a-f]{32}$/i.test(zoneId) ||
      token.length < 20 || /\s/.test(token) || !/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(workerScript)) {
    throw new StatusDomainProviderError("Status domain provisioning is not configured", 503);
  }
  return { accountId, zoneId, token, workerScript };
}

let verifiedZone: { key: string; value: CloudflareZone } | undefined;

async function assertConfiguredZone(config: CloudflareConfig, hostname: string, mustOwnHostname: boolean): Promise<void> {
  const key = `${config.accountId}:${config.zoneId}`;
  let zone = verifiedZone?.key === key ? verifiedZone.value : undefined;
  if (!zone) {
    zone = await cloudflareRequest<CloudflareZone>(config, `/zones/${config.zoneId}`, { method: "GET" }, {
      operation: "read zone",
    });
    const zoneName = publicHosts.normalizePublicHostname(zone.name || "");
    if (zone.id !== config.zoneId || zone.account?.id !== config.accountId || !zoneName) {
      throw new StatusDomainProviderError("Status domain provisioning is not configured", 503);
    }
    zone = { ...zone, name: zoneName };
    verifiedZone = { key, value: zone };
  }
  if (mustOwnHostname && hostname !== zone.name && !hostname.endsWith(`.${zone.name}`)) {
    throw new StatusDomainProviderError("The canonical status hostname is outside the configured zone", 503);
  }
}

async function ensureOwnedCustomHostname(
  config: CloudflareConfig,
  hostname: string,
  owner: ProviderOwner,
  providerId: string | null,
): Promise<CloudflareCustomHostname> {
  const existing = await findOwnedCustomHostname(config, hostname, owner, providerId);
  if (existing) return existing;

  const create = (includeMetadata: boolean) => cloudflareRequest<CloudflareCustomHostname>(
    config,
    `/zones/${config.zoneId}/custom_hostnames`,
    {
      method: "POST",
      body: JSON.stringify({
        hostname,
        ssl: {
          method: "http",
          type: "dv",
          settings: { http2: "on", min_tls_version: "1.2", tls_1_3: "on" },
          wildcard: false,
        },
        ...(includeMetadata ? { custom_metadata: ownerMetadata(owner) } : {}),
      }),
    },
    { operation: "create custom hostname" },
  );

  try {
    return await create(true);
  } catch (error) {
    // Custom-hostname metadata is an account entitlement. It strengthens
    // reconciliation when available, but certificate provisioning must not
    // depend on the entitlement. The provider ID returned by this request is
    // persisted before a domain can become active.
    if (error instanceof StatusDomainProviderError && error.providerCodes.includes(1413)) {
      try {
        return await create(false);
      } catch (fallbackError) {
        return reconcileCreateConflict(config, hostname, owner, fallbackError);
      }
    }
    return reconcileCreateConflict(config, hostname, owner, error);
  }
}

async function reconcileCreateConflict(
  config: CloudflareConfig,
  hostname: string,
  owner: ProviderOwner,
  error: unknown,
): Promise<CloudflareCustomHostname> {
  // A successful provider create followed by a lost response is reconciled by
  // ownership metadata. Never adopt a same-name hostname without that marker.
  if (!(error instanceof StatusDomainProviderError) ||
      (error.providerHttpStatus !== 409 && !error.providerCodes.includes(1406))) throw error;
  const raced = await findOwnedCustomHostname(config, hostname, owner, null);
  if (raced) return raced;
  throw new StatusDomainProviderError("This hostname is already registered with the status provider", 409);
}

async function findOwnedCustomHostname(
  config: CloudflareConfig,
  hostname: string,
  owner: ProviderOwner,
  providerId: string | null,
): Promise<CloudflareCustomHostname | null> {
  if (providerId) {
    const byId = await cloudflareRequest<CloudflareCustomHostname | null>(
      config,
      `/zones/${config.zoneId}/custom_hostnames/${encodeURIComponent(providerId)}`,
      { method: "GET" },
      { allowNotFound: true, operation: "read custom hostname" },
    );
    if (byId) {
      if (normalizeProviderHostname(byId.hostname) !== hostname) {
        throw new StatusDomainProviderError("Stored status hostname ownership does not match the provider", 409);
      }
      if (byId.custom_metadata && !metadataMatches(byId.custom_metadata, owner)) {
        throw new StatusDomainProviderError("Stored status hostname ownership does not match the provider", 409);
      }
      return byId;
    }
  }

  const query = new URLSearchParams({ hostname, page: "1", per_page: "50" });
  const matches = await cloudflareRequest<CloudflareCustomHostname[]>(
    config,
    `/zones/${config.zoneId}/custom_hostnames?${query}`,
    { method: "GET" },
    { operation: "list custom hostnames" },
  );
  const exact = matches.filter((candidate) => normalizeProviderHostname(candidate.hostname) === hostname);
  if (!exact.length) return null;
  const owned = exact.find((candidate) => metadataMatches(candidate.custom_metadata, owner));
  if (!owned || exact.some((candidate) => candidate.id !== owned.id)) {
    throw new StatusDomainProviderError("This hostname is already registered with the status provider", 409);
  }
  return owned;
}

async function ensureExactWorkerRoutes(config: CloudflareConfig, hostname: string): Promise<void> {
  const expected = [
    ...DCV_ROUTE_PATHS.map((path) => ({ pattern: `${hostname}${path}`, script: null })),
    { pattern: `${hostname}/*`, script: config.workerScript },
  ];
  let routes = await listWorkerRoutes(config);
  for (const route of expected) {
    const exact = exactRoutes(routes, route.pattern);
    if (exact.length) {
      if (exact.length === 1 && (exact[0].script ?? null) === route.script) continue;
      throw new StatusDomainProviderError("This hostname already has a conflicting edge route", 409);
    }
    const created = await cloudflareRequest<CloudflareWorkerRoute>(config, `/zones/${config.zoneId}/workers/routes`, {
      method: "POST", body: JSON.stringify({ pattern: route.pattern,
        ...(route.script ? { script: route.script } : {}) }),
    }, { operation: "create worker route" }).catch(async (error: unknown) => {
      // Cloudflare documents no idempotency key or stable duplicate status for
      // routes. Re-list after a failed create and accept only the exact route
      // with the expected Worker (or explicit None for a DCV exclusion).
      const raced = exactRoutes(await listWorkerRoutes(config), route.pattern);
      if (raced.length === 1 && (raced[0].script ?? null) === route.script) return raced[0];
      throw error;
    });
    routes = [...routes, created];
  }
}

async function removeExactWorkerRoutes(
  config: CloudflareConfig,
  hostname: string,
  hostnameOwnershipVerified: boolean,
): Promise<void> {
  const routes = await listWorkerRoutes(config);
  const main = exactRoutes(routes, `${hostname}/*`);
  const dcvByPattern = DCV_ROUTE_PATHS.map((path) => exactRoutes(routes, `${hostname}${path}`));
  const dcv = dcvByPattern.flat();
  if (main.length > 1 || main.some((route) => route.script !== config.workerScript) ||
      dcvByPattern.some((matches) => matches.length > 1) || dcv.some((route) => (route.script ?? null) !== null)) {
    throw new StatusDomainProviderError("This hostname has a conflicting edge route", 409);
  }
  if (!hostnameOwnershipVerified) {
    // With no provider hostname left, an empty exact route set is an
    // idempotent retry. Never infer ownership of remaining routes by name.
    if (main.length || dcv.length) {
      throw new StatusDomainProviderError("Status hostname ownership could not be verified", 409);
    }
    return;
  }
  for (const route of [...main, ...dcv]) {
    await cloudflareRequest<unknown>(config, `/zones/${config.zoneId}/workers/routes/${route.id}`, {
      method: "DELETE",
    }, { allowNotFound: true, operation: "delete worker route" });
  }
}

function exactRoutes(routes: CloudflareWorkerRoute[], pattern: string): CloudflareWorkerRoute[] {
  const normalized = pattern.toLowerCase();
  return routes.filter((route) => route.pattern.toLowerCase() === normalized);
}

async function listWorkerRoutes(config: CloudflareConfig): Promise<CloudflareWorkerRoute[]> {
  return cloudflareRequest<CloudflareWorkerRoute[]>(config, `/zones/${config.zoneId}/workers/routes`, {
    method: "GET",
  }, { operation: "list worker routes" });
}

async function ensureCanonicalDnsRecord(config: CloudflareConfig, hostname: string): Promise<void> {
  const target = publicHosts.canonicalStatusHostname();
  if (hostname === target) throw new StatusDomainProviderError("Canonical status DNS would create a loop", 503);
  const query = new URLSearchParams({ name: hostname, page: "1", per_page: "100" });
  const records = await cloudflareRequest<CloudflareDnsRecord[]>(
    config,
    `/zones/${config.zoneId}/dns_records?${query}`,
    { method: "GET" },
    { operation: "list DNS records" },
  );
  const exact = records.filter((record) => normalizeProviderHostname(record.name) === hostname);
  if (exact.length) {
    if (exact.length === 1 && exact[0].type === "CNAME" &&
        normalizeProviderHostname(exact[0].content) === target && exact[0].proxied === true) return;
    throw new StatusDomainProviderError("The canonical status hostname has a conflicting DNS record", 409);
  }
  await cloudflareRequest<CloudflareDnsRecord>(config, `/zones/${config.zoneId}/dns_records`, {
    method: "POST",
    // Owned canonical hosts must remain proxied; a DNS-only self-CNAME chain
    // exposes Cloudflare's synthetic target address instead of the Worker.
    body: JSON.stringify({ type: "CNAME", name: hostname, content: target, proxied: true, ttl: 1 }),
  }, { operation: "create DNS record" });
}

function ownerMetadata(owner: ProviderOwner): Record<string, string> {
  return {
    outray_product: "uptime",
    outray_resource_id: owner.id,
    outray_resource_kind: owner.kind,
  };
}

function metadataMatches(metadata: Record<string, string> | undefined, owner: ProviderOwner): boolean {
  return metadata?.outray_product === "uptime" && metadata.outray_resource_id === owner.id &&
    metadata.outray_resource_kind === owner.kind;
}

function requiredHostname(value: string): string {
  const hostname = publicHosts.normalizePublicHostname(value);
  if (!hostname || hostname === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    throw new StatusDomainProviderError("Status hostname is invalid", 400);
  }
  return hostname;
}

function normalizeProviderHostname(value: unknown): string | null {
  return typeof value === "string" ? publicHosts.normalizePublicHostname(value) : null;
}

function safeProviderStatus(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_-]{1,64}$/i.test(value) ? value.toLowerCase() : "unknown";
}

function terminalProviderStatus(value: string): boolean {
  return ["blocked", "deleted", "failed", "moved", "pending_deletion", "validation_timed_out"].includes(value);
}

async function cloudflareRequest<T>(
  config: CloudflareConfig,
  path: string,
  init: RequestInit,
  options: { operation: string; allowNotFound?: boolean },
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${CLOUDFLARE_API}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: controller.signal,
    });
  } catch {
    throw new StatusDomainProviderError("Status domain provisioning is temporarily unavailable", 503);
  } finally {
    clearTimeout(timer);
  }

  if (options.allowNotFound && response.status === 404) return null as T;
  let payload: CloudflareEnvelope<T> | null = null;
  try {
    payload = await response.json() as CloudflareEnvelope<T>;
  } catch {
    // Never pass provider response bodies through to the dashboard.
  }
  if (!response.ok || !payload?.success) {
    const codes = payload?.errors?.map((error) => error.code).filter((code): code is number => typeof code === "number").slice(0, 5) ?? [];
    console.error("[status-domain-provider] Cloudflare operation failed", {
      operation: options.operation,
      status: response.status,
      codes,
    });
    throw new StatusDomainProviderError(
      response.status === 409 ? "Status hostname provisioning conflicts with an existing provider resource" :
        "Status domain provisioning is temporarily unavailable",
      response.status === 409 ? 409 : 503,
      response.status,
      codes,
    );
  }
  return payload.result;
}
