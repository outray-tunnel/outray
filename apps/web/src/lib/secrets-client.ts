export type SecretResourceType = "project" | "environment" | "secret";

export interface SecretEnvironment {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  color?: string | null;
  secretCount: number;
  revision: number;
  isProduction: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface SecretProject {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  environments: SecretEnvironment[];
  environmentCount: number;
  secretCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface SecretMetadata {
  id: string;
  key: string;
  version: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  deletedAt?: string | null;
}

export interface SecretVersion {
  id: string;
  version: number;
  createdAt: string;
  createdBy?: string | null;
  action?: string | null;
  isCurrent?: boolean;
  key?: string | null;
  source?: string | null;
  sourceVersion?: number | null;
  createdByType?: string | null;
}

export interface SecretAuditEvent {
  id: string;
  action: string;
  resourceType: SecretResourceType;
  resourceId?: string | null;
  resourceName?: string | null;
  projectId?: string | null;
  projectSlug?: string | null;
  projectName?: string | null;
  environmentId?: string | null;
  environmentSlug?: string | null;
  environmentName?: string | null;
  actorType: "user" | "machine" | "system";
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface SecretAuditPage {
  events: SecretAuditEvent[];
  nextCursor: string | null;
}

export interface SecretShareRecord {
  id: string;
  createdAt: string;
  expiresAt: string;
  maxViews: number;
  views: number;
  revokedAt: string | null;
  keyNames: string[];
  projectId: string;
  environmentId: string;
}

export interface SecretTrashItem {
  id: string;
  batchId: string;
  type: "project" | "environment" | "secret" | "bulk";
  name: string;
  itemCount: number;
  isProduction: boolean;
  deletedAt: string;
  expiresAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface SecretsOverview {
  projectCount: number;
  environmentCount: number;
  secretCount: number;
  projects: SecretProject[];
  recentActivity: SecretAuditEvent[];
}

export interface EnvironmentRevision {
  revision: number;
  updatedAt?: string | null;
}

export interface ImportReview {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  keys: Array<{
    key: string;
    action: "create" | "update" | "unchanged" | "skip";
    reason?: string | null;
  }>;
  revision?: number;
}

export class SecretsClientError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SecretsClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function integer(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
}

function boolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isoDate(value: unknown): string {
  return typeof value === "string" ? value : new Date(0).toISOString();
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function unwrapRecord(payload: unknown, keys: string[]): JsonRecord {
  if (!isRecord(payload)) return {};
  for (const key of keys) {
    const candidate = payload[key];
    if (isRecord(candidate)) return candidate;
  }
  return payload;
}

function unwrapArray(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key] as unknown[];
  }
  return [];
}

function normalizeEnvironment(value: unknown): SecretEnvironment {
  const item = isRecord(value) ? value : {};
  const name = text(item.name, text(item.slug, "Environment"));
  const slug = text(item.slug, slugify(name));
  const normalizedName = name.toLowerCase();
  const normalizedSlug = slug.toLowerCase();
  return {
    id: text(item.id, slug),
    slug,
    name,
    description: nullableText(item.description),
    color: nullableText(item.color),
    secretCount: integer(item.secretCount, integer(item.secretsCount)),
    revision: integer(item.revision),
    isProduction: boolean(
      item.isProduction,
      normalizedName === "production" ||
        normalizedName === "prod" ||
        normalizedSlug === "production" ||
        normalizedSlug === "prod",
    ),
    createdAt: isoDate(item.createdAt),
    updatedAt: isoDate(item.updatedAt),
    deletedAt: nullableText(item.deletedAt),
  };
}

function normalizeProject(value: unknown): SecretProject {
  const item = isRecord(value) ? value : {};
  const name = text(item.name, text(item.slug, "Untitled vault"));
  const environments = array(item.environments).map(normalizeEnvironment);
  return {
    id: text(item.id, text(item.slug, slugify(name))),
    slug: text(item.slug, slugify(name)),
    name,
    description: nullableText(item.description),
    environments,
    environmentCount: integer(item.environmentCount, environments.length),
    secretCount: integer(
      item.secretCount,
      environments.reduce(
        (total, environment) => total + environment.secretCount,
        0,
      ),
    ),
    createdAt: isoDate(item.createdAt),
    updatedAt: isoDate(item.updatedAt),
    deletedAt: nullableText(item.deletedAt),
  };
}

function normalizeProjectResponse(payload: unknown): SecretProject {
  const project = normalizeProject(unwrapRecord(payload, ["project", "data"]));
  if (isRecord(payload) && Array.isArray(payload.environments)) {
    project.environments = payload.environments.map(normalizeEnvironment);
    project.environmentCount = project.environments.length;
    project.secretCount = integer(
      (isRecord(payload.project) ? payload.project.secretCount : undefined) ??
        payload.secretCount,
      project.environments.reduce(
        (total, environment) => total + environment.secretCount,
        0,
      ),
    );
  }
  return project;
}

/** A vault read must include a real environment catalog, including a valid empty one. */
function normalizeProjectReadResponse(payload: unknown): SecretProject {
  const invalid = () => new SecretsClientError(
    "The secrets environments response is invalid.", 502, "INVALID_RESPONSE",
  );
  if (!isRecord(payload)) throw invalid();
  let envelope = payload;
  // Keep the existing project/data aliases, including a data-wrapped API envelope.
  if (envelope.project === undefined && envelope.data !== undefined) {
    if (!isRecord(envelope.data)) throw invalid();
    envelope = envelope.data;
  }
  const item = envelope.project === undefined ? envelope : envelope.project;
  const validCount = (value: unknown) => value === undefined || (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
  const optionalText = (value: unknown) => value === undefined || value === null || typeof value === "string";
  const optionalDate = (value: unknown) => value === undefined || (
    typeof value === "string" && Number.isFinite(Date.parse(value))
  );
  const namedRecord = (value: unknown): value is JsonRecord => isRecord(value) &&
    ["id", "name", "slug"].every((key) => value[key] === undefined || (
      typeof value[key] === "string" && value[key].trim().length > 0
    )) && (typeof value.name === "string" || typeof value.slug === "string") &&
    optionalText(value.description) && optionalDate(value.createdAt) && optionalDate(value.updatedAt) &&
    (value.deletedAt === null || optionalDate(value.deletedAt));
  const validEnvironment = (value: unknown) => namedRecord(value) &&
    validCount(value.secretCount) && validCount(value.secretsCount) && validCount(value.revision) &&
    optionalText(value.color) && (value.isProduction === undefined || typeof value.isProduction === "boolean");
  if (!namedRecord(item) || ![item.environmentCount, item.secretCount,
    envelope.environmentCount, envelope.secretCount, payload.environmentCount, payload.secretCount].every(validCount)) {
    throw invalid();
  }
  const catalogs = [payload.environments, envelope.environments, item.environments]
    .filter((value) => value !== undefined);
  if (!catalogs.length || !catalogs.every((value) => Array.isArray(value) && value.every(validEnvironment))) {
    throw invalid();
  }
  const environments = (catalogs[0] as unknown[]).map((value) => {
    const environment = normalizeEnvironment(value);
    const color = environment.color?.trim().toLowerCase();
    environment.color = color && ["emerald", "amber", "rose", "violet", "blue"].includes(color) ? color : null;
    return environment;
  });
  const project = normalizeProject(item);
  return {
    ...project,
    environments,
    environmentCount: item.environments === catalogs[0] ? project.environmentCount : environments.length,
    secretCount: integer(item.secretCount ?? envelope.secretCount ?? payload.secretCount,
      environments.reduce((total, environment) => total + environment.secretCount, 0)),
  };
}

/** A catalog read must contain an actual list, not a malformed response normalized to zero vaults. */
function normalizeProjectsReadResponse(payload: unknown): SecretProject[] {
  const invalid = () => new SecretsClientError(
    "The secrets vaults response is invalid.", 502, "INVALID_RESPONSE",
  );
  const normalizeItem = (value: unknown): SecretProject => {
    if (!isRecord(value)) throw invalid();
    // Project reads validate and return only metadata. Project only these fields
    // so unrelated project/data envelope keys cannot override a catalog row.
    const metadata: JsonRecord = {};
    for (const key of ["id", "slug", "name", "description", "environmentCount", "secretCount", "createdAt", "updatedAt", "deletedAt"]) {
      metadata[key] = value[key];
    }
    // Older list responses omitted environment catalogs; explicit invalid ones
    // must still fail instead of appearing to be legitimately empty.
    metadata.environments = value.environments === undefined ? [] : value.environments;
    try {
      return normalizeProjectReadResponse(metadata);
    } catch (error) {
      if (error instanceof SecretsClientError && error.code === "INVALID_RESPONSE") throw invalid();
      throw error;
    }
  };
  if (Array.isArray(payload)) return payload.map(normalizeItem);
  if (!isRecord(payload)) throw invalid();
  const validCount = (value: unknown) => value === undefined || (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
  if (![payload.projectCount, payload.environmentCount, payload.secretCount].every(validCount)) throw invalid();
  const catalogs = ["projects", "items", "data"].filter((key) => payload[key] !== undefined).map((key) => {
    const collection = payload[key];
    if (Array.isArray(collection)) return collection.map(normalizeItem);
    if (key === "data" && isRecord(collection)) return normalizeProjectsReadResponse(collection);
    throw invalid();
  });
  if (!catalogs.length) throw invalid();
  return catalogs[0];
}

function normalizeSecret(value: unknown): SecretMetadata {
  const item = isRecord(value) ? value : {};
  return {
    id: text(item.id),
    key: text(item.key, text(item.name, "UNNAMED_SECRET")),
    version: integer(item.version, integer(item.currentVersion, 1)),
    revision: integer(item.revision),
    createdAt: isoDate(item.createdAt),
    updatedAt: isoDate(item.updatedAt),
    createdBy: nullableText(item.createdByName ?? item.createdBy),
    updatedBy: nullableText(item.updatedByName ?? item.updatedBy),
    deletedAt: nullableText(item.deletedAt),
  };
}

function normalizeVersion(value: unknown): SecretVersion {
  const item = isRecord(value) ? value : {};
  return {
    id: text(item.id, String(integer(item.version))),
    version: integer(item.version),
    createdAt: isoDate(item.createdAt),
    createdBy: nullableText(item.createdByName ?? item.createdBy),
    action: nullableText(item.action),
    isCurrent: typeof item.isCurrent === "boolean" ? item.isCurrent : undefined,
    key: nullableText(item.key),
    source: nullableText(item.source),
    sourceVersion: typeof item.sourceVersion === "number" ? integer(item.sourceVersion) : null,
    createdByType: nullableText(item.createdByType),
  };
}

function normalizeAuditEvent(value: unknown): SecretAuditEvent {
  const item = isRecord(value) ? value : {};
  const metadata = isRecord(item.metadata) ? item.metadata : null;
  const rawType = text(item.resourceType, text(item.targetType, "secret"));
  const resourceType: SecretResourceType =
    rawType === "project" || rawType === "environment" ? rawType : "secret";
  const actorName = nullableText(item.actorName ?? item.userName);
  const actorEmail = nullableText(item.actorEmail ?? item.userEmail);
  const rawActorType = text(
    item.actorType ?? metadata?.actorType,
    actorName || actorEmail ? "user" : "system",
  ).toLowerCase();
  const actorType =
    rawActorType === "machine" || rawActorType === "machine_token"
      ? "machine"
      : rawActorType === "user"
        ? "user"
        : "system";
  return {
    id: text(item.id, `${isoDate(item.createdAt)}-${text(item.action)}`),
    action: text(item.action, "updated"),
    resourceType,
    resourceId: nullableText(item.resourceId ?? item.targetId),
    resourceName: nullableText(
      item.resourceName ?? item.targetName ?? item.secretKey ?? item.key,
    ),
    projectId: nullableText(item.projectId ?? metadata?.projectId),
    projectSlug: nullableText(item.projectSlug ?? metadata?.projectSlug),
    projectName: nullableText(item.projectName ?? metadata?.projectName),
    environmentId: nullableText(item.environmentId ?? metadata?.environmentId),
    environmentSlug: nullableText(
      item.environmentSlug ?? metadata?.environmentSlug,
    ),
    environmentName: nullableText(
      item.environmentName ?? metadata?.environmentName,
    ),
    actorType,
    actorId: nullableText(item.actorId ?? item.userId ?? metadata?.actorId),
    actorName,
    actorEmail,
    createdAt: isoDate(item.createdAt),
    metadata,
  };
}

function encodePath(value: string): string {
  return encodeURIComponent(value);
}

async function request(
  orgSlug: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(`/api/${encodePath(orgSlug)}/secrets${path}`, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-store",
      ...(init.body instanceof FormData || typeof init.body === "undefined"
        ? {}
        : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const record = isRecord(payload) ? payload : {};
    throw new SecretsClientError(
      `${text(record.error, text(record.message, "The secrets request failed."))}${
        response.status === 409 ? " Refresh the environment and try again." : ""
      }`,
      response.status,
      nullableText(record.code) ?? undefined,
      isRecord(record.details) ? record.details : undefined,
    );
  }
  return response;
}

async function jsonRequest(
  orgSlug: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await request(orgSlug, path, init);
  if (response.status === 204) return null;
  return response.json();
}

function body(value: unknown): string {
  return JSON.stringify(value);
}

function environmentPath(projectSlug: string, environmentSlug: string): string {
  return `/projects/${encodePath(projectSlug)}/environments/${encodePath(environmentSlug)}`;
}

function secretPath(
  projectSlug: string,
  environmentSlug: string,
  secretId: string,
): string {
  return `${environmentPath(projectSlug, environmentSlug)}/secrets/${encodePath(secretId)}`;
}

export const secretsClient = {
  async trash(orgSlug: string): Promise<SecretTrashItem[]> {
    const result = await jsonRequest(orgSlug, "/trash") as { items: SecretTrashItem[] };
    return result.items;
  },

  async restoreTrash(orgSlug: string, item: SecretTrashItem, confirmProduction: boolean): Promise<void> {
    await jsonRequest(orgSlug, "/trash/restore", {
      method: "POST", body: body({ type: item.type, id: item.id, confirmation: item.name, confirmProduction }),
    });
  },

  async snapshotForShare(
    orgSlug: string, projectSlug: string, environmentSlug: string,
    secretIds: string[], confirmProduction: boolean,
  ): Promise<{ secrets: Array<{ id: string; key: string; value: string; version: number }> }> {
    return await jsonRequest(orgSlug, "/shares/snapshot", {
      method: "POST", body: body({ projectSlug, environmentSlug, secretIds, confirmProduction }),
    }) as { secrets: Array<{ id: string; key: string; value: string; version: number }> };
  },

  async createShare(orgSlug: string, input: Record<string, unknown>): Promise<{ id: string }> {
    return await jsonRequest(orgSlug, "/shares", { method: "POST", body: body(input) }) as { id: string };
  },

  async shares(orgSlug: string): Promise<SecretShareRecord[]> {
    const result = await jsonRequest(orgSlug, "/shares") as { shares: SecretShareRecord[] };
    return result.shares;
  },

  async revokeShare(orgSlug: string, id: string): Promise<void> {
    await jsonRequest(orgSlug, `/shares/${encodePath(id)}`, { method: "DELETE" });
  },

  async bulkAction(
    orgSlug: string, projectSlug: string, environmentSlug: string,
    input: Record<string, unknown>,
  ): Promise<{ moved?: number; deleted?: number; skipped?: string[] }> {
    return await jsonRequest(orgSlug, `${environmentPath(projectSlug, environmentSlug)}/bulk`, {
      method: "POST", body: body(input),
    }) as { moved?: number; deleted?: number; skipped?: string[] };
  },
  async overview(
    orgSlug: string,
    signal?: AbortSignal,
  ): Promise<SecretsOverview> {
    const payload = await jsonRequest(orgSlug, "/overview", { signal });
    signal?.throwIfAborted();
    const record = unwrapRecord(payload, ["overview", "data"]);
    const summary = isRecord(record.summary) ? record.summary : record;
    const collection = (value: unknown, keys: string[]): unknown[] | null => {
      if (Array.isArray(value)) return value;
      if (!isRecord(value)) return null;
      for (const key of keys) {
        if (Array.isArray(value[key])) return value[key] as unknown[];
      }
      return null;
    };
    const validCount = (value: unknown) => value === undefined || (
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    );
    const namedRecord = (value: unknown): value is JsonRecord =>
      isRecord(value) &&
      ["id", "name", "slug"].every((key) => value[key] === undefined || (
        typeof value[key] === "string" && value[key].trim().length > 0
      )) &&
      (typeof value.name === "string" || typeof value.slug === "string");
    const projectItems = collection(record.projects, ["projects"]);
    const activityItems = collection(record.recentActivity ?? record.audit, ["events", "items"]);
    if (
      !isRecord(payload) ||
      (record.summary !== undefined && !isRecord(record.summary)) ||
      ![summary.projectCount, summary.environmentCount, summary.secretCount,
        summary.environments, summary.secrets,
        ...(isRecord(record.summary) ? [summary.projects] : [])].every(validCount) ||
      !projectItems || !activityItems ||
      !projectItems.every((project) => namedRecord(project) &&
        validCount(project.environmentCount) && validCount(project.secretCount) &&
        (project.environments === undefined || (
          Array.isArray(project.environments) && project.environments.every((environment) =>
            namedRecord(environment) && validCount(environment.secretCount) &&
            validCount(environment.secretsCount) && validCount(environment.revision),
          )
        ))) ||
      !activityItems.every((event) => isRecord(event) &&
        typeof event.action === "string" && event.action.trim().length > 0)
    ) {
      throw new SecretsClientError(
        "The secrets overview response is invalid.", 502, "INVALID_RESPONSE",
      );
    }
    const projects = projectItems.map(normalizeProject);
    return {
      projectCount: integer(
        summary.projectCount,
        integer(summary.projects, projects.length),
      ),
      environmentCount: integer(
        summary.environmentCount,
        integer(
          summary.environments,
          projects.reduce(
            (total, project) => total + project.environmentCount,
            0,
          ),
        ),
      ),
      secretCount: integer(
        summary.secretCount,
        integer(
          summary.secrets,
          projects.reduce((total, project) => total + project.secretCount, 0),
        ),
      ),
      projects,
      recentActivity: activityItems.map(normalizeAuditEvent),
    };
  },

  async projects(orgSlug: string, signal?: AbortSignal): Promise<SecretProject[]> {
    const payload = await jsonRequest(orgSlug, "/projects", { signal });
    signal?.throwIfAborted();
    return normalizeProjectsReadResponse(payload);
  },

  async project(orgSlug: string, projectSlug: string, signal?: AbortSignal): Promise<SecretProject> {
    const payload = await jsonRequest(
      orgSlug,
      `/projects/${encodePath(projectSlug)}`,
      { signal },
    );
    signal?.throwIfAborted();
    return normalizeProjectReadResponse(payload);
  },

  async createProject(
    orgSlug: string,
    input: { name: string; slug?: string; description?: string },
  ): Promise<SecretProject> {
    const payload = await jsonRequest(orgSlug, "/projects", {
      method: "POST",
      body: body(input),
    });
    return normalizeProjectResponse(payload);
  },

  async updateProject(
    orgSlug: string,
    projectSlug: string,
    input: { name?: string; slug?: string; description?: string },
  ): Promise<SecretProject> {
    const payload = await jsonRequest(
      orgSlug,
      `/projects/${encodePath(projectSlug)}`,
      { method: "PATCH", body: body(input) },
    );
    return normalizeProject(unwrapRecord(payload, ["project", "data"]));
  },

  async deleteProject(
    orgSlug: string,
    projectSlug: string,
    input: { confirmation: string; confirmProduction?: boolean },
  ): Promise<void> {
    await jsonRequest(orgSlug, `/projects/${encodePath(projectSlug)}`, {
      method: "DELETE",
      body: body(input),
    });
  },

  async createEnvironment(
    orgSlug: string,
    projectSlug: string,
    input: {
      name: string;
      slug?: string;
      description?: string;
      color?: string;
      confirmation?: string;
      confirmProduction?: boolean;
    },
  ): Promise<SecretEnvironment> {
    const payload = await jsonRequest(
      orgSlug,
      `/projects/${encodePath(projectSlug)}/environments`,
      { method: "POST", body: body(input) },
    );
    return normalizeEnvironment(unwrapRecord(payload, ["environment", "data"]));
  },

  async updateEnvironment(
    orgSlug: string,
    projectSlug: string,
    environmentSlug: string,
    input: {
      name?: string;
      slug?: string;
      description?: string;
      color?: string;
      confirmation: string;
      expectedRevision: number;
      confirmProduction?: boolean;
    },
  ): Promise<SecretEnvironment> {
    const payload = await jsonRequest(
      orgSlug,
      environmentPath(projectSlug, environmentSlug),
      { method: "PATCH", body: body(input) },
    );
    return normalizeEnvironment(unwrapRecord(payload, ["environment", "data"]));
  },

  async deleteEnvironment(
    orgSlug: string,
    projectSlug: string,
    environmentSlug: string,
    input: { confirmation: string; confirmProduction?: boolean },
  ): Promise<void> {
    await jsonRequest(orgSlug, environmentPath(projectSlug, environmentSlug), {
      method: "DELETE",
      body: body(input),
    });
  },

  async secrets(
    orgSlug: string,
    projectSlug: string,
    environmentSlug: string,
  ): Promise<SecretMetadata[]> {
    const payload = await jsonRequest(
      orgSlug,
      `${environmentPath(projectSlug, environmentSlug)}/secrets`,
    );
    return unwrapArray(payload, ["secrets", "items", "data"]).map(
      normalizeSecret,
    );
  },

  async createSecret(
    orgSlug: string,
    projectSlug: string,
    environmentSlug: string,
    input: {
      key: string;
      value: string;
      environmentSlugs?: string[];
      expectedRevisions: Record<string, number>;
      expectedRevision?: number;
      confirmProduction?: boolean;
    },
  ): Promise<SecretMetadata[]> {
    const payload = await jsonRequest(
      orgSlug,
      `${environmentPath(projectSlug, environmentSlug)}/secrets`,
      { method: "POST", body: body(input) },
    );
    const list = unwrapArray(payload, ["secrets", "items", "data"]);
    if (list.length) return list.map(normalizeSecret);
    return [normalizeSecret(unwrapRecord(payload, ["secret", "data"]))];
  },

  async updateSecret(
    orgSlug: string,
    projectSlug: string,
    environmentSlug: string,
    secretId: string,
    input: {
      key?: string;
      value?: string;
      expectedRevision?: number;
      expectedVersion?: number;
      confirmProduction?: boolean;
    },
  ): Promise<SecretMetadata> {
    const payload = await jsonRequest(
      orgSlug,
      secretPath(projectSlug, environmentSlug, secretId),
      { method: "PATCH", body: body(input) },
    );
    return normalizeSecret(unwrapRecord(payload, ["secret", "data"]));
  },

  async deleteSecret(
    orgSlug: string,
    projectSlug: string,
    environmentSlug: string,
    secretId: string,
    input: {
      expectedRevision?: number;
      confirmation: string;
      confirmProduction?: boolean;
    },
  ): Promise<void> {
    await jsonRequest(
      orgSlug,
      secretPath(projectSlug, environmentSlug, secretId),
      { method: "DELETE", body: body(input) },
    );
  },

  async revealSecret(
    orgSlug: string,
    projectSlug: string,
    environmentSlug: string,
    secretId: string,
    input: { intent: "reveal" | "copy"; version?: number },
    signal?: AbortSignal,
  ): Promise<{ value: string; expiresIn: number }> {
    const payload = await jsonRequest(
      orgSlug,
      `${secretPath(projectSlug, environmentSlug, secretId)}/reveal`,
      { method: "POST", body: body(input), signal },
    );
    signal?.throwIfAborted();
    const record = unwrapRecord(payload, ["secret", "data"]);
    return {
      value: text(record.value),
      expiresIn: Math.min(30, Math.max(1, integer(record.expiresIn, 30))),
    };
  },

  async versions(
    orgSlug: string,
    projectSlug: string,
    environmentSlug: string,
    secretId: string,
    signal?: AbortSignal,
  ): Promise<SecretVersion[]> {
    const payload = await jsonRequest(
      orgSlug,
      `${secretPath(projectSlug, environmentSlug, secretId)}/versions`,
      { signal },
    );
    signal?.throwIfAborted();
    const items = Array.isArray(payload) ? payload : isRecord(payload)
      ? [payload.versions, payload.items, payload.data].find((value) => value !== undefined)
      : undefined;
    if (!Array.isArray(items) || !items.every((item) => isRecord(item) &&
      typeof item.version === "number" && Number.isSafeInteger(item.version) && item.version > 0 &&
      typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt)))) {
      throw new SecretsClientError("The version history response is invalid.", 502, "INVALID_RESPONSE");
    }
    return items.map(normalizeVersion);
  },

  async rollback(
    orgSlug: string,
    projectSlug: string,
    environmentSlug: string,
    secretId: string,
    input: {
      version: number;
      expectedRevision?: number;
      expectedVersion?: number;
      confirmProduction?: boolean;
    },
  ): Promise<SecretMetadata> {
    const payload = await jsonRequest(
      orgSlug,
      `${secretPath(projectSlug, environmentSlug, secretId)}/rollback`,
      { method: "POST", body: body(input) },
    );
    return normalizeSecret(unwrapRecord(payload, ["secret", "data"]));
  },

  async revision(
    orgSlug: string,
    projectSlug: string,
    environmentSlug: string,
  ): Promise<EnvironmentRevision> {
    const payload = await jsonRequest(
      orgSlug,
      `${environmentPath(projectSlug, environmentSlug)}/revision`,
    );
    const record = unwrapRecord(payload, ["revision", "data"]);
    return {
      revision: integer(
        typeof record.revision === "number" ? record.revision : payload,
      ),
      updatedAt: nullableText(record.updatedAt),
    };
  },

  async importDotenv(
    orgSlug: string,
    projectSlug: string,
    environmentSlug: string,
    input: {
      envText: string;
      dryRun?: boolean;
      expectedRevision?: number;
      confirmProduction?: boolean;
    },
  ): Promise<ImportReview> {
    const payload = await jsonRequest(
      orgSlug,
      `${environmentPath(projectSlug, environmentSlug)}/import`,
      { method: "POST", body: body(input) },
    );
    const record = unwrapRecord(payload, ["result", "preview", "data"]);
    const keysRecord = isRecord(record.keys) ? record.keys : null;
    const groupedKeys = keysRecord
      ? (["created", "updated", "unchanged", "skipped"] as const).flatMap(
          (group) =>
            array(keysRecord[group]).map((value) => ({
              key: text(isRecord(value) ? value.key : value),
              action:
                group === "created"
                  ? ("create" as const)
                  : group === "updated"
                    ? ("update" as const)
                    : group === "unchanged"
                      ? ("unchanged" as const)
                      : ("skip" as const),
              reason: isRecord(value) ? nullableText(value.reason) : null,
            })),
        )
      : null;
    return {
      created: integer(record.created, integer(record.createCount)),
      updated: integer(record.updated, integer(record.updateCount)),
      unchanged: integer(record.unchanged, integer(record.unchangedCount)),
      skipped: integer(record.skipped, integer(record.skipCount)),
      keys:
        groupedKeys ??
        array(record.keys ?? record.changes).map((value) => {
          const item = isRecord(value) ? value : {};
          const rawAction = text(item.action, "skip");
          const action =
            rawAction === "create" ||
            rawAction === "update" ||
            rawAction === "unchanged"
              ? rawAction
              : "skip";
          return {
            key: text(item.key),
            action,
            reason: nullableText(item.reason),
          };
        }),
      revision:
        typeof record.revision === "number"
          ? integer(record.revision)
          : undefined,
    };
  },

  async exportDotenv(
    orgSlug: string,
    projectSlug: string,
    environmentSlug: string,
    input: { confirmation: string; confirmProduction: boolean },
  ): Promise<Blob> {
    const response = await request(
      orgSlug,
      `${environmentPath(projectSlug, environmentSlug)}/export`,
      {
        method: "POST",
        headers: { Accept: "text/plain" },
        body: body(input),
      },
    );
    if (response.headers.get("content-type")?.includes("application/json")) {
      const payload: unknown = await response.json();
      const record = unwrapRecord(payload, ["data"]);
      return new Blob([text(record.envText)], {
        type: "text/plain;charset=utf-8",
      });
    }
    return response.blob();
  },

  async audit(
    orgSlug: string,
    cursor?: string | null,
  ): Promise<SecretAuditPage> {
    const search = new URLSearchParams({ limit: "50" });
    if (cursor) search.set("cursor", cursor);
    const payload = await jsonRequest(orgSlug, `/audit?${search.toString()}`);
    const record = isRecord(payload) ? payload : {};
    return {
      events: unwrapArray(payload, ["events", "audit", "items", "data"]).map(
        normalizeAuditEvent,
      ),
      nextCursor: nullableText(record.nextCursor),
    };
  },
};
