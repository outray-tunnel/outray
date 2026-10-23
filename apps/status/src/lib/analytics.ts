import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import planPolicy from "../../../../shared/hosted-plan-limits";
import instancePolicy from "../../../../shared/instance-config";
import { query, getPool } from "./db";
import statusAnalyticsOutbox from "../../../../shared/status-analytics-outbox";
const { admitStatusAnalytics, deliverStatusAnalyticsOutbox } = statusAnalyticsOutbox;
import { getStatusConfig } from "./config";
import { getStatusRuntime, isStatusProduction, statusEnvironment } from "./runtime";

const BOT = /bot|crawler|spider|headless|preview|facebookexternalhit|slurp|monitor|uptime|curl|wget/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function analyticsEventInput(value: unknown, slug: string, customPaths = false) {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.eventId !== "string" || !UUID.test(body.eventId) || typeof body.path !== "string") return null;
  let path = body.path;
  if (customPaths) {
    if (path.length > 2048 || !path.startsWith("/") || path.startsWith("//") || /[\\?#\u0000-\u001f\u007f]/.test(path)) return null;
  } else {
    if (path === `/${slug}` || path === `/${slug}/`) path = "/";
    else if (path.startsWith(`/${slug}/incidents/`)) path = path.slice(slug.length + 1);
    if (path !== "/" && (!path.startsWith("/incidents/") || !UUID.test(path.slice(11)))) return null;
  }
  let referrer = "";
  if (typeof body.referrer === "string" && body.referrer.length <= 2048) {
    try {
      const url = new URL(body.referrer);
      if (["https:", "http:"].includes(url.protocol)) referrer = url.hostname.toLowerCase();
    } catch { /* Direct visit or invalid referrer; never retain the raw URL. */ }
  }
  return { eventId: body.eventId, path, referrer };
}

export function shouldTrack(request: Request) {
  return request.headers.get("dnt") !== "1" && request.headers.get("sec-gpc") !== "1" &&
    !BOT.test(request.headers.get("user-agent") || "") &&
    !/prefetch|prerender/i.test(`${request.headers.get("purpose") || ""} ${request.headers.get("sec-purpose") || ""}`);
}

export function visitorHash(secret: string, pageId: string, ip: string, userAgent: string, now = new Date()) {
  if (!secret || !isIP(ip)) return "";
  return createHmac("sha256", secret).update(JSON.stringify([
    "status-analytics-v1", now.toISOString().slice(0, 10), pageId, ip, userAgent.slice(0, 512),
  ])).digest("hex");
}

/** Best-effort per-process abuse protection, bounded even with arbitrary addresses.
 * Edge-wide rate limits can additionally be applied at the reverse proxy. */
const rateWindows = new Map<string, { minute: number; count: number }>();
export function allowAnalyticsEvent(key: string, now = Date.now()) {
  const minute = Math.floor(now / 60_000);
  if (rateWindows.size >= 10_000) {
    for (const [id, item] of rateWindows) if (item.minute !== minute) rateWindows.delete(id);
    if (rateWindows.size >= 10_000 && !rateWindows.has(key)) return false;
  }
  const previous = rateWindows.get(key);
  const current = previous?.minute === minute ? previous : { minute, count: 0 };
  rateWindows.set(key, current);
  return ++current.count <= 20;
}

export async function analyticsRetention(organizationId: string): Promise<number | null> {
  const instance = instancePolicy.instanceConfig(statusEnvironment());
  if (instance.selfHosted) return instance.retentionDays;
  const rows = await query<{ plan: string }>("SELECT plan FROM subscriptions WHERE organization_id = $1 LIMIT 1", [organizationId]);
  const limits = planPolicy.HOSTED_PLAN_LIMITS[planPolicy.resolveHostedPlan(rows[0]?.plan)];
  return limits.statusAnalytics ? Math.min(90, limits.retentionDays) : null;
}

export async function appendAnalyticsEvent(page: { id: string; organization_id: string }, input: NonNullable<ReturnType<typeof analyticsEventInput>>, request: Request, ip: string, retentionDays: number, sourceOrigin?: string) {
  const env = statusEnvironment();
  if (!env.TINYBIRD_API_HOST || !env.TINYBIRD_INGEST_TOKEN) throw new Error("Status analytics is not configured");
  const now = new Date();
  const secret = getStatusConfig().rateLimitSecret;
  if (isStatusProduction() && !secret) throw new Error("Analytics visitor hashing is not configured");
  const visitor = visitorHash(secret || "local-development-only", page.id, ip, request.headers.get("user-agent") || "", now);
  if (!visitor) return;
  // Only the Worker adapter establishes trust in Cloudflare metadata. VPS
  // headers can be user supplied; leave country unknown on that runtime.
  const country = (getStatusRuntime()?.request as (Request & { cf?: { country?: string } }) | undefined)?.cf?.country || "";
  const event = {
    timestamp: now.toISOString().replace("T", " ").replace("Z", ""),
    event_id: input.eventId, organization_id: page.organization_id, page_id: page.id,
    visitor_hash: visitor, path: input.path,
    referrer: input.referrer === new URL(sourceOrigin || request.url).hostname ? "" : input.referrer,
    country: /^[A-Z]{2}$/.test(country) && !["XX", "T1"].includes(country) ? country : "",
    retention_days: retentionDays,
  };
  const pool = getPool();
  const accepted = await admitStatusAnalytics(pool, event, now);
  if (accepted) {
    // Preserve the existing immediate export, but a transient delivery outage
    // cannot lose an accepted visit or make its permanent count disappear.
    try { await deliverStatusAnalyticsOutbox(pool, { environment: env, limit: 1, pageId: page.id, eventId: input.eventId }); }
    catch { console.error("[Status analytics] Accepted view remains queued for delivery"); }
  }
}
