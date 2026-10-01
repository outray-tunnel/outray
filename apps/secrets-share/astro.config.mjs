import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  site: process.env.SHARE_PUBLIC_ORIGIN || "http://localhost:4324",
  server: {
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT || 4324),
  },
});
