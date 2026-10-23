import { createMiddleware, createStart } from "@tanstack/react-start";
import { instancePathAvailable } from "../../../shared/instance-config";

const instancePolicy = createMiddleware().server(async ({ request, next }) => {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/.well-known/")) {
    const { handleMcpWellKnown } = await import("./lib/mcp/well-known");
    const response = await handleMcpWellKnown(request);
    if (response) return response;
  }
  if (!instancePathAvailable(pathname)) {
    return Response.json({ error: "This feature is disabled on this installation" }, {
      status: 404, headers: { "Cache-Control": "no-store" },
    });
  }
  return next();
});

export const startInstance = createStart(() => ({ requestMiddleware: [instancePolicy] }));
