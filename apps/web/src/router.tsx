import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    getScrollRestorationKey: (location) => /\/uptime\/incidents\/?$/.test(location.pathname)
      ? location.href
      : location.state.__TSR_key || location.href,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
