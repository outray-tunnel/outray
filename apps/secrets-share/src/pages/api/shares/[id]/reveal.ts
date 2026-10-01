import type { APIRoute } from "astro";
import { enforceRateLimit, requestClientIp, revealShare, validOrigin } from "../../../../lib/shares";
import { readJsonLimited, RequestTooLarge } from "../../../../lib/http";

export const POST: APIRoute = async ({ request, params, clientAddress }) => {
  if (!validOrigin(request)) return Response.json({ error: "Invalid request" }, { status: 403 });
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) {
    return Response.json({ error: "Expected JSON" }, { status: 415 });
  }
  try {
    const ip = requestClientIp(request, clientAddress);
    if (!(await enforceRateLimit(ip, "reveal"))) return Response.json({ error: "Please try later" }, { status: 429 });
    const body = await readJsonLimited(request, 2_048) as { verifier?: unknown };
    const result = await revealShare(params.id || "", typeof body?.verifier === "string" ? body.verifier : "");
    if (!result) return Response.json({ error: "This link is unavailable" }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    if (error instanceof RequestTooLarge) return Response.json({ error: "This link is unavailable" }, { status: 413 });
    return Response.json({ error: "This link is unavailable" }, { status: 404 });
  }
};
