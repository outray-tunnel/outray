import { defineConfig, loadEnv } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import mdx from "fumadocs-mdx/vite";
import * as MdxConfig from "./source.config";
import tsconfigPaths from "vite-tsconfig-paths";
import outray from "@outray/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      tsConfigPaths(),
      tanstackStart(),
      nitro(),
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
    },
  };
});
