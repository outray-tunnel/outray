import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { SecretsError } from "./types";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export type MasterKey = { id: string; key: Buffer };
export type SecretsKeyring = {
  active: MasterKey;
  previous: MasterKey[];
};

export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  authTag: string;
  algorithm: "AES-256-GCM";
};

export type WrappedOrganizationKey = EncryptedPayload & {
  wrappingKeyId: string;
  organizationKeyVersion: number;
};

export function decodeMasterKey(value: string): Buffer {
  const normalized = value.trim();
  let decoded: Buffer;
  if (/^[a-fA-F0-9]{64}$/.test(normalized)) {
    decoded = Buffer.from(normalized, "hex");
  } else {
    try {
      decoded = Buffer.from(normalized, "base64");
    } catch {
      decoded = Buffer.alloc(0);
    }
  }

  if (decoded.length !== KEY_BYTES) {
    throw new SecretsError(
      "Secrets master keys must decode to exactly 32 bytes",
      { code: "SECRETS_KEY_INVALID", status: 503 },
    );
  }
  return decoded;
}

export function masterKeyId(key: Buffer): string {
  return `sha256:${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

function configuredKey(
  value: string | undefined,
  configuredId: string | undefined,
): MasterKey | undefined {
  if (!value?.trim()) return undefined;
  const key = decodeMasterKey(value);
  return { id: configuredId?.trim() || masterKeyId(key), key };
}

export function readSecretsKeyring(
  environment: NodeJS.ProcessEnv = process.env,
): SecretsKeyring {
  if (!environment.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID?.trim()) {
    throw new SecretsError(
      "OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID is not configured",
      { code: "SECRETS_KEY_UNAVAILABLE", status: 503 },
    );
  }
  const active = configuredKey(
    environment.OUTRAY_SECRETS_ACTIVE_MASTER_KEY,
    environment.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID,
  );
  if (!active) {
    throw new SecretsError("Secrets encryption is not configured", {
      code: "SECRETS_KEY_UNAVAILABLE",
      status: 503,
    });
  }

  const previous: MasterKey[] = [];
  const configuredPrevious = environment.OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS;
  if (configuredPrevious?.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(configuredPrevious);
    } catch {
      throw new SecretsError(
        "OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS must be a JSON object",
        { code: "SECRETS_KEY_INVALID", status: 503 },
      );
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new SecretsError(
        "OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS must be a JSON object",
        { code: "SECRETS_KEY_INVALID", status: 503 },
      );
    }
    for (const [id, value] of Object.entries(parsed)) {
      if (!id.trim() || typeof value !== "string") {
        throw new SecretsError(
          "Previous master key IDs and values must be non-empty strings",
          { code: "SECRETS_KEY_INVALID", status: 503 },
        );
      }
      const candidate = configuredKey(value, id);
      if (candidate) previous.push(candidate);
    }
  }
  const ids = [active.id, ...previous.map((key) => key.id)];
  if (new Set(ids).size !== ids.length) {
    throw new SecretsError("Secrets master key IDs must be unique", {
      code: "SECRETS_KEY_INVALID",
      status: 503,
    });
  }
  return { active, previous };
}

export function nextOrganizationKeyVersion(versions: readonly number[]) {
  if (
    versions.some(
      (version) => !Number.isSafeInteger(version) || version < 1,
    )
  ) {
    throw new SecretsError("Organization key versions must be positive integers", {
      code: "SECRETS_KEY_INVALID",
      status: 500,
    });
  }
  return (versions.length ? Math.max(...versions) : 0) + 1;
}

function encrypt(key: Buffer, plaintext: Buffer, aad: string): EncryptedPayload {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    algorithm: "AES-256-GCM",
  };
}

function decrypt(
  key: Buffer,
  payload: Pick<EncryptedPayload, "ciphertext" | "iv" | "authTag">,
  aad: string,
): Buffer {
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(payload.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]);
  } catch {
    throw new SecretsError("Secret ciphertext authentication failed", {
      code: "SECRETS_DECRYPTION_FAILED",
      status: 500,
    });
  }
}

function organizationKeyAad(
  organizationId: string,
  organizationKeyVersion: number,
  wrappingKeyId: string,
) {
  return `outray:secrets:organization-key:v1:${organizationId}:${organizationKeyVersion}:${wrappingKeyId}`;
}

export function createOrganizationKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

export function wrapOrganizationKey(
  organizationId: string,
  organizationKeyVersion: number,
  organizationKey: Buffer,
  masterKey: MasterKey,
): WrappedOrganizationKey {
  if (organizationKey.length !== KEY_BYTES) {
    throw new SecretsError("Organization data key must be 32 bytes", {
      code: "SECRETS_KEY_INVALID",
      status: 500,
    });
  }
  return {
    ...encrypt(
      masterKey.key,
      organizationKey,
      organizationKeyAad(organizationId, organizationKeyVersion, masterKey.id),
    ),
    wrappingKeyId: masterKey.id,
    organizationKeyVersion,
  };
}

export function unwrapOrganizationKey(
  organizationId: string,
  payload: WrappedOrganizationKey,
  keyring: SecretsKeyring,
): Buffer {
  const masterKey = [keyring.active, ...keyring.previous].find(
    (candidate) => candidate?.id === payload.wrappingKeyId,
  );
  if (!masterKey) {
    throw new SecretsError(
      `No configured master key can unwrap organization key ${payload.wrappingKeyId}`,
      { code: "SECRETS_KEY_UNAVAILABLE", status: 503 },
    );
  }
  return decrypt(
    masterKey.key,
    payload,
    organizationKeyAad(
      organizationId,
      payload.organizationKeyVersion,
      payload.wrappingKeyId,
    ),
  );
}

function secretValueAad(input: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  entryId: string;
  version: number;
  keySnapshot: string;
  organizationKeyVersion: number;
}) {
  return [
    "outray:secrets:value:v1",
    input.organizationId,
    input.projectId,
    input.environmentId,
    input.entryId,
    String(input.version),
    String(input.organizationKeyVersion),
    Buffer.from(input.keySnapshot, "utf8").toString("base64url"),
  ].join(":");
}

export function encryptSecretValue(
  organizationKey: Buffer,
  input: {
    organizationId: string;
    projectId: string;
    environmentId: string;
    entryId: string;
    version: number;
    keySnapshot: string;
    organizationKeyVersion: number;
    value: string;
  },
): EncryptedPayload & { valueDigest: string } {
  const plaintext = Buffer.from(input.value, "utf8");
  return {
    ...encrypt(organizationKey, plaintext, secretValueAad(input)),
    valueDigest: createHmac("sha256", organizationKey)
      .update("outray:secrets:value-digest:v1\0", "utf8")
      .update(plaintext)
      .digest("hex"),
  };
}

export function decryptSecretValue(
  organizationKey: Buffer,
  input: {
    organizationId: string;
    projectId: string;
    environmentId: string;
    entryId: string;
    version: number;
    keySnapshot: string;
    organizationKeyVersion: number;
    ciphertext: string;
    iv: string;
    authTag: string;
  },
): string {
  return decrypt(organizationKey, input, secretValueAad(input)).toString("utf8");
}
