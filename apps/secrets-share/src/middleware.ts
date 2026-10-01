import { defineMiddleware } from "astro:middleware";
import { createHash } from "node:crypto";
import { purgeExpiredShares } from "./lib/shares";

let cleanupStarted = false;

export const onRequest = defineMiddleware(async (context, next) => {
  if (!cleanupStarted && process.env.SHARE_DATABASE_URL) {
    cleanupStarted = true;
    void purgeExpiredShares().catch(() => {});
    const timer = setInterval(() => void purgeExpiredShares().catch(() => {}), 60 * 60 * 1000);
    timer.unref();
  }
  // This app does not use Astro server islands or image optimization. Deny
  // their framework endpoints, including before the island body parser runs.
  const pathname = context.url.pathname;
  const blocked = pathname === "/_image" || pathname.startsWith("/_server-islands/");
  const upstream = blocked ? new Response("Not found", { status: 404 }) : await next();
  // Astro injects small inline island bootstraps. Hash exactly those bytes so
  // hydration works without permitting arbitrary inline JavaScript.
  const isHtml = upstream.headers.get("content-type")?.includes("text/html") ?? false;
  const html = isHtml ? await upstream.text() : null;
  const response = html === null ? upstream : new Response(html, upstream);
  const scriptHashes = html ? Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
    .filter((match) => !!match[1])
    .map((match) => `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`)
    .join(" ") : "";
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Content-Security-Policy", `default-src 'none'; script-src 'self' ${scriptHashes}; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
  return response;
});
