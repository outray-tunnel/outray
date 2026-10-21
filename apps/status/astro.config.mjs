import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

const worker = process.env.OUTRAY_STATUS_RUNTIME === "cloudflare";

export default defineConfig({
  output: "server",
  compressHTML: true,
  outDir: worker ? "./dist-worker" : "./dist",
  adapter: worker ? cloudflare({
    imageService: "compile",
  }) : node({ mode: "standalone" }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // Workspace dependencies are hoisted with their own React peer. Keep the
    // renderer, islands and Motion on this app's pinned React runtime in dev
    // and bundle Motion for SSR so Node cannot resolve the hoisted peer itself.
    resolve: { dedupe: ["react", "react-dom"] },
    // Dependency prebundling is for the dev server. Keep React's prebundled
    // runtime in development too: TSX uses jsxDEV here, which the production
    // react/jsx-dev-runtime intentionally does not export.
    optimizeDeps: {
      rolldownOptions: {
        transform: { define: { "process.env.NODE_ENV": JSON.stringify("development") } },
      },
    },
    // Bundle the whole Motion family: standalone installs must not pair a
    // bundled framer-motion with a different external motion-dom version.
    ssr: { noExternal: ["motion", "framer-motion", "motion-dom", "motion-utils"] },
  },
  security: {
    // Cross-origin headless analytics is intentional. Middleware retains the
    // same-origin write guard everywhere else; the collector checks its allowlist.
    checkOrigin: false,
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
