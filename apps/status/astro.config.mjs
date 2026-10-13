import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // Workspace dependencies are hoisted with their own React peer. Keep the
    // renderer, islands and Motion on this app's pinned React runtime in dev
    // and bundle Motion for SSR so Node cannot resolve the hoisted peer itself.
    resolve: { dedupe: ["react", "react-dom"] },
    ssr: { noExternal: ["motion", "framer-motion"] },
  },
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
