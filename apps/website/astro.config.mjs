import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://outray.co",
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    port: 4322,
    allowedHosts: ["outray.outray.app"],
  },
});
