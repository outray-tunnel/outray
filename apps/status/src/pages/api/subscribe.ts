import type { APIRoute } from "astro";
import { requestSubscription } from "../../lib/subscriptions";
import { getStatusConfig, statusPageUrl } from "../../lib/config";
import { isSameOrigin, safeClientIp } from "../../lib/security";
import { findPageForRequest, findPublishedPageById } from "../../lib/status-data";

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const config = getStatusConfig();
  if (!config.enabled) return new Response("Unavailable", { status: 503 });
  if (process.env.NODE_ENV === "production" &&
      request.headers.get("x-outray-edge-secret") !== config.edgeSecret) {
    return new Response("Unavailable", { status: 503 });
  }
  if (!isSameOrigin(request)) return new Response("Invalid origin", { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 4_096) {
    return new Response("Request too large", { status: 413 });
  }
  const form = await request.formData();
  const pageId = form.get("pageId");
  const email = form.get("email");
  if (typeof pageId !== "string" || typeof email !== "string" || pageId.length > 100) {
    return new Response("Invalid subscription", { status: 400 });
  }
  const page = await findPublishedPageById(pageId);
  if (!page) return new Response("Page not found", { status: 404 });
  if (process.env.NODE_ENV === "production") {
    const hostPage = await findPageForRequest(request, null);
    if (hostPage?.id !== page.id) return new Response("Page not found", { status: 404 });
  }
  try {
    await requestSubscription(pageId, email, safeClientIp(request, clientAddress));
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid email address") {
      return new Response("Invalid email address", { status: 400 });
    }
    // Do not log addresses, tokens, request bodies, or mail-provider responses.
    console.error("[Status] Subscription request failed", error instanceof Error ? error.name : "unknown error");
  }
  // Give the same public result for a new, confirmed, full, rate-limited, or
  // temporarily undeliverable address. Otherwise this endpoint is an email
  // subscription oracle, especially once a page reaches its quota.
  const target = statusPageUrl(page.slug, config);
  target.searchParams.set("subscribed", "1");
  return Response.redirect(target, 303);
};
