import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getCachedAuthSession } from "./auth-session-cache";

/** Resolve the console entry point without returning session data to the browser. */
export const getSelfHostedHomeDestination = createServerFn({ method: "GET" }).handler(async () => {
  const { auth } = await import("./auth");
  const session = await getCachedAuthSession(getRequest(), (request) =>
    auth.api.getSession({ headers: request.headers }),
  );
  return session?.user ? "/select" : "/login";
});
