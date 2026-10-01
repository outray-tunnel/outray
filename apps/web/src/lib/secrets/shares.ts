import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db";
import {
  secretEntries,
  secretShareLinks,
  secretShareOwnership,
  secretVersions,
} from "../../db/secrets-schema";
import {
  auditEvent,
  lockOrganizationForRead,
  resolveEnvironment,
  resolveProject,
  transactionKeyForVersion,
} from "./database";
import { decryptSecretValue } from "./crypto";
import type { SecretsAccess } from "./types";
import { SecretsError } from "./types";

const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const ENCODED_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_SHARE_BYTES = 256 * 1024;

function selectedIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50 ||
      value.some((id) => typeof id !== "string" || id.length > 100) ||
      new Set(value).size !== value.length) {
    throw new SecretsError("Choose between 1 and 50 secrets", { code: "VALIDATION_ERROR", status: 400, field: "secretIds" });
  }
  return value as string[];
}

function shareExpiry(input: Record<string, unknown>): Date {
  const value = input.durationValue;
  const unit = input.durationUnit;
  if (!Number.isInteger(value) ||
      !((unit === "days" && Number(value) >= 1 && Number(value) <= 90) ||
        (unit === "months" && Number(value) >= 1 && Number(value) <= 3))) {
    throw new SecretsError("Choose 1–90 days or 1–3 months", { code: "VALIDATION_ERROR", status: 400, field: "durationValue" });
  }
  const expiresAt = new Date();
  if (unit === "days") expiresAt.setUTCDate(expiresAt.getUTCDate() + Number(value));
  else {
    const day = expiresAt.getUTCDate();
    expiresAt.setUTCDate(1);
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + Number(value));
    const lastDay = new Date(Date.UTC(expiresAt.getUTCFullYear(), expiresAt.getUTCMonth() + 1, 0)).getUTCDate();
    expiresAt.setUTCDate(Math.min(day, lastDay));
  }
  return expiresAt;
}

export async function snapshotSecrets(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  input: Record<string, unknown>,
) {
  const project = await resolveProject(access, projectSlug);
  const environment = await resolveEnvironment(access, project, environmentSlug);
  const ids = selectedIds(input.secretIds);
  if (environment.isProduction && input.confirmProduction !== true) {
    throw new SecretsError("Confirm sharing production secrets", { code: "PRODUCTION_CONFIRMATION_REQUIRED", status: 409 });
  }
  return db.transaction(async (tx) => {
    await lockOrganizationForRead(tx, access.organization.id);
    const entries = await tx.select().from(secretEntries).where(and(
      eq(secretEntries.organizationId, access.organization.id),
      eq(secretEntries.environmentId, environment.id),
      inArray(secretEntries.id, ids),
      isNull(secretEntries.deletedAt),
    )).orderBy(secretEntries.key).for("share");
    if (entries.length !== ids.length) throw new SecretsError("Selection changed; refresh and try again", { code: "CONFLICT", status: 409 });
    const versions = await tx.select().from(secretVersions).where(inArray(secretVersions.entryId, ids));
    const current = new Map(versions.map((row) => [`${row.entryId}:${row.version}`, row]));
    const keys = new Map<number, Buffer>();
    try {
      const secrets = [];
      for (const entry of entries) {
        const version = current.get(`${entry.id}:${entry.currentVersion}`);
        if (!version) throw new SecretsError("Current version is unavailable", { code: "SECRETS_INTEGRITY_ERROR", status: 500 });
        let key = keys.get(version.organizationKeyVersion);
        if (!key) {
          key = await transactionKeyForVersion(tx, access.organization.id, version.organizationKeyVersion);
          keys.set(version.organizationKeyVersion, key);
        }
        const value = decryptSecretValue(key, {
          organizationId: version.organizationId,
          projectId: version.projectId,
          environmentId: version.environmentId,
          entryId: version.entryId,
          version: version.version,
          keySnapshot: version.keySnapshot,
          organizationKeyVersion: version.organizationKeyVersion,
          ciphertext: version.ciphertext,
          iv: version.iv,
          authTag: version.authTag,
        });
        secrets.push({ id: entry.id, key: entry.key, value, version: entry.currentVersion });
      }
      if (Buffer.byteLength(JSON.stringify({ type: "bundle", entries: secrets.map(({ key, value }) => ({ key, value })) }), "utf8") > MAX_SHARE_BYTES) {
        throw new SecretsError("Selection exceeds 256 KiB", { code: "VALIDATION_ERROR", status: 413 });
      }
      await auditEvent(tx, access, {
        action: "share.snapshot_revealed", targetType: "environment", targetId: environment.id,
        projectId: project.id, environmentId: environment.id, metadata: { count: entries.length },
      });
      return { secrets, revision: environment.revision };
    } finally {
      for (const key of keys.values()) key.fill(0);
    }
  });
}

export async function createOrganizationShare(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  input: Record<string, unknown>,
) {
  const project = await resolveProject(access, projectSlug);
  const environment = await resolveEnvironment(access, project, environmentSlug);
  const ids = selectedIds(input.secretIds);
  if (environment.isProduction && input.confirmProduction !== true) {
    throw new SecretsError("Confirm sharing production secrets", { code: "PRODUCTION_CONFIRMATION_REQUIRED", status: 409 });
  }
  const ciphertext = input.ciphertext;
  const iv = input.iv;
  const verifier = input.verifier;
  const maxViews = input.maxViews;
  if (typeof ciphertext !== "string" || !ENCODED_PATTERN.test(ciphertext) ||
      Buffer.byteLength(ciphertext, "base64url") > MAX_SHARE_BYTES + 1024 ||
      Buffer.byteLength(ciphertext, "base64url") < 17 ||
      typeof iv !== "string" || !ENCODED_PATTERN.test(iv) || Buffer.byteLength(iv, "base64url") !== 12 ||
      typeof verifier !== "string" || !ENCODED_PATTERN.test(verifier) || Buffer.byteLength(verifier, "base64url") !== 32 ||
      !Number.isInteger(maxViews) || Number(maxViews) < 1 || Number(maxViews) > 100) {
    throw new SecretsError("Invalid encrypted share or view limit", { code: "VALIDATION_ERROR", status: 400 });
  }
  const expiresAt = shareExpiry(input);
  return db.transaction(async (tx) => {
    await lockOrganizationForRead(tx, access.organization.id);
    const entries = await tx.select({ id: secretEntries.id, key: secretEntries.key, currentVersion: secretEntries.currentVersion })
      .from(secretEntries).where(and(
        eq(secretEntries.organizationId, access.organization.id),
        eq(secretEntries.environmentId, environment.id),
        inArray(secretEntries.id, ids),
        isNull(secretEntries.deletedAt),
      )).orderBy(secretEntries.key).for("share");
    const versions = input.versions;
    if (entries.length !== ids.length || !Array.isArray(versions) || versions.length !== entries.length ||
        entries.some((entry, index) => versions[index] !== entry.currentVersion)) {
      throw new SecretsError("Selection changed; refresh and try again", { code: "CONFLICT", status: 409 });
    }
    const id = randomBytes(16).toString("base64url");
    await tx.insert(secretShareLinks).values({ id, ciphertext, iv, keyVerifier: verifier, contentFormat: "bundle", expiresAt, maxViews: Number(maxViews) });
    await tx.insert(secretShareOwnership).values({
      shareId: id, organizationId: access.organization.id, projectId: project.id,
      environmentId: environment.id, createdById: access.actor.userId,
      keyNames: entries.map((entry) => entry.key), sourceSecretIds: entries.map((entry) => entry.id),
    });
    await auditEvent(tx, access, {
      action: "share.created", targetType: "share", targetId: id,
      projectId: project.id, environmentId: environment.id, metadata: { count: entries.length, expiresAt: expiresAt.toISOString(), maxViews },
    });
    return { id, expiresAt, maxViews };
  });
}

export async function listOrganizationShares(access: SecretsAccess) {
  const rows = await db.select({
    id: secretShareLinks.id, createdAt: secretShareLinks.createdAt,
    expiresAt: secretShareLinks.expiresAt, maxViews: secretShareLinks.maxViews,
    views: secretShareLinks.views, revokedAt: secretShareLinks.revokedAt,
    keyNames: secretShareOwnership.keyNames, projectId: secretShareOwnership.projectId,
    environmentId: secretShareOwnership.environmentId,
  }).from(secretShareOwnership).innerJoin(secretShareLinks, eq(secretShareOwnership.shareId, secretShareLinks.id))
    .where(eq(secretShareOwnership.organizationId, access.organization.id))
    .orderBy(desc(secretShareLinks.createdAt)).limit(200);
  return { shares: rows };
}

export async function revokeOrganizationShare(access: SecretsAccess, id: string) {
  if (!ID_PATTERN.test(id)) throw new SecretsError("Share not found", { code: "NOT_FOUND", status: 404 });
  return db.transaction(async (tx) => {
    const [owner] = await tx.select().from(secretShareOwnership).where(and(
      eq(secretShareOwnership.shareId, id), eq(secretShareOwnership.organizationId, access.organization.id),
    )).for("update");
    if (!owner) throw new SecretsError("Share not found", { code: "NOT_FOUND", status: 404 });
    await tx.update(secretShareLinks).set({ revokedAt: new Date(), ciphertext: "", iv: "" }).where(eq(secretShareLinks.id, id));
    await auditEvent(tx, access, {
      action: "share.revoked", targetType: "share", targetId: id,
      projectId: owner.projectId, environmentId: owner.environmentId,
    });
    return { revoked: true };
  });
}
