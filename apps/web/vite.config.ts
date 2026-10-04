import { defineConfig, loadEnv } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import mdx from "fumadocs-mdx/vite";
import * as MdxConfig from "./source.config";
import tsconfigPaths from "vite-tsconfig-paths";
import outray from "@outray/vite";

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    envPrefix: ["VITE_", "PUBLIC_"],
    plugins: [
      tanstackStart(),
      // Nitro's alpha dev proxy can leak rejected request promises during reloads.
      // Use TanStack's native dev handler; retain Nitro for production packaging.
      ...(command === "build"
        ? [nitro({ externals: { inline: ["decimal.js-light"] } })]
        : []),
      viteReact(),
      tailwindcss(),
      mdx(MdxConfig),
      tsconfigPaths({
        projects: ["./tsconfig.json"],
      }),
      outray({
        customDomain: env.TUNNEL_DOMAIN,
        apiKey: env.OUTRAY_API_KEY,
      }),
    ],
    server: {
      allowedHosts: true,
      port: Number(env.WEB_PORT || 6767),
    },
  };
});
