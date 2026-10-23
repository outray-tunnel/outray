import { and, arrayContains, eq, isNull, lt } from "drizzle-orm";
import { db } from "../../db";
import { members, organizations, users } from "../../db/auth-schema";
import { mcpActivity, mcpConnections } from "../../db/mcp-schema";
import { oauthRefreshTokens, oauthConsents } from "../../db/oauth-schema";
import { secretProjects, secretEnvironments } from "../../db/secrets-schema";
import { auditCutoff, McpAccessError, type McpCatalog } from "./policy";
import { MCP_CONNECTION_CLAIM, resourceFor } from "./config";
import type { McpRequestActor } from "./request-actor";

export async function listMcpOrganizations(userId: string, organizationIds?: readonly string[]) {
  const rows = await db.select({ id: organizations.id, slug: organizations.slug, name: organizations.name, logo: organizations.logo, role: members.role })
    .from(members).innerJoin(organizations, eq(members.organizationId, organizations.id)).where(eq(members.userId, userId));
  return organizationIds ? rows.filter((row) => organizationIds.includes(row.id)) : rows;
}

export async function saveMcpConnection(userId: string, clientId: string, resource: string, organizationIds: string[]) {
  const memberships = await listMcpOrganizations(userId);
  const allowed = new Set(memberships.map((org) => org.id));
  if (!organizationIds.length || organizationIds.length > 100 || new Set(organizationIds).size !== organizationIds.length || organizationIds.some((id) => !allowed.has(id))) {
    throw new McpAccessError("FORBIDDEN", 403, "Choose organizations you currently belong to");
  }
  return db.transaction(async (tx) => {
    // Re-consent invalidates old token families and their connection generation.
    await tx.update(oauthRefreshTokens).set({ revoked: new Date() }).where(and(
      eq(oauthRefreshTokens.userId, userId), eq(oauthRefreshTokens.clientId, clientId),
      arrayContains(oauthRefreshTokens.resources, [resource]),
    ));
    const [connection] = await tx.insert(mcpConnections).values({
      id: crypto.randomUUID(), userId, clientId, resource, generation: crypto.randomUUID(), organizationIds,
    }).onConflictDoUpdate({
      target: [mcpConnections.userId, mcpConnections.clientId, mcpConnections.resource],
      set: { organizationIds, generation: crypto.randomUUID(), revokedAt: null, updatedAt: new Date() },
    }).returning();
    return connection;
  });
}

export async function revokeMcpConnection(userId: string, connectionId: string) {
  return db.transaction(async (tx) => {
    const [connection] = await tx.update(mcpConnections).set({ revokedAt: new Date(), generation: crypto.randomUUID() })
      .where(and(eq(mcpConnections.id, connectionId), eq(mcpConnections.userId, userId))).returning();
    if (!connection) return false;
    await tx.delete(oauthConsents).where(and(eq(oauthConsents.userId, userId), eq(oauthConsents.clientId, connection.clientId)));
    await tx.update(oauthRefreshTokens).set({ revoked: new Date() }).where(and(
      eq(oauthRefreshTokens.userId, userId), eq(oauthRefreshTokens.clientId, connection.clientId),
      arrayContains(oauthRefreshTokens.resources, [connection.resource]),
    ));
    return true;
  });
}

export async function resolveMcpActor(claims: Record<string, unknown>, catalog: McpCatalog): Promise<McpRequestActor> {
  const binding = claims[MCP_CONNECTION_CLAIM] as { id?: unknown; generation?: unknown } | undefined;
  const clientId = claims.client_id ?? claims.azp;
  if (typeof claims.sub !== "string" || typeof clientId !== "string" || typeof binding?.id !== "string" || typeof binding.generation !== "string") {
    throw new McpAccessError("UNAUTHORIZED", 401, "Reconnect your OutRay account");
  }
  const [row] = await db.select({ connection: mcpConnections, user: users }).from(mcpConnections)
    .innerJoin(users, eq(users.id, mcpConnections.userId)).where(and(
      eq(mcpConnections.id, binding.id), eq(mcpConnections.generation, binding.generation),
      eq(mcpConnections.userId, claims.sub), eq(mcpConnections.clientId, clientId),
      eq(mcpConnections.resource, resourceFor(catalog)), isNull(mcpConnections.revokedAt),
    )).limit(1);
  if (!row) throw new McpAccessError("UNAUTHORIZED", 401, "Reconnect your OutRay account");
  return { user: row.user, connectionId: row.connection.id, organizationIds: row.connection.organizationIds,
    scopes: typeof claims.scope === "string" ? claims.scope.split(" ") : [], catalog };
}

export async function recordMcpActivity(actor: McpRequestActor, tool: string, args: Record<string, unknown>, outcome: string) {
  const activityId = crypto.randomUUID();
  const resourceIds = Object.fromEntries(Object.entries(args).filter(([key, value]) => /^(?:id|tunnelId|requestId|traceId|alertId|monitorId|pageId|componentId|groupId|incidentId|updateId|secretId|domainId|subdomainId|tokenId|shareId|memberId|invitationId|subscriberId)$/.test(key) && typeof value === "string" && /^(?:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}|[a-f0-9]{32}(?::[a-f0-9]{16})?|[A-Za-z0-9_-]{22})$/i.test(value))) as Record<string, string>;
  const org = typeof args.orgSlug === "string" ? (await listMcpOrganizations(actor.user.id, actor.organizationIds)).find((row) => row.slug === args.orgSlug) : undefined;
  // Resolve slugs to immutable IDs rather than persisting user-controlled names.
  if (org && typeof args.vaultSlug === "string") {
    const [project] = await db.select({ id: secretProjects.id }).from(secretProjects).where(and(
      eq(secretProjects.organizationId, org.id), eq(secretProjects.slug, args.vaultSlug), isNull(secretProjects.deletedAt),
    )).limit(1);
    if (project) {
      resourceIds.projectId = project.id;
      if (typeof args.environmentSlug === "string") {
        const [environment] = await db.select({ id: secretEnvironments.id }).from(secretEnvironments).where(and(
          eq(secretEnvironments.organizationId, org.id), eq(secretEnvironments.projectId, project.id),
          eq(secretEnvironments.slug, args.environmentSlug), isNull(secretEnvironments.deletedAt),
        )).limit(1);
        if (environment) resourceIds.environmentId = environment.id;
      }
    }
  }
  await db.insert(mcpActivity).values({ id: activityId, userId: actor.user.id, connectionId: actor.connectionId,
    tool, organizationId: org?.id ?? null, resourceIds: resourceIds as Record<string, string>, outcome });
  return activityId;
}

export async function purgeMcpActivity(now = new Date()) {
  await db.delete(mcpActivity).where(lt(mcpActivity.createdAt, auditCutoff(now)));
}
