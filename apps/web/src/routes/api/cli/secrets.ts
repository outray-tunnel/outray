import { createFileRoute } from "@tanstack/react-router";
import {
  requireSecretsAccess,
  requireSecretsMetadataAccess,
} from "@/lib/secrets/access";
import {
  cliSecrets,
  deleteCliSecrets,
  importSecretValues,
} from "@/lib/secrets/entries";
import {
  queryBoolean,
  readJsonBody,
  withPlaintextSecretsErrors,
  withSecretsErrors,
} from "@/lib/secrets/http";
import { SecretsError } from "@/lib/secrets/types";
import {
  parseEnvText,
  readExpectedSecretVersions,
  requiredNonNegativeInteger,
  requiredPositiveInteger,
} from "@/lib/secrets/validation";

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

export const Route = createFileRoute("/api/cli/secrets")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withSecretsErrors(async () => {
          const search = new URL(request.url).searchParams;
          const organization = requiredTarget(search, "organization");
          const project = requiredTarget(search, "project");
          const environment = requiredTarget(search, "environment");
          const values = queryBoolean(search.get("values"), false);
          if (values) {
            throw new SecretsError(
              "Plaintext delivery requires POST /api/cli/secrets",
              { code: "METHOD_NOT_ALLOWED", status: 405 },
            );
          }
          const access = await requireSecretsMetadataAccess(
            request,
            organization,
          );
          return Response.json(
            await cliSecrets(
              access,
              project,
              environment,
              false,
              search.get("key") ?? undefined,
              false,
            ),
          );
        }),
      POST: async ({ request }) =>
        withPlaintextSecretsErrors(async () => {
          const search = new URL(request.url).searchParams;
          const organization = requiredTarget(search, "organization");
          const project = requiredTarget(search, "project");
          const environment = requiredTarget(search, "environment");
          const body = await readJsonBody(request);
          const confirmProduction =
            body.confirmProduction === true ||
            queryBoolean(search.get("confirmProduction"), false);
          const access = await requireSecretsAccess(
            request,
            organization,
            "secrets:reveal",
          );
          return Response.json(
            await cliSecrets(
              access,
              project,
              environment,
              true,
              search.get("key") ?? undefined,
              confirmProduction,
            ),
          );
        }),
      PUT: async ({ request }) =>
        withSecretsErrors(async () => {
          const search = new URL(request.url).searchParams;
          const organization = requiredTarget(search, "organization");
          const project = requiredTarget(search, "project");
          const environment = requiredTarget(search, "environment");
          const body = await readJsonBody(request);
          const hasSecrets = body.secrets !== undefined;
          const hasEnvText = body.envText !== undefined;
          if (hasSecrets === hasEnvText) {
            throw new SecretsError(
              "Supply exactly one of secrets or envText",
              { code: "VALIDATION_ERROR", status: 400 },
            );
          }
          let values: Record<string, string>;
          if (hasEnvText) {
            if (typeof body.envText !== "string") {
              throw new SecretsError("envText must be a string", {
                code: "VALIDATION_ERROR",
                status: 400,
                field: "envText",
              });
            }
            values = parseEnvText(body.envText).values;
          } else {
            if (
              !body.secrets ||
              typeof body.secrets !== "object" ||
              Array.isArray(body.secrets)
            ) {
              throw new SecretsError("secrets must be an object", {
                code: "VALIDATION_ERROR",
                status: 400,
                field: "secrets",
              });
            }
            values = body.secrets as Record<string, string>;
          }
          const confirmProduction =
            body.confirmProduction === true ||
            queryBoolean(search.get("confirmProduction"), false);
          const access = await requireSecretsAccess(
            request,
            organization,
            "secrets:write",
          );
          const expectedRevision = requiredNonNegativeInteger(
            body.expectedRevision,
            "expectedRevision",
          );
          const expectedVersions = readExpectedSecretVersions(
            body.expectedVersions,
            Object.keys(values),
          );
          const result = await importSecretValues(
            access,
            project,
            environment,
            values,
            {
              expectedRevision,
              expectedVersions,
              confirmProduction,
              source: "write",
            },
          );
          return Response.json({
            created: result.created,
            updated: result.updated,
            unchanged: result.unchanged,
            revision: result.revision,
          });
        }),
      DELETE: async ({ request }) =>
        withSecretsErrors(async () => {
          const search = new URL(request.url).searchParams;
          const organization = requiredTarget(search, "organization");
          const project = requiredTarget(search, "project");
          const environment = requiredTarget(search, "environment");
          const key = requiredTarget(search, "key");
          const body = await readJsonBody(request);
          const expectedRevision = requiredNonNegativeInteger(
            body.expectedRevision,
            "expectedRevision",
          );
          const expectedVersion = requiredPositiveInteger(
            body.expectedVersion,
            "expectedVersion",
          );
          const confirmProduction = body.confirmProduction === true;
          const access = await requireSecretsAccess(
            request,
            organization,
            "secrets:delete",
          );
          return Response.json(
            await deleteCliSecrets(
              access,
              project,
              environment,
              key,
              expectedRevision,
              expectedVersion,
              confirmProduction,
            ),
          );
        }),
    },
  },
});
