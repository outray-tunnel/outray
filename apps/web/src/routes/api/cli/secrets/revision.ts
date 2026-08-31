import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsMetadataAccess } from "@/lib/secrets/access";
import { environmentRevision } from "@/lib/secrets/entries";
import { queryBoolean, withSecretsErrors } from "@/lib/secrets/http";
import { SecretsError } from "@/lib/secrets/types";

function requiredTarget(search: URLSearchParams, name: string) {
  const value = search.get(name)?.trim();
  if (!value) {
    throw new SecretsError(`${name} is required`, {
      code: "VALIDATION_ERROR",
      status: 400,
      field: name,
    });
  }
  return value;
}

export const Route = createFileRoute("/api/cli/secrets/revision")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withSecretsErrors(async () => {
          const search = new URL(request.url).searchParams;
          const organization = requiredTarget(search, "organization");
          const project = requiredTarget(search, "project");
          const environment = requiredTarget(search, "environment");
          // Accepted for CLI command symmetry; revisions are metadata-only.
          queryBoolean(search.get("confirmProduction"), false);
          const access = await requireSecretsMetadataAccess(
            request,
            organization,
          );
          return Response.json(
            await environmentRevision(access, project, environment),
          );
        }),
    },
  },
});
