import type { APIRoute } from "astro";
import { createShare, enforceRateLimit, requestClientIp, validOrigin } from "../../../lib/shares";
import { readJsonLimited, RequestTooLarge } from "../../../lib/http";

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!validOrigin(request)) return Response.json({ error: "Invalid request" }, { status: 403 });
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) {
    return Response.json({ error: "Expected JSON" }, { status: 415 });
  }
  try {
    const ip = requestClientIp(request, clientAddress);
    if (!(await enforceRateLimit(ip, "create"))) return Response.json({ error: "Please try later" }, { status: 429 });
    const id = await createShare(await readJsonLimited(request, 400_000));
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestTooLarge) return Response.json({ error: "Share is too large" }, { status: 413 });
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON" }, { status: 400 });
    if (error instanceof Error && /^(Invalid|Choose)/.test(error.message)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: "Could not create share" }, { status: 503 });
  }
};
