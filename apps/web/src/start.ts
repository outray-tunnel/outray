import { createMiddleware, createStart } from "@tanstack/react-start";
import { instancePathAvailable } from "../../../shared/instance-config";

const instancePolicy = createMiddleware().server(({ request, next }) => {
  const pathname = new URL(request.url).pathname;
  if (!instancePathAvailable(pathname)) {
    return Response.json({ error: "This feature is disabled on this installation" }, {
      status: 404, headers: { "Cache-Control": "no-store" },
    });
  }
  return next();
});

export const startInstance = createStart(() => ({ requestMiddleware: [instancePolicy] }));
