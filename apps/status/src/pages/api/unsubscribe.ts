import type { APIRoute } from "astro";
import { isSameOrigin } from "../../lib/security";
import { unsubscribe } from "../../lib/subscriptions";

export const POST: APIRoute = async ({ request }) => {
  if (!isSameOrigin(request)) return new Response("Invalid origin", { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 2_048) return new Response("Request too large", { status: 413 });
  const form = await request.formData();
  const token = form.get("token");
  if (typeof token !== "string") return new Response("Invalid token", { status: 400 });
  const subscriber = await unsubscribe(token);
  if (!subscriber) return new Response("Link expired or subscription inactive", { status: 410 });
  return new Response(null, { status: 303, headers: { Location: "/subscription-ended", "Cache-Control": "no-store" } });
};
