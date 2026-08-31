export const SECRETS_SCOPES = [
  "secrets:read",
  "secrets:reveal",
  "secrets:write",
  "secrets:delete",
  "secrets:admin",
] as const;

export type SecretsScope = (typeof SECRETS_SCOPES)[number];
export type SecretsActorType = "user" | "machine" | "system";

export type SecretsActor = {
  type: SecretsActorType;
  credential: "session" | "cli" | "machine" | "system";
  id: string | null;
  userId: string | null;
  role: string | null;
  tokenId: string | null;
  projectId: string | null;
  environmentId: string | null;
  scopes: string[];
};

export type SecretsAccess = {
  organization: { id: string; slug: string; name: string };
  actor: SecretsActor;
  requestMetadata: {
    ipAddress: string | null;
    userAgent: string | null;
    requestId: string;
  };
};

export type SecretMetadata = {
  id: string;
  key: string;
  description: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export class SecretsError extends Error {
  readonly code: string;
  readonly status: number;
  readonly field?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code: string;
      status: number;
      field?: string;
      details?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = "SecretsError";
    this.code = options.code;
    this.status = options.status;
    this.field = options.field;
    this.details = options.details;
  }
}

export function serializeSecretMetadata(row: {
  id: string;
  key: string;
  description: string | null;
  currentVersion: number;
  createdAt: Date;
  updatedAt: Date;
}): SecretMetadata {
  return {
    id: row.id,
    key: row.key,
    description: row.description,
    version: row.currentVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
