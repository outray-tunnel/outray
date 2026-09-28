import {
  decryptAlertWebhook,
  readWebhookKeyring,
  unwrapAlertOrganizationKey,
  validAlertWebhookUrl,
  type AlertWebhookChannel,
  type EncryptedAlertWebhook,
} from "./alert-webhook-crypto";
import { config } from "../config";
import { databasePool } from "./database";
import type { AlertEmailPayload } from "./alert-email";

export function webhookKeyringAvailable() {
  try {
    readWebhookKeyring();
    return true;
  } catch {
    return false;
  }
}

export async function resolveAlertWebhook(input: {
  organizationId: string;
  alertId: string;
  channel: AlertWebhookChannel;
  fingerprint: string | undefined;
}): Promise<string | null> {
  const column = input.channel === "slack"
    ? "notification_slack_webhook"
    : "notification_discord_webhook";
  const alertResult = await databasePool.query<{
    encrypted: EncryptedAlertWebhook | null;
  }>(
    `SELECT ${column} AS encrypted
     FROM observability_alerts
     WHERE id = $1 AND organization_id = $2
       AND enabled = true AND deleted_at IS NULL
       AND (muted_until IS NULL OR muted_until <= NOW())`,
    [input.alertId, input.organizationId],
  );
  const encrypted = alertResult.rows[0]?.encrypted;
  if (!encrypted || !input.fingerprint || encrypted.fingerprint !== input.fingerprint) {
    return null;
  }

  const keyResult = await databasePool.query<{
    wrapped_key: string;
    iv: string;
    auth_tag: string;
    wrapping_key_id: string;
  }>(
    `SELECT wrapped_key, iv, auth_tag, wrapping_key_id
     FROM secret_organization_keys
     WHERE organization_id = $1 AND version = $2`,
    [input.organizationId, encrypted.organizationKeyVersion],
  );
  const keyRow = keyResult.rows[0];
  if (!keyRow) throw new Error("Alert webhook encryption key is unavailable");
  const organizationKey = unwrapAlertOrganizationKey(
    input.organizationId,
    encrypted.organizationKeyVersion,
    keyRow,
  );
  try {
    const url = decryptAlertWebhook(
      organizationKey,
      input.organizationId,
      input.alertId,
      input.channel,
      encrypted,
    );
    if (!validAlertWebhookUrl(url, input.channel)) {
      throw new Error("Alert webhook destination is invalid");
    }
    return url;
  } finally {
    organizationKey.fill(0);
  }
}

export async function sendAlertWebhook(
  channel: AlertWebhookChannel,
  url: string,
  payload: AlertEmailPayload,
): Promise<void> {
  if (!validAlertWebhookUrl(url, channel)) {
    throw new Error("Alert webhook destination is invalid");
  }
  const state = payload.state === "firing" ? "Firing" : "Resolved";
  const alertUrl = payload.organizationSlug
    ? `${config.appUrl}/${encodeURIComponent(payload.organizationSlug)}/observability/alerts/${encodeURIComponent(payload.alertId)}`
    : config.appUrl;
  const value = payload.value === null ? "No data" : String(payload.value);
  const content = `[${state}] ${payload.alertName}\nService: ${payload.service}\nValue: ${value} · Threshold: ${payload.threshold}\n${alertUrl}`;
  const body = channel === "slack"
    ? { text: escapeSlack(content) }
    : { content: content.slice(0, 1_900), allowed_mentions: { parse: [] } };
  const endpoint = channel === "discord" ? `${url}?wait=true` : url;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const error = new Error(`${channel} webhook delivery failed (${response.status})`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
}

function escapeSlack(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/@/g, "＠");
}
