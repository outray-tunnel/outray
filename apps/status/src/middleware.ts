import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  if (import.meta.env.PROD) {
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'none'",
    );
  }
  return response;
});
