import { createDecipheriv } from "node:crypto";
import type { Pool } from "pg";
import { validateHeaders } from "./probe";

export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  authTag: string;
  algorithm: "AES-256-GCM";
  organizationKeyVersion: number;
  fingerprint?: string;
};

type KeyRow = { wrapped_key: string; iv: string; auth_tag: string; wrapping_key_id: string };

function decodeMasterKey(value: string): Buffer {
  const normalized = value.trim();
  const key = /^[a-f0-9]{64}$/i.test(normalized)
    ? Buffer.from(normalized, "hex") : Buffer.from(normalized, "base64");
  if (key.length !== 32) throw new Error("Invalid Uptime encryption key");
  return key;
}

function masterKeys() {
  const activeId = process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID?.trim();
  const activeValue = process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY;
  if (!activeId || !activeValue) throw new Error("Uptime encryption key is unavailable");
  const keys = new Map<string, Buffer>([[activeId, decodeMasterKey(activeValue)]]);
  const previous = process.env.OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS;
  if (previous?.trim()) {
    const parsed: unknown = JSON.parse(previous);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Previous Uptime encryption keys are invalid");
    }
    for (const [id, value] of Object.entries(parsed)) {
      if (!id || typeof value !== "string" || keys.has(id)) {
        throw new Error("Previous Uptime encryption keys are invalid");
      }
      keys.set(id, decodeMasterKey(value));
    }
  }
  return keys;
}

function decrypt(key: Buffer, encrypted: { ciphertext: string; iv: string; authTag: string }, aad: string) {
  const iv = Buffer.from(encrypted.iv, "base64");
  const tag = Buffer.from(encrypted.authTag, "base64");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid Uptime ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]);
}

async function organizationKey(pool: Pool, organizationId: string, version: number): Promise<Buffer> {
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("Invalid Uptime key version");
  const result = await pool.query<KeyRow>(
    `SELECT wrapped_key, iv, auth_tag, wrapping_key_id
     FROM secret_organization_keys WHERE organization_id = $1 AND version = $2`,
    [organizationId, version],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Uptime organization key is unavailable");
  const keys = masterKeys();
  const masterKey = keys.get(row.wrapping_key_id);
  if (!masterKey) throw new Error("Uptime master key is unavailable");
  try {
    return decrypt(masterKey,
      { ciphertext: row.wrapped_key, iv: row.iv, authTag: row.auth_tag },
      `outray:secrets:organization-key:v1:${organizationId}:${version}:${row.wrapping_key_id}`,
    );
  } finally {
    for (const key of keys.values()) key.fill(0);
  }
}

function assertPayload(payload: EncryptedPayload): void {
  if (!payload || payload.algorithm !== "AES-256-GCM" ||
      typeof payload.ciphertext !== "string" || typeof payload.iv !== "string" ||
      typeof payload.authTag !== "string") {
    throw new Error("Invalid Uptime ciphertext");
  }
}

export async function decryptMonitorHeaders(
  pool: Pool, organizationId: string, monitorId: string, payload: EncryptedPayload | null,
): Promise<Record<string, string>> {
  if (!payload) return {};
  assertPayload(payload);
  const key = await organizationKey(pool, organizationId, payload.organizationKeyVersion);
  try {
    const plaintext = decrypt(key, payload,
      `outray:uptime:monitor-headers:v1:${organizationId}:${monitorId}:${payload.organizationKeyVersion}`,
    ).toString("utf8");
    const parsed: unknown = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid Uptime header payload");
    }
    return validateHeaders(parsed as Record<string, string>);
  } finally {
    key.fill(0);
  }
}

export async function decryptIntegrationWebhook(
  pool: Pool, organizationId: string, provider: "slack" | "discord", payload: EncryptedPayload,
): Promise<string> {
  assertPayload(payload);
  const key = await organizationKey(pool, organizationId, payload.organizationKeyVersion);
  try {
    return decrypt(key, payload,
      `outray:uptime:webhook:v1:${organizationId}:${provider}:${payload.organizationKeyVersion}`,
    ).toString("utf8");
  } finally {
    key.fill(0);
  }
}
