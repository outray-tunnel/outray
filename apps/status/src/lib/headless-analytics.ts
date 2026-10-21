import policy from "../../../../shared/status-headless";
import { allowAnalyticsEvent, analyticsEventInput, analyticsRetention, appendAnalyticsEvent, shouldTrack, visitorHash } from "./analytics";
import { readAnalyticsBody } from "./analytics-body";
import { getStatusConfig } from "./config";
import { getStatusRuntime, isStatusProduction } from "./runtime";
import { safeClientIp } from "./security";
import { findPublishedPageById } from "./status-data";

export async function collectHeadlessAnalytics(request: Request, pageId: string | undefined, clientAddress?: string): Promise<Response> {
  let allowedOrigin: string | undefined;
  const empty = () => new Response(null, { status: 204, headers: {
    "Cache-Control": "no-store", Vary: "Origin",
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } : {}),
  } });
  try {
    const config = getStatusConfig();
    if (!config.enabled || !policy.PUBLIC_STATUS_ID.test(pageId || "")) return empty();
    const origin = request.headers.get("origin");
    const normalized = origin ? policy.normalizeAnalyticsOrigins([origin], !isStatusProduction()) : null;
    if (!normalized || normalized.length !== 1 || normalized[0] !== origin) return empty();
    if (isStatusProduction() && !getStatusRuntime() && request.headers.get("x-outray-edge-secret") !== config.edgeSecret) return empty();
    const ip = safeClientIp(request, clientAddress);
    const rateKey = visitorHash(config.rateLimitSecret || (!isStatusProduction() ? "local-development-only" : ""), "analytics-rate", ip, "");
    if (!rateKey || !allowAnalyticsEvent(rateKey)) return empty();
    if (request.method !== "OPTIONS" && !shouldTrack(request)) return empty();
    const input = request.method === "OPTIONS" ? null : analyticsEventInput(await readAnalyticsBody(request), "", true);
    if (request.method !== "OPTIONS" && !input) return empty();
    const page = await findPublishedPageById(pageId!);
    if (!page || !page.analytics_origins?.includes(origin!)) return empty();
    allowedOrigin = origin!;
    if (request.method === "OPTIONS") return empty();
    const retention = await analyticsRetention(page.organization_id);
    if (retention === null) return empty();
    await appendAnalyticsEvent(page, input!, request, ip, retention, origin!);
  } catch {
    console.warn("headless_status_analytics_unavailable");
  }
  return empty();
}
