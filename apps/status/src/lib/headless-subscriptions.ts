import policy from "../../../../shared/status-headless";
import { getStatusConfig } from "./config";
import { readJsonBody, RequestBodyError } from "./request-body";
import { getStatusRuntime, isStatusProduction } from "./runtime";
import { normalizeEmail, safeClientIp } from "./security";
import { findPublishedPageById } from "./status-data";
import { requestSubscription } from "./subscriptions";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

/** Public, credential-free double opt-in; never expose an address's subscription state. */
export async function subscribeHeadless(request: Request, pageId: string | undefined, clientAddress?: string): Promise<Response> {
  const error = (status: number, code: string) => Response.json({ error: code }, { status, headers });
  try {
    const config = getStatusConfig();
    if (!config.enabled) return error(503, "status_unavailable");
    if (!policy.PUBLIC_STATUS_ID.test(pageId || "")) return error(404, "not_found");
    if (isStatusProduction() && !getStatusRuntime() &&
        (!config.edgeSecret || request.headers.get("x-outray-edge-secret") !== config.edgeSecret)) {
      return error(503, "status_unavailable");
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...headers, Allow: "POST, OPTIONS" } });
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return error(415, "unsupported_media_type");
    }
    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        !("email" in body) || typeof body.email !== "string") return error(400, "invalid_subscription");
    const email = normalizeEmail(body.email);
    if (!email) return error(400, "invalid_email");
    const page = await findPublishedPageById(pageId!);
    if (!page) return error(404, "not_found");
    if (!page.subscriptions_enabled) return error(409, "subscriptions_disabled");
    const ip = safeClientIp(request, clientAddress);
    try {
      const result = await requestSubscription(page.id, email, ip);
      if (result === "disabled") return error(409, "subscriptions_disabled");
    } catch {
      // Match hosted signup: quota, throttling and provider failures must not
      // reveal whether this email is already subscribed. Never log the payload.
      console.warn("headless_subscription_request_failed");
    }
    return Response.json({ ok: true }, { headers });
  } catch (cause) {
    if (cause instanceof RequestBodyError) return error(cause.status, cause.message);
    console.warn("headless_subscription_unavailable");
    return error(503, "status_unavailable");
  }
}
