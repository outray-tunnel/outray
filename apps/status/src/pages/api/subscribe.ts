import type { APIRoute } from "astro";
import { requestSubscription } from "../../lib/subscriptions";
import { getStatusConfig, statusPageUrl } from "../../lib/config";
import { isSameOrigin, safeClientIp } from "../../lib/security";
import { findPageForRequest, findPublishedPageById } from "../../lib/status-data";

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const wantsJson = request.headers.get("accept")?.includes("application/json") ?? false;
  const failure = (message: string, status: number) => wantsJson
    ? Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
    : new Response(message, { status, headers: { "Cache-Control": "no-store" } });
  const config = getStatusConfig();
  if (!config.enabled) return failure("Unavailable", 503);
  if (process.env.NODE_ENV === "production" &&
      request.headers.get("x-outray-edge-secret") !== config.edgeSecret) {
    return failure("Unavailable", 503);
  }
  if (!isSameOrigin(request)) return failure("Invalid origin", 403);
  if (Number(request.headers.get("content-length") || 0) > 4_096) {
    return failure("Request too large", 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return failure("Invalid subscription", 400);
  }
  const pageId = form.get("pageId");
  const email = form.get("email");
  if (typeof pageId !== "string" || typeof email !== "string" || pageId.length > 100) {
    return failure("Invalid subscription", 400);
  }
  const page = await findPublishedPageById(pageId);
  if (!page) return failure("Page not found", 404);
  if (process.env.NODE_ENV === "production") {
    const hostPage = await findPageForRequest(request, null);
    if (hostPage?.id !== page.id) return failure("Page not found", 404);
  }
  const paused = () => failure("Subscriptions are currently turned off for this status page.", 409);
  if (!page.subscriptions_enabled) return paused();
  try {
    const result = await requestSubscription(pageId, email, safeClientIp(request, clientAddress));
    if (result === "disabled") return paused();
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid email address") {
      return failure("Invalid email address", 400);
    }
    // Do not log addresses, tokens, request bodies, or mail-provider responses.
    console.error("[Status] Subscription request failed", error instanceof Error ? error.name : "unknown error");
  }
  // Give the same public result for a new, confirmed, full, rate-limited, or
  // temporarily undeliverable address. Otherwise this endpoint is an email
  // subscription oracle, especially once a page reaches its quota.
  if (wantsJson) return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  const target = statusPageUrl(page.slug, config);
  // Keep the progressive-enhancement fallback on the same local renderer too.
  if (process.env.NODE_ENV !== "production") {
    const current = new URL(request.url);
    if (current.hostname === "localhost" || current.hostname === "127.0.0.1") {
      target.host = current.host;
      target.protocol = current.protocol;
      target.pathname = `/${page.slug}`;
    }
  }
  target.searchParams.set("subscribed", "1");
  return Response.redirect(target, 303);
};
