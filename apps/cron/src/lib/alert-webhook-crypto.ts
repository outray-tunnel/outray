import { createDecipheriv } from "node:crypto";

export type AlertWebhookChannel = "slack" | "discord";
export type EncryptedAlertWebhook = {
  ciphertext: string;
  iv: string;
  authTag: string;
  algorithm: "AES-256-GCM";
  organizationKeyVersion: number;
  fingerprint: string;
};

type Key = { id: string; value: Buffer };

function decodeKey(value: string) {
  const trimmed = value.trim();
  const key = /^[a-fA-F0-9]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");
  if (key.length !== 32) throw new Error("Alert webhook master key is invalid");
  return key;
}

export function readWebhookKeyring(): Key[] {
  const activeId = process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID?.trim();
  const activeValue = process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY;
  if (!activeId || !activeValue) throw new Error("Alert webhook master key is unavailable");
  const keys: Key[] = [{ id: activeId, value: decodeKey(activeValue) }];
  const previous = process.env.OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS;
  if (previous?.trim()) {
    const parsed: unknown = JSON.parse(previous);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Previous alert webhook master keys are invalid");
    }
    for (const [id, value] of Object.entries(parsed)) {
      if (!id.trim() || typeof value !== "string") {
        throw new Error("Previous alert webhook master keys are invalid");
      }
      keys.push({ id, value: decodeKey(value) });
    }
  }
  if (new Set(keys.map((key) => key.id)).size !== keys.length) {
    throw new Error("Alert webhook master key IDs must be unique");
  }
  return keys;
}

function decrypt(key: Buffer, ciphertext: string, iv: string, authTag: string, aad: string) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
}

export function unwrapAlertOrganizationKey(
  organizationId: string,
  version: number,
  row: { wrapped_key: string; iv: string; auth_tag: string; wrapping_key_id: string },
) {
  const key = readWebhookKeyring().find((candidate) => candidate.id === row.wrapping_key_id);
  if (!key) throw new Error("Alert webhook wrapping key is unavailable");
  return decrypt(
    key.value,
    row.wrapped_key,
    row.iv,
    row.auth_tag,
    `outray:secrets:organization-key:v1:${organizationId}:${version}:${row.wrapping_key_id}`,
  );
}

export function decryptAlertWebhook(
  key: Buffer,
  organizationId: string,
  alertId: string,
  channel: AlertWebhookChannel,
  payload: EncryptedAlertWebhook,
) {
  return decrypt(
    key,
    payload.ciphertext,
    payload.iv,
    payload.authTag,
    `outray:alerts:webhook:v1:${organizationId}:${alertId}:${channel}:${payload.organizationKeyVersion}`,
  ).toString("utf8");
}

export function validAlertWebhookUrl(value: string, channel: AlertWebhookChannel) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) {
    return false;
  }
  if (channel === "slack") {
    return (
      (url.hostname === "hooks.slack.com" || url.hostname === "hooks.slack-gov.com") &&
      /^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(url.pathname)
    );
  }
  return url.hostname === "discord.com" &&
    /^\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+$/.test(url.pathname);
}
