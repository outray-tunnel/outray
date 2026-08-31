import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAccess } from "@/lib/secrets/access";
import { rollbackSecret } from "@/lib/secrets/entries";
import { readJsonBody, withSecretsErrors } from "@/lib/secrets/http";
import { SecretsError } from "@/lib/secrets/types";
import { readRequiredString } from "@/lib/secrets/validation";

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

export const Route = createFileRoute("/api/cli/secrets/rollback")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withSecretsErrors(async () => {
          const search = new URL(request.url).searchParams;
          const organization = requiredTarget(search, "organization");
          const project = requiredTarget(search, "project");
          const environment = requiredTarget(search, "environment");
          const body = await readJsonBody(request);
          const secretId = readRequiredString(body, "secretId", {
            maxLength: 100,
          });
          const access = await requireSecretsAccess(
            request,
            organization,
            "secrets:write",
          );
          return Response.json(
            await rollbackSecret(
              access,
              project,
              environment,
              secretId,
              body,
            ),
          );
        }),
    },
  },
});
