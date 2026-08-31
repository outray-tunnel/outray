import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../../db";
import { members } from "../../../db/auth-schema";
import {
  machineTokens,
  secretAuditEvents,
  secretEnvironments,
  secretProjects,
} from "../../../db/secrets-schema";
import {
  createMachineToken,
  machineTokenExpiry,
  normalizeMachineTokenScopes,
} from "../../../lib/machine-tokens";
import { requireOrgFromSlug } from "../../../lib/org";
import { lockOrganization } from "../../../lib/secrets/database";
import {
  readJsonBody,
  withPlaintextSecretsErrors,
  withSecretsErrors,
} from "../../../lib/secrets/http";
import { SecretsError } from "../../../lib/secrets/types";

function requestIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

function requestId(request: Request) {
  return request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
}

async function requireTokenManager(request: Request, orgSlug: string) {
  const orgResult = await requireOrgFromSlug(request, orgSlug);
  if ("error" in orgResult) return orgResult;
  if (!orgResult.session?.user) {
    return {
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const userId = orgResult.session.user.id;

  const membership = await db.query.members.findFirst({
    columns: { role: true },
    where: and(
      eq(members.organizationId, orgResult.organization.id),
      eq(members.userId, userId),
    ),
  });

  if (membership?.role !== "owner" && membership?.role !== "admin") {
    return {
      error: Response.json(
        { error: "Only organization owners and admins can manage tokens" },
        { status: 403 },
      ),
    };
  }

  return { ...orgResult, role: membership.role, userId };
}

function tokenMetadata(token: typeof machineTokens.$inferSelect) {
  return {
    id: token.id,
    name: token.name,
    prefix: token.prefix,
    scopes: token.scopes,
    organizationId: token.organizationId,
    projectId: token.projectId,
    environmentId: token.environmentId,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    lastUsedAt: token.lastUsedAt,
    createdAt: token.createdAt,
    createdById: token.createdById,
  };
}

export const Route = createFileRoute("/api/$orgSlug/auth-tokens")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireTokenManager(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;

        const tokens = await db
          .select()
          .from(machineTokens)
          .where(eq(machineTokens.organizationId, orgResult.organization.id))
          .orderBy(desc(machineTokens.createdAt));

        return Response.json({ tokens: tokens.map(tokenMetadata) });
      },

      POST: async ({ request, params }) =>
        withPlaintextSecretsErrors(async () => {
          const orgResult = await requireTokenManager(request, params.orgSlug);
          if ("error" in orgResult) return orgResult.error;

          const body = await readJsonBody(request);
          const name = typeof body.name === "string" ? body.name.trim() : "";
          if (!name || name.length > 100) {
            return Response.json(
              { error: "Name must be between 1 and 100 characters" },
              { status: 400 },
            );
          }

          const scopes =
            body.scopes === undefined
              ? (["tunnel:connect"] as const)
              : normalizeMachineTokenScopes(body.scopes);
          if (!scopes) {
            return Response.json(
              { error: "Choose at least one valid permission" },
              { status: 400 },
            );
          }

          const expiresAt = machineTokenExpiry(body.expiresIn);
          if (expiresAt === undefined) {
            return Response.json(
              { error: "Expiry must be 30d, 90d, 1y, or never" },
              { status: 400 },
            );
          }

          const projectId =
            typeof body.projectId === "string" && body.projectId
              ? body.projectId
              : null;
          const environmentId =
            typeof body.environmentId === "string" && body.environmentId
              ? body.environmentId
              : null;

          if (environmentId && !projectId) {
            return Response.json(
              { error: "Environment-scoped tokens must also select a project" },
              { status: 400 },
            );
          }

          if (
            (projectId || environmentId) &&
            !scopes.some((scope) => scope.startsWith("secrets:"))
          ) {
            return Response.json(
              {
                error:
                  "Project and environment scopes apply to Secrets permissions",
              },
              { status: 400 },
            );
          }

          const generated = createMachineToken();
          const created = await db.transaction(async (tx) => {
            await lockOrganization(tx, orgResult.organization.id);
            if (projectId) {
              const [project] = await tx
                .select({ id: secretProjects.id })
                .from(secretProjects)
                .where(
                  and(
                    eq(secretProjects.id, projectId),
                    eq(
                      secretProjects.organizationId,
                      orgResult.organization.id,
                    ),
                    isNull(secretProjects.deletedAt),
                  ),
                )
                .limit(1)
                .for("share");
              if (!project) {
                throw new SecretsError("Project not found", {
                  code: "NOT_FOUND",
                  status: 404,
                  field: "projectId",
                });
              }
            }

            if (environmentId && projectId) {
              const [environment] = await tx
                .select({ id: secretEnvironments.id })
                .from(secretEnvironments)
                .where(
                  and(
                    eq(secretEnvironments.id, environmentId),
                    eq(secretEnvironments.projectId, projectId),
                    eq(
                      secretEnvironments.organizationId,
                      orgResult.organization.id,
                    ),
                    isNull(secretEnvironments.deletedAt),
                  ),
                )
                .limit(1)
                .for("share");
              if (!environment) {
                throw new SecretsError("Environment not found", {
                  code: "NOT_FOUND",
                  status: 404,
                  field: "environmentId",
                });
              }
            }

            const [row] = await tx
              .insert(machineTokens)
              .values({
                id: crypto.randomUUID(),
                name,
                organizationId: orgResult.organization.id,
                projectId,
                environmentId,
                tokenHash: generated.tokenHash,
                prefix: generated.prefix,
                scopes: [...scopes],
                createdById: orgResult.userId,
                expiresAt,
              })
              .returning();

            await tx.insert(secretAuditEvents).values({
              id: crypto.randomUUID(),
              organizationId: orgResult.organization.id,
              projectId,
              environmentId,
              actorType: "user",
              actorCredential: "session",
              actorId: orgResult.userId,
              action: "machine_token.created",
              result: "success",
              requestId: requestId(request),
              targetType: "machine_token",
              targetId: row.id,
              targetName: name,
              metadata: { prefix: row.prefix, scopes: row.scopes },
              ipAddress: requestIp(request),
              userAgent: request.headers.get("user-agent"),
            });
            return row;
          });

          return Response.json({
            token: generated.token,
            machineToken: tokenMetadata(created),
          });
        }),

      DELETE: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const orgResult = await requireTokenManager(request, params.orgSlug);
          if ("error" in orgResult) return orgResult.error;

          const body = await readJsonBody(request);
          if (typeof body.id !== "string" || !body.id) {
            return Response.json(
              { error: "Token ID is required" },
              { status: 400 },
            );
          }

          const revoked = await db.transaction(async (tx) => {
            const [row] = await tx
              .update(machineTokens)
              .set({
                revokedAt: new Date(),
                revokedById: orgResult.userId,
              })
              .where(
                and(
                  eq(machineTokens.id, body.id as string),
                  eq(machineTokens.organizationId, orgResult.organization.id),
                  isNull(machineTokens.revokedAt),
                ),
              )
              .returning();

            if (row) {
              await tx.insert(secretAuditEvents).values({
                id: crypto.randomUUID(),
                organizationId: orgResult.organization.id,
                projectId: row.projectId,
                environmentId: row.environmentId,
                actorType: "user",
                actorCredential: "session",
                actorId: orgResult.userId,
                action: "machine_token.revoked",
                result: "success",
                requestId: requestId(request),
                targetType: "machine_token",
                targetId: row.id,
                targetName: row.name,
                metadata: { prefix: row.prefix, scopes: row.scopes },
                ipAddress: requestIp(request),
                userAgent: request.headers.get("user-agent"),
              });
            }
            return row;
          });

          if (!revoked) {
            return Response.json({ error: "Token not found" }, { status: 404 });
          }

          return Response.json({ success: true });
        }),
    },
  },
});
