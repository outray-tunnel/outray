import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (_context, next) => {
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
});
