import type { APIRoute } from "astro";
import { allowAnalyticsEvent, analyticsEventInput, analyticsRetention, appendAnalyticsEvent, shouldTrack, visitorHash } from "../../lib/analytics";
import { getStatusConfig } from "../../lib/config";
import { getStatusRuntime, isStatusProduction } from "../../lib/runtime";
import { isSameOrigin, safeClientIp } from "../../lib/security";
import { findPageForRequest } from "../../lib/status-data";
import { readAnalyticsBody } from "../../lib/analytics-body";

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const empty = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  const config = getStatusConfig();
  if (!config.enabled || !shouldTrack(request)) return empty();
  if (!request.headers.get("origin") || !isSameOrigin(request) ||
      request.headers.get("sec-fetch-site") === "cross-site") return empty();
  if (isStatusProduction() && !getStatusRuntime() &&
      request.headers.get("x-outray-edge-secret") !== config.edgeSecret) return empty();
  try {
    const ip = safeClientIp(request, clientAddress);
    // Limit before database lookups; the limiter never retains the raw address.
    const rateKey = visitorHash(config.rateLimitSecret || (!isStatusProduction() ? "local-development-only" : ""), "analytics-rate", ip, "");
    if (!rateKey || !allowAnalyticsEvent(rateKey)) return empty();
    const body = await readAnalyticsBody(request);
    if (!body || typeof body !== "object") return empty();
    const slug = !isStatusProduction() && body && typeof body === "object" && "slug" in body && typeof body.slug === "string" ? body.slug : null;
    const page = await findPageForRequest(request, slug);
    if (!page) return empty();
    const input = analyticsEventInput(body, page.slug);
    if (!input) return empty();
    const retention = await analyticsRetention(page.organization_id);
    if (retention === null) return empty();
    // Await completion on both runtimes. No detached promises lost when a
    // Worker/request ends; this endpoint never blocks public HTML rendering.
    await appendAnalyticsEvent(page, input, request, ip, retention);
  } catch {
    // Never log IPs, user agents, referrers, credentials or provider responses.
    console.warn("status_analytics_unavailable");
  }
  // Do not expose publication, paid-plan or ingestion state to a public caller.
  return empty();
};
