import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  site: process.env.OUTRAY_STATUS_URL || process.env.STATUS_PUBLIC_URL || "https://status.outray.app",
  server: {
    port: 4323,
    host: process.env.STATUS_BIND_HOST || "127.0.0.1",
  },
});
