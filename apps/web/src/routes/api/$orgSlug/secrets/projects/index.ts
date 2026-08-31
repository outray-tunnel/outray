import { createFileRoute } from "@tanstack/react-router";
import {
  requireSecretsAccess,
  requireSecretsAdmin,
} from "@/lib/secrets/access";
import {
  readJsonBody,
  withSecretsErrors,
} from "@/lib/secrets/http";
import {
  createProject,
  listProjects,
} from "@/lib/secrets/projects";

export const Route = createFileRoute("/api/$orgSlug/secrets/projects/")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAccess(
            request,
            params.orgSlug,
            "secrets:read",
          );
          return Response.json({ projects: await listProjects(access) });
        }),
      POST: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAdmin(request, params.orgSlug);
          const result = await createProject(access, await readJsonBody(request));
          return Response.json(result, { status: 201 });
        }),
    },
  },
});
