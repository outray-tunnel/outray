import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import {
  cliOrgTokens,
  cliUserTokens,
  members,
  organizations,
} from "../../db/auth-schema";
import { machineTokens } from "../../db/secrets-schema";
import { requireOrgFromSlug } from "../org";
import { hashMachineToken } from "../machine-tokens";
import {
  hasSecretsMetadataScope,
  hasSecretsScope,
} from "./access-policy";
import type { SecretsAccess, SecretsScope } from "./types";
import { SecretsError } from "./types";

export {
  assertActorScope,
  hasSecretsMetadataScope,
  hasSecretsScope,
} from "./access-policy";

type SecretsPermission = SecretsScope | "secrets:metadata";

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match?.[1]) {
    throw new SecretsError("Malformed bearer authorization", {
      code: "UNAUTHORIZED",
      status: 401,
    });
  }
  return match[1].trim();
}

function requestMetadata(request: Request) {
  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent"),
    requestId: request.headers.get("x-request-id")?.trim() || crypto.randomUUID(),
  };
}

async function machineAccess(
  request: Request,
  orgSlug: string,
  rawToken: string,
  requiredScope: SecretsPermission,
): Promise<SecretsAccess | null> {
  const [row] = await db
    .select({ token: machineTokens, organization: organizations })
    .from(machineTokens)
    .innerJoin(
      organizations,
      eq(machineTokens.organizationId, organizations.id),
    )
    .where(
      and(
        eq(machineTokens.tokenHash, hashMachineToken(rawToken)),
        eq(organizations.slug, orgSlug),
        isNull(machineTokens.revokedAt),
      ),
    )
    .limit(1);
  if (!row || (row.token.expiresAt && row.token.expiresAt <= new Date())) return null;
  const permitted =
    requiredScope === "secrets:metadata"
      ? hasSecretsMetadataScope(row.token.scopes)
      : hasSecretsScope(row.token.scopes, requiredScope);
  if (!permitted) {
    throw new SecretsError(`Machine token lacks ${requiredScope} scope`, {
      code: "FORBIDDEN",
      status: 403,
    });
  }

  await db
    .update(machineTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(machineTokens.id, row.token.id));

  return {
    organization: {
      id: row.organization.id,
      slug: row.organization.slug,
      name: row.organization.name,
    },
    actor: {
      type: "machine",
      credential: "machine",
      id: row.token.id,
      tokenId: row.token.id,
      userId: null,
      role: null,
      projectId: row.token.projectId,
      environmentId: row.token.environmentId,
      scopes: row.token.scopes,
    },
    requestMetadata: requestMetadata(request),
  };
}

async function cliOrganizationAccess(
  request: Request,
  orgSlug: string,
  rawToken: string,
): Promise<SecretsAccess | null> {
  const [row] = await db
    .select({ token: cliOrgTokens, organization: organizations, role: members.role })
    .from(cliOrgTokens)
    .innerJoin(organizations, eq(cliOrgTokens.organizationId, organizations.id))
    .innerJoin(
      members,
      and(
        eq(members.organizationId, cliOrgTokens.organizationId),
        eq(members.userId, cliOrgTokens.userId),
      ),
    )
    .where(
      and(eq(cliOrgTokens.token, rawToken), eq(organizations.slug, orgSlug)),
    )
    .limit(1);
  if (!row || row.token.expiresAt <= new Date()) return null;
  await db
    .update(cliOrgTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(cliOrgTokens.id, row.token.id));
  return {
    organization: {
      id: row.organization.id,
      slug: row.organization.slug,
      name: row.organization.name,
    },
    actor: {
      type: "user",
      credential: "cli",
      id: row.token.userId,
      userId: row.token.userId,
      role: row.role,
      tokenId: row.token.id,
      projectId: null,
      environmentId: null,
      scopes: ["secrets:*"],
    },
    requestMetadata: requestMetadata(request),
  };
}

export async function requireSecretsAccess(
  request: Request,
  orgSlug: string,
  requiredScope: SecretsPermission,
): Promise<SecretsAccess> {
  const token = bearerToken(request);
  if (token) {
    const machine = await machineAccess(request, orgSlug, token, requiredScope);
    if (machine) return machine;
    const cli = await cliOrganizationAccess(request, orgSlug, token);
    if (cli) return cli;
    throw new SecretsError("Invalid or expired bearer token", {
      code: "UNAUTHORIZED",
      status: 401,
    });
  }

  const orgResult = await requireOrgFromSlug(request, orgSlug);
  if ("error" in orgResult) {
    throw new SecretsError(
      orgResult.error.status === 401 ? "Unauthorized" : "Forbidden",
      {
        code: orgResult.error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
        status: orgResult.error.status,
      },
    );
  }
  const session = orgResult.session;
  if (!session?.user) {
    throw new SecretsError("Unauthorized", {
      code: "UNAUTHORIZED",
      status: 401,
    });
  }
  const membership = await db.query.members.findFirst({
    columns: { role: true },
    where: and(
      eq(members.organizationId, orgResult.organization.id),
      eq(members.userId, session.user.id),
    ),
  });
  if (!membership) {
    throw new SecretsError("Forbidden", { code: "FORBIDDEN", status: 403 });
  }
  return {
    organization: {
      id: orgResult.organization.id,
      slug: orgResult.organization.slug,
      name: orgResult.organization.name,
    },
    actor: {
      type: "user",
      credential: "session",
      id: session.user.id,
      userId: session.user.id,
      role: membership.role,
      tokenId: null,
      projectId: null,
      environmentId: null,
      scopes: ["secrets:*"],
    },
    requestMetadata: requestMetadata(request),
  };
}

export function requireSecretsMetadataAccess(
  request: Request,
  orgSlug: string,
) {
  return requireSecretsAccess(
    request,
    orgSlug,
    "secrets:metadata",
  );
}

export async function requireSecretsAdmin(request: Request, orgSlug: string) {
  const access = await requireSecretsAccess(request, orgSlug, "secrets:admin");
  if (
    access.actor.type !== "user" ||
    access.actor.credential !== "session" ||
    (access.actor.role !== "owner" && access.actor.role !== "admin")
  ) {
    throw new SecretsError(
      "Only organization owners and admins can manage Secrets access",
      { code: "FORBIDDEN", status: 403 },
    );
  }
  return access;
}

export async function requireSecretsTargetsAccess(
  request: Request,
): Promise<SecretsAccess[]> {
  const rawToken = bearerToken(request);
  if (!rawToken) {
    throw new SecretsError("Bearer authentication is required", {
      code: "UNAUTHORIZED",
      status: 401,
    });
  }
  const metadata = requestMetadata(request);
  const [machine] = await db
    .select({ token: machineTokens, organization: organizations })
    .from(machineTokens)
    .innerJoin(
      organizations,
      eq(machineTokens.organizationId, organizations.id),
    )
    .where(
      and(
        eq(machineTokens.tokenHash, hashMachineToken(rawToken)),
        isNull(machineTokens.revokedAt),
      ),
    )
    .limit(1);
  if (
    machine &&
    (!machine.token.expiresAt || machine.token.expiresAt > new Date())
  ) {
    if (!hasSecretsMetadataScope(machine.token.scopes)) {
      throw new SecretsError("Machine token lacks a Secrets metadata scope", {
        code: "FORBIDDEN",
        status: 403,
      });
    }
    await db
      .update(machineTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(machineTokens.id, machine.token.id));
    return [
      {
        organization: {
          id: machine.organization.id,
          slug: machine.organization.slug,
          name: machine.organization.name,
        },
        actor: {
          type: "machine",
          credential: "machine",
          id: machine.token.id,
          userId: null,
          role: null,
          tokenId: machine.token.id,
          projectId: machine.token.projectId,
          environmentId: machine.token.environmentId,
          scopes: machine.token.scopes,
        },
        requestMetadata: metadata,
      },
    ];
  }

  const [orgCredential] = await db
    .select({ token: cliOrgTokens, organization: organizations, role: members.role })
    .from(cliOrgTokens)
    .innerJoin(organizations, eq(cliOrgTokens.organizationId, organizations.id))
    .innerJoin(
      members,
      and(
        eq(members.organizationId, cliOrgTokens.organizationId),
        eq(members.userId, cliOrgTokens.userId),
      ),
    )
    .where(eq(cliOrgTokens.token, rawToken))
    .limit(1);
  if (orgCredential && orgCredential.token.expiresAt > new Date()) {
    await db
      .update(cliOrgTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(cliOrgTokens.id, orgCredential.token.id));
    return [
      {
        organization: {
          id: orgCredential.organization.id,
          slug: orgCredential.organization.slug,
          name: orgCredential.organization.name,
        },
        actor: {
          type: "user",
          credential: "cli",
          id: orgCredential.token.userId,
          userId: orgCredential.token.userId,
          role: orgCredential.role,
          tokenId: orgCredential.token.id,
          projectId: null,
          environmentId: null,
          scopes: ["secrets:*"],
        },
        requestMetadata: metadata,
      },
    ];
  }

  const [userCredential] = await db
    .select()
    .from(cliUserTokens)
    .where(eq(cliUserTokens.token, rawToken))
    .limit(1);
  if (userCredential && userCredential.expiresAt > new Date()) {
    await db
      .update(cliUserTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(cliUserTokens.id, userCredential.id));
    const organizationRows = await db
      .select({ organization: organizations, role: members.role })
      .from(members)
      .innerJoin(
        organizations,
        eq(members.organizationId, organizations.id),
      )
      .where(eq(members.userId, userCredential.userId));
    return organizationRows.map((row) => ({
      organization: {
        id: row.organization.id,
        slug: row.organization.slug,
        name: row.organization.name,
      },
      actor: {
        type: "user" as const,
        credential: "cli" as const,
        id: userCredential.userId,
        userId: userCredential.userId,
        role: row.role,
        tokenId: userCredential.id,
        projectId: null,
        environmentId: null,
        scopes: ["secrets:*"],
      },
      requestMetadata: metadata,
    }));
  }

  throw new SecretsError("Invalid or expired bearer token", {
    code: "UNAUTHORIZED",
    status: 401,
  });
}
