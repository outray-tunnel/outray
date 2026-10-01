import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAccess } from "@/lib/secrets/access";
import { deleteSecretsBulk, moveSecretsBulk } from "@/lib/secrets/bulk";
import { readJsonBody, withSecretsErrors } from "@/lib/secrets/http";
import { SecretsError } from "@/lib/secrets/types";

export const Route = createFileRoute("/api/$orgSlug/secrets/projects/$projectSlug/environments/$environmentSlug/bulk")({
  server: { handlers: { POST: async ({ request, params }) => withSecretsErrors(async () => {
    const input = await readJsonBody(request);
    if (input.action !== "move" && input.action !== "delete") throw new SecretsError("Invalid bulk action", { code: "VALIDATION_ERROR", status: 400 });
    const access = await requireSecretsAccess(request, params.orgSlug, input.action === "delete" ? "secrets:delete" : "secrets:write");
    return Response.json(input.action === "delete"
      ? await deleteSecretsBulk(access, params.projectSlug, params.environmentSlug, input)
      : await moveSecretsBulk(access, params.projectSlug, params.environmentSlug, input),
    );
  }) } },
});
