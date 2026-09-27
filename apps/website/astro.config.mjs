import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import dotenv from "dotenv";

dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

const site = process.env.PUBLIC_SITE_URL?.trim();
if (!site) {
  throw new Error("PUBLIC_SITE_URL must be set for the OutRay website.");
}

export default defineConfig({
  site,
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    port: 4322,
    allowedHosts: ["outray.outray.app"],
  },
});
