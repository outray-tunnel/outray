import { handle } from "@astrojs/cloudflare/handler";
import { withStatusRuntime, type StatusWorkerEnv } from "./lib/runtime";

export default {
  async fetch(
    request: Parameters<typeof handle>[0],
    env: Parameters<typeof handle>[1] & StatusWorkerEnv,
    ctx: Parameters<typeof handle>[2],
  ) {
    return withStatusRuntime({
      env,
      // Astro's adapter types use Workers' Request, while the shared Node
      // renderer uses the DOM Request shape. This is the runtime boundary.
      request: request as unknown as Request,
      waitUntil: (promise) => ctx.waitUntil(promise),
    }, () => handle(request, env, ctx));
  },
};
