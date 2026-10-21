import { defineMiddleware } from "astro:middleware";
import { getStatusRuntime } from "./lib/runtime";
import { snapshotResponse } from "./lib/snapshots";
import { isSameOrigin } from "./lib/security";
import headlessPolicy from "../../../shared/status-headless";

export const onRequest = defineMiddleware(async (context, next) => {
  const startedAt = Date.now();
  // Status pages do not optimize user-provided images through Astro. Keep its
  // Sharp-backed image endpoint unreachable on the Node runtime as well.
  if (context.url.pathname === "/_image") {
    return new Response("Not found", { status: 404 });
  }
  const analyticsPage = context.url.pathname.match(/^\/api\/v1\/pages\/([^/]+)\/analytics\/?$/)?.[1];
  const headlessPost = context.request.method === "POST" && !!analyticsPage && headlessPolicy.PUBLIC_STATUS_ID.test(analyticsPage);
  const contentType = context.request.headers.get("content-type")?.toLowerCase();
  const formLike = !contentType || ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"].some((type) => contentType.includes(type));
  const invalidOrigin = context.request.headers.has("origin") ? !isSameOrigin(context.request) : formLike;
  if (!["GET", "HEAD", "OPTIONS"].includes(context.request.method) && !headlessPost && invalidOrigin) {
    return new Response("Invalid origin", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const respond = async () => {
    const response = await next();
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("X-Frame-Options", "DENY");
    if (import.meta.env.PROD) {
      // Astro provides hashes for its inline hydration scripts on HTML responses.
      // Preserve those hashes; replacing the policy with script-src 'none' leaves
      // the status charts stuck on their gray server-rendered placeholder.
      const astroPolicy = response.headers.get("Content-Security-Policy");
      response.headers.set("Content-Security-Policy", astroPolicy
        ? `${astroPolicy.replace(/;\s*$/, "")}; frame-ancestors 'none'`
        : "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'none'");
    }
    return response;
  };
  const runtime = getStatusRuntime();
  try {
    const response = runtime
      ? await snapshotResponse(context.request, respond, {
          bucket: runtime.env.STATUS_SNAPSHOTS,
          waitUntil: runtime.waitUntil,
        })
      : await respond();
    console.info("status_request", {
      method: context.request.method,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    console.error("status_request_failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    throw error;
  }
});
