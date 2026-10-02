import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  experimental: {
    // Astro's CSP hash generation runs during builds, not the Vite dev server.
    csp: process.env.NODE_ENV === "production" ? {
      directives: [
        "default-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "object-src 'none'",
        "img-src 'self' https: data:",
        "font-src 'self'",
        "connect-src 'self'",
      ],
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    } : false,
  },
  site: process.env.OUTRAY_STATUS_URL || process.env.STATUS_PUBLIC_URL || "https://status.outray.app",
  server: {
    port: 4323,
    host: process.env.STATUS_BIND_HOST || "127.0.0.1",
  },
});
