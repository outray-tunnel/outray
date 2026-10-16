import type { SSRManifest } from "astro";
import { App } from "astro/app";
import { handle } from "@astrojs/cloudflare/handler";
import { withStatusRuntime, type StatusWorkerEnv } from "./lib/runtime";

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest);
  return {
    default: {
      async fetch(
        request: Parameters<typeof handle>[2],
        env: Parameters<typeof handle>[3] & StatusWorkerEnv,
        ctx: Parameters<typeof handle>[4],
      ) {
        return withStatusRuntime({
          env,
          // Astro's adapter types use Workers' Request, while the shared Node
          // renderer uses the DOM Request shape. This is the runtime boundary.
          request: request as unknown as Request,
          waitUntil: (promise) => ctx.waitUntil(promise),
        }, () => handle(manifest, app, request, env, ctx));
      },
    },
  };
}
