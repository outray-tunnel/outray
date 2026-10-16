const SNAPSHOT_FORMAT = "outray-status-html-v1";
const SNAPSHOT_KEY_PREFIX = "status-html/v1";
const DEFAULT_MAX_AGE_SECONDS = 5 * 60;
const MAX_MAX_AGE_SECONDS = 60 * 60;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_ENVELOPE_BYTES = MAX_HTML_BYTES + 64 * 1024;

const SAFE_FALLBACK_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' https: data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "script-src 'none'",
].join("; ");

const RESERVED_PATH_SEGMENTS = new Set([
  "api",
  "confirm",
  "confirmation",
  "health",
  "not-found",
  "subscribe",
  "subscription",
  "subscription-confirmed",
  "subscription-ended",
  "token",
  "tokens",
  "unsubscribe",
]);

const PRIVATE_REQUEST_HEADERS = [
  "authorization",
  "cf-access-jwt-assertion",
  "cookie",
  "proxy-authorization",
  "x-api-key",
  "x-auth-token",
] as const;

const PRESERVED_RESPONSE_HEADERS = [
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
  "permissions-policy",
  "referrer-policy",
  "x-content-type-options",
  "x-frame-options",
] as const;

export const STATUS_SNAPSHOT_STALE_HEADER = "X-Outray-Status-Snapshot";

export interface StatusSnapshotObjectBody {
  readonly customMetadata?: Record<string, string>;
  readonly size?: number;
  text(): Promise<string>;
}

/** The subset of R2Bucket used here, kept structural so the Node build needs no Workers types. */
export interface StatusSnapshotBucket {
  get(key: string): Promise<StatusSnapshotObjectBody | null>;
  put(
    key: string,
    value: string,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

export interface StatusSnapshotOptions {
  bucket?: StatusSnapshotBucket;
  waitUntil?: (promise: Promise<unknown>) => void;
  maxAgeSeconds?: number;
}

export interface StatusSnapshotInvalidationTarget {
  host: string;
  path: string;
}

interface SnapshotTarget {
  host: string;
  path: string;
  key: string;
}

interface SnapshotEnvelope {
  format: typeof SNAPSHOT_FORMAT;
  host: string;
  path: string;
  capturedAt: string;
  eligibleUntil: string;
  headers: Record<string, string>;
}

interface StoredSnapshot {
  envelope: SnapshotEnvelope;
  html: string;
}

/**
 * Render a public status route and keep an exact-host, exact-path last-known-good
 * copy in a private R2 bucket. Without a bucket this is a transparent pass-through.
 */
export async function snapshotResponse(
  request: Request,
  next: () => Promise<Response>,
  options: StatusSnapshotOptions,
): Promise<Response> {
  const bucket = options.bucket;
  const target = bucket ? targetFromRequest(request) : null;
  if (!bucket || !target) return next();

  const maxAgeSeconds = boundedMaxAge(options.maxAgeSeconds);
  let response: Response;
  try {
    response = await next();
  } catch (error) {
    const stale = await readSnapshot(bucket, target, maxAgeSeconds, options.waitUntil);
    if (stale) return stale;
    throw error;
  }

  // A missing, unpublished, or redirected page is authoritative. Never replace
  // it with stale HTML, and discard the exact snapshot so a later outage cannot.
  if (response.status === 404 || response.status === 410 || isRedirect(response.status)) {
    await runBestEffort(bucket.delete(target.key), options.waitUntil);
    return response;
  }

  if (response.status >= 500) {
    return await readSnapshot(bucket, target, maxAgeSeconds, options.waitUntil) || response;
  }

  if (!isPublishedHtmlResponse(response, target)) {
    if (response.status === 200) {
      await runBestEffort(bucket.delete(target.key), options.waitUntil);
    }
    return response;
  }

  let clone: Response;
  try {
    clone = response.clone();
  } catch {
    return response;
  }
  const capturedAt = new Date();
  await runBestEffort(
    writeSnapshot(bucket, target, clone, capturedAt, maxAgeSeconds),
    options.waitUntil,
  );
  return response;
}

/**
 * Delete one known host/path snapshot. Container deletion, domain changes, page
 * unpublishing, and incident deletion must enumerate every affected public URL.
 */
export async function invalidateStatusSnapshot(
  bucket: StatusSnapshotBucket | undefined,
  target: StatusSnapshotInvalidationTarget,
): Promise<boolean> {
  if (!bucket) return false;
  const normalized = targetFromParts(target.host, target.path);
  if (!normalized) return false;
  await bucket.delete(normalized.key);
  return true;
}

function targetFromRequest(request: Request): SnapshotTarget | null {
  if (request.method !== "GET") return null;
  if (PRIVATE_REQUEST_HEADERS.some((name) => request.headers.has(name))) return null;
  // URL.search is empty for a bare trailing `?`; inspect the original URL too.
  if (request.url.includes("?")) return null;

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return null;
  return targetFromParts(url.hostname, url.pathname);
}

function targetFromParts(rawHost: string, path: string): SnapshotTarget | null {
  const host = normalizePublicHostname(rawHost);
  if (!host || !isPublicStatusPath(path)) return null;
  const route = path === "/" ? "root" : path.slice(1).split("/").map(encodeURIComponent).join("/");
  return { host, path, key: `${SNAPSHOT_KEY_PREFIX}/${host}/${route}.snapshot` };
}

function normalizePublicHostname(rawHost: string): string | null {
  if (!rawHost || rawHost !== rawHost.trim() || rawHost.length > 253 || rawHost.endsWith(".")) return null;
  const host = rawHost.toLowerCase();
  if (host === "localhost" || host.includes(":")) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
  const labels = host.split(".");
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return host;
}

function isPublicStatusPath(path: string): boolean {
  if (!path.startsWith("/") || path.includes("//")) return false;
  if (path === "/") return true;
  const segments = path.slice(1).split("/");
  if (segments.some((segment) => RESERVED_PATH_SEGMENTS.has(segment))) return false;

  const slug = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
  const incidentId = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  return new RegExp(`^/${slug}$`).test(path) ||
    new RegExp(`^/incidents/${incidentId}$`).test(path) ||
    new RegExp(`^/${slug}/incidents/${incidentId}$`).test(path);
}

function isPublishedHtmlResponse(response: Response, target: SnapshotTarget): boolean {
  if (response.status !== 200 || response.headers.has("set-cookie")) return false;
  const contentType = response.headers.get("content-type") || "";
  if (!/^text\/html(?:\s*;|$)/i.test(contentType)) return false;
  const cacheControl = response.headers.get("cache-control") || "";
  if (/(?:^|,)\s*(?:private|no-store)(?:\s|,|=|$)/i.test(cacheControl)) return false;

  const vary = (response.headers.get("vary") || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (vary.some((value) => value !== "accept-encoding")) return false;

  if (response.url) {
    let responseUrl: URL;
    try {
      responseUrl = new URL(response.url);
    } catch {
      return false;
    }
    if (responseUrl.hostname.toLowerCase() !== target.host || responseUrl.pathname !== target.path || responseUrl.search) {
      return false;
    }
  }

  const contentLocation = response.headers.get("content-location");
  if (contentLocation) {
    let located: URL;
    try {
      located = new URL(contentLocation, `https://${target.host}${target.path}`);
    } catch {
      return false;
    }
    if (located.hostname.toLowerCase() !== target.host || located.pathname !== target.path || located.search) return false;
  }
  return true;
}

async function writeSnapshot(
  bucket: StatusSnapshotBucket,
  target: SnapshotTarget,
  response: Response,
  capturedAt: Date,
  maxAgeSeconds: number,
): Promise<void> {
  const body = await readHtmlWithinLimit(response);
  if (!body) return;
  const capturedAtIso = capturedAt.toISOString();
  const eligibleUntil = new Date(capturedAt.getTime() + maxAgeSeconds * 1_000).toISOString();
  const envelope: SnapshotEnvelope = {
    format: SNAPSHOT_FORMAT,
    host: target.host,
    path: target.path,
    capturedAt: capturedAtIso,
    eligibleUntil,
    headers: preservedHeaders(response.headers),
  };
  const serialized = `${JSON.stringify(envelope)}\n${body}`;
  if (new TextEncoder().encode(serialized).byteLength > MAX_ENVELOPE_BYTES) return;
  await bucket.put(target.key, serialized, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: {
      format: SNAPSHOT_FORMAT,
      host: target.host,
      path: target.path,
      capturedAt: capturedAtIso,
      eligibleUntil,
    },
  });
}

async function readHtmlWithinLimit(response: Response): Promise<string | null> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_HTML_BYTES) return null;
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      length += value.byteLength;
      if (length > MAX_HTML_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return /<body\b[^>]*>/i.test(html) ? html : null;
  } catch {
    return null;
  }
}

function preservedHeaders(headers: Headers): Record<string, string> {
  const preserved: Record<string, string> = {};
  for (const name of PRESERVED_RESPONSE_HEADERS) {
    const value = headers.get(name);
    if (value && value.length <= 16_384) preserved[name] = value;
  }
  return preserved;
}

async function readSnapshot(
  bucket: StatusSnapshotBucket,
  target: SnapshotTarget,
  maxAgeSeconds: number,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<Response | null> {
  let object: StatusSnapshotObjectBody | null;
  try {
    object = await bucket.get(target.key);
  } catch {
    return null;
  }
  if (!object) return null;
  if (typeof object.size === "number" && object.size > MAX_ENVELOPE_BYTES) {
    await runBestEffort(bucket.delete(target.key), waitUntil);
    return null;
  }

  let stored: StoredSnapshot | null = null;
  try {
    stored = parseStoredSnapshot(await object.text());
  } catch {
    // A snapshot failure must not replace the renderer's original error.
  }
  if (!stored || !validStoredSnapshot(stored, object.customMetadata, target, maxAgeSeconds)) {
    await runBestEffort(bucket.delete(target.key), waitUntil);
    return null;
  }

  const html = addStaleNotice(stored.html, stored.envelope.capturedAt);
  if (!html) {
    await runBestEffort(bucket.delete(target.key), waitUntil);
    return null;
  }
  const headers = responseHeaders(stored.envelope);
  return new Response(html, { status: 200, headers });
}

function parseStoredSnapshot(serialized: string): StoredSnapshot | null {
  if (new TextEncoder().encode(serialized).byteLength > MAX_ENVELOPE_BYTES) return null;
  const separator = serialized.indexOf("\n");
  if (separator <= 0 || separator > 64 * 1024) return null;
  let envelope: unknown;
  try {
    envelope = JSON.parse(serialized.slice(0, separator));
  } catch {
    return null;
  }
  if (!envelope || typeof envelope !== "object") return null;
  const html = serialized.slice(separator + 1);
  if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) return null;
  return { envelope: envelope as SnapshotEnvelope, html };
}

function validStoredSnapshot(
  stored: StoredSnapshot,
  metadata: Record<string, string> | undefined,
  target: SnapshotTarget,
  maxAgeSeconds: number,
): boolean {
  const envelope = stored.envelope;
  if (envelope.format !== SNAPSHOT_FORMAT || envelope.host !== target.host || envelope.path !== target.path) return false;
  if (!/<body\b[^>]*>/i.test(stored.html)) return false;
  if (!validPreservedHeaders(envelope.headers)) return false;

  if (!metadata || metadata.format !== SNAPSHOT_FORMAT || metadata.host !== target.host || metadata.path !== target.path ||
      metadata.capturedAt !== envelope.capturedAt || metadata.eligibleUntil !== envelope.eligibleUntil) return false;

  const capturedAt = Date.parse(envelope.capturedAt);
  const eligibleUntil = Date.parse(envelope.eligibleUntil);
  const now = Date.now();
  if (!Number.isFinite(capturedAt) || !Number.isFinite(eligibleUntil)) return false;
  if (new Date(capturedAt).toISOString() !== envelope.capturedAt || new Date(eligibleUntil).toISOString() !== envelope.eligibleUntil) return false;
  if (capturedAt > now + 60_000 || eligibleUntil <= capturedAt) return false;
  const configuredExpiry = capturedAt + maxAgeSeconds * 1_000;
  const absoluteExpiry = capturedAt + MAX_MAX_AGE_SECONDS * 1_000;
  return now <= Math.min(eligibleUntil, configuredExpiry, absoluteExpiry);
}

function validPreservedHeaders(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const allowed = new Set<string>(PRESERVED_RESPONSE_HEADERS);
  for (const [name, headerValue] of Object.entries(value)) {
    if (!allowed.has(name) || typeof headerValue !== "string" || headerValue.length > 16_384 || /[\r\n]/.test(headerValue)) {
      return false;
    }
  }
  return true;
}

function responseHeaders(envelope: SnapshotEnvelope): Headers {
  const headers = new Headers(envelope.headers);
  if (!headers.has("content-security-policy")) headers.set("Content-Security-Policy", SAFE_FALLBACK_CSP);
  if (!headers.has("x-content-type-options")) headers.set("X-Content-Type-Options", "nosniff");
  if (!headers.has("x-frame-options")) headers.set("X-Frame-Options", "DENY");
  if (!headers.has("referrer-policy")) headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set(STATUS_SNAPSHOT_STALE_HEADER, "stale");
  headers.set("X-Outray-Status-Snapshot-At", envelope.capturedAt);
  headers.set("Warning", '110 - "Response is stale"');
  return headers;
}

function addStaleNotice(html: string, capturedAt: string): string | null {
  const body = /<body\b[^>]*>/i.exec(html);
  if (!body || body.index === undefined) return null;
  const label = capturedAt.replace("T", " ").replace(/\.000Z$/, " UTC").replace(/Z$/, " UTC");
  const notice = [
    '<aside role="status" aria-live="polite" data-outray-stale-snapshot ',
    'style="box-sizing:border-box;margin:0;padding:12px 20px;border-bottom:1px solid rgba(245,158,11,.35);',
    'background:#1c1608;color:#fde68a;font:500 14px/1.5 ui-sans-serif,system-ui,sans-serif;text-align:center">',
    "Live status is temporarily unavailable. Showing the last saved status from ",
    `<time datetime="${capturedAt}">${label}</time>.`,
    "</aside>",
  ].join("");
  const insertion = body.index + body[0].length;
  return `${html.slice(0, insertion)}${notice}${html.slice(insertion)}`;
}

function boundedMaxAge(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAX_AGE_SECONDS;
  return Math.min(Math.max(Math.floor(value), 1), MAX_MAX_AGE_SECONDS);
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

async function runBestEffort(
  promise: Promise<unknown>,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<void> {
  const settled = promise.then(() => undefined, () => undefined);
  if (waitUntil) {
    try {
      waitUntil(settled);
    } catch {
      // A disposed execution context must not change the rendered response.
    }
    return;
  }
  await settled;
}
