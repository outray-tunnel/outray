import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAccess } from "@/lib/secrets/access";
import { withSecretsErrors } from "@/lib/secrets/http";
import { getOverview } from "@/lib/secrets/projects";

export const Route = createFileRoute("/api/$orgSlug/secrets/overview")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const requestStartedAt = performance.now();
          const authStartedAt = requestStartedAt;
          const access = await requireSecretsAccess(
            request,
            params.orgSlug,
            "secrets:read",
          );
          const authDuration = performance.now() - authStartedAt;
          const overviewStartedAt = performance.now();
          const overview = await getOverview(access);
          const overviewDuration = performance.now() - overviewStartedAt;
          const response = Response.json(overview);
          const totalDuration = performance.now() - requestStartedAt;
          response.headers.set(
            "Server-Timing",
            `auth;dur=${authDuration.toFixed(1)}, overview;dur=${overviewDuration.toFixed(1)}, total;dur=${totalDuration.toFixed(1)}`,
          );
          return response;
        }),
    },
  },
});
