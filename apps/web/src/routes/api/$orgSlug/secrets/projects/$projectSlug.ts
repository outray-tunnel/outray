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
  deleteProject,
  projectDetails,
  updateProject,
} from "@/lib/secrets/projects";

export const Route = createFileRoute(
  "/api/$orgSlug/secrets/projects/$projectSlug",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAccess(
            request,
            params.orgSlug,
            "secrets:read",
          );
          return Response.json(
            await projectDetails(access, params.projectSlug),
          );
        }),
      PATCH: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAdmin(request, params.orgSlug);
          const project = await updateProject(
            access,
            params.projectSlug,
            await readJsonBody(request),
          );
          return Response.json({ project });
        }),
      DELETE: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAdmin(request, params.orgSlug);
          return Response.json(
            await deleteProject(
              access,
              params.projectSlug,
              await readJsonBody(request),
            ),
          );
        }),
    },
  },
});
