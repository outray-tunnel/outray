import type { SecretsTarget } from "./secrets-config";

export interface SecretRecord {
  id: string;
  key: string;
  value?: string;
  version: number;
  updatedAt: string;
}

export interface SecretCollectionResponse {
  organization: { id: string; name: string; slug: string };
  project: { id: string; name: string; slug: string };
  environment: { id: string; name: string; slug: string };
  secrets: SecretRecord[];
}

export interface SecretRevisionResponse {
  revision: number;
  count: number;
  updatedAt: string | null;
}

export interface SecretTargetEnvironment {
  id: string;
  name: string;
  slug: string;
  isProduction: boolean;
}

export interface SecretTargetProject {
  id: string;
  name: string;
  slug: string;
  environments: SecretTargetEnvironment[];
}

export interface SecretTargetOrganization {
  id: string;
  name: string;
  slug: string;
  projects: SecretTargetProject[];
}

export interface SecretTargetsResponse {
  organizations: SecretTargetOrganization[];
}

export interface SecretWriteResponse {
  created: number;
  updated: number;
  unchanged: number;
  revision: number;
}

export interface SecretDeleteResponse {
  deleted: number;
  revision: number;
}

export interface SecretRollbackResponse {
  secret: SecretRecord;
  revision: number;
  unchanged?: boolean;
}

type Fetch = typeof fetch;

export class SecretsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SecretsApiError";
  }
}

function targetParams(target: SecretsTarget): URLSearchParams {
  return new URLSearchParams({
    organization: target.organization,
    project: target.project,
    environment: target.environment,
  });
}

function setConfirmation(
  params: URLSearchParams,
  confirmProduction?: boolean,
): void {
  if (confirmProduction) params.set("confirmProduction", "true");
}

export class SecretsApiClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    let payload: unknown;
    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = text ? { error: text } : null;
    }

    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `Secrets request failed with status ${response.status}.`;
      const code =
        payload &&
        typeof payload === "object" &&
        "code" in payload &&
        typeof (payload as { code?: unknown }).code === "string"
          ? (payload as { code: string }).code
          : undefined;
      const details =
        payload &&
        typeof payload === "object" &&
        "details" in payload &&
        (payload as { details?: unknown }).details !== null &&
        typeof (payload as { details?: unknown }).details === "object" &&
        !Array.isArray((payload as { details?: unknown }).details)
          ? ((payload as { details: Record<string, unknown> }).details)
          : undefined;
      throw new SecretsApiError(message, response.status, code, details);
    }

    return payload as T;
  }

  list(
    target: SecretsTarget,
    options: { values?: boolean; confirmProduction?: boolean } = {},
  ): Promise<SecretCollectionResponse> {
    const params = targetParams(target);
    setConfirmation(params, options.confirmProduction);
    if (!options.values) {
      params.set("values", "false");
      return this.request(`/api/cli/secrets?${params.toString()}`);
    }
    return this.request(`/api/cli/secrets?${params.toString()}`, {
      method: "POST",
      body: JSON.stringify({
        ...(options.confirmProduction ? { confirmProduction: true } : {}),
      }),
    });
  }

  put(
    target: SecretsTarget,
    secrets: Record<string, string>,
    options: {
      expectedRevision: number;
      expectedVersions: Record<string, number | null>;
      confirmProduction?: boolean;
    },
  ): Promise<SecretWriteResponse> {
    const params = targetParams(target);
    setConfirmation(params, options.confirmProduction);
    return this.request(`/api/cli/secrets?${params.toString()}`, {
      method: "PUT",
      body: JSON.stringify({
        secrets,
        expectedRevision: options.expectedRevision,
        expectedVersions: options.expectedVersions,
        ...(options.confirmProduction ? { confirmProduction: true } : {}),
      }),
    });
  }

  delete(
    target: SecretsTarget,
    key: string,
    options: {
      expectedRevision: number;
      expectedVersion: number;
      confirmProduction?: boolean;
    },
  ): Promise<SecretDeleteResponse> {
    const params = targetParams(target);
    params.set("key", key);
    setConfirmation(params, options.confirmProduction);
    return this.request(`/api/cli/secrets?${params.toString()}`, {
      method: "DELETE",
      body: JSON.stringify({
        expectedRevision: options.expectedRevision,
        expectedVersion: options.expectedVersion,
        ...(options.confirmProduction ? { confirmProduction: true } : {}),
      }),
    });
  }

  rollback(
    target: SecretsTarget,
    secretId: string,
    version: number,
    options: {
      expectedRevision: number;
      expectedVersion: number;
      confirmProduction?: boolean;
    },
  ): Promise<SecretRollbackResponse> {
    const params = targetParams(target);
    setConfirmation(params, options.confirmProduction);
    return this.request(`/api/cli/secrets/rollback?${params.toString()}`, {
      method: "POST",
      body: JSON.stringify({
        secretId,
        version,
        expectedRevision: options.expectedRevision,
        expectedVersion: options.expectedVersion,
        ...(options.confirmProduction ? { confirmProduction: true } : {}),
      }),
    });
  }

  revision(
    target: SecretsTarget,
    options: { confirmProduction?: boolean } = {},
  ): Promise<SecretRevisionResponse> {
    const params = targetParams(target);
    setConfirmation(params, options.confirmProduction);
    return this.request(`/api/cli/secrets/revision?${params.toString()}`);
  }

  targets(): Promise<SecretTargetsResponse> {
    return this.request("/api/cli/secrets/targets");
  }
}
