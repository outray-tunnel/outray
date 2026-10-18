import { defineMiddleware } from "astro:middleware";
import { withStatusRuntime } from "./lib/runtime";
import { snapshotResponse } from "./lib/snapshots";

export const onRequest = defineMiddleware(async (context, next) => {
  // Status pages do not optimize user-provided images through Astro. Keep its
  // Sharp-backed image endpoint unreachable on the Node runtime as well.
  if (context.url.pathname === "/_image") {
    return new Response("Not found", { status: 404 });
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
  const runtime = context.locals.runtime;
  if (runtime?.env && typeof runtime.ctx?.waitUntil === "function") {
    return withStatusRuntime({
      env: runtime.env,
      request: context.request,
      waitUntil: (promise) => runtime.ctx.waitUntil(promise),
    }, () => snapshotResponse(context.request, respond, {
      bucket: runtime.env.STATUS_SNAPSHOTS,
      waitUntil: (promise) => runtime.ctx.waitUntil(promise),
    }));
  }
  return respond();
});
