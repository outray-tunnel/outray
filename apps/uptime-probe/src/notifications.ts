import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import { renderIncidentHtml } from "@outray/incident-content";
import { config } from "./config";
import { decryptIntegrationWebhook, type EncryptedPayload } from "./crypto";

type Channel = "email" | "slack" | "discord";
type TeamPayload = {
  monitorId: string;
  monitorName: string;
  organizationSlug: string;
  state: "firing" | "resolved";
  statusCode: number | null;
  incidentStartedAt: string;
  webhookFingerprint?: string;
};
type SubscriberPayload = {
  pageId: string;
  pageSlug: string;
  incidentId: string;
  updateId: string;
  subscriberId: string;
  title: string;
  note: string;
  status: string;
};
type Notification = {
  id: string;
  organization_id: string;
  source_id: string;
  source_type: "uptime_monitor" | "uptime_incident_update";
  event: "firing" | "resolved" | "published";
  channel: Channel;
  recipient: string;
  payload: TeamPayload | SubscriberPayload;
  attempts: number;
};

let polling = false;
const workerId = `uptime-delivery-${randomUUID()}`;

export async function pollUptimeNotifications(pool: pg.Pool): Promise<void> {
  if (polling) return;
  const channels: Channel[] = [];
  if (config.zeptoApiKey) channels.push("email");
  if (process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY && process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID) {
    channels.push("slack", "discord");
  }
  const subscriberEnabled = Boolean(config.zeptoApiKey && config.statusPublicUrl && config.unsubscribeSecret);
  if (!channels.length && !subscriberEnabled) return;
  polling = true;
  try {
    const result = await pool.query<Notification>(
      `WITH due AS (
         SELECT id FROM notifications
         WHERE ((source_type = 'uptime_monitor' AND channel = ANY($1::text[]))
           OR (source_type = 'uptime_incident_update' AND event = 'published'
             AND channel = 'email' AND $3::boolean))
           AND attempts < max_attempts AND next_attempt_at <= NOW()
           AND (status = 'pending' OR (status = 'processing' AND lease_until < NOW()))
         ORDER BY next_attempt_at ASC
         FOR UPDATE SKIP LOCKED LIMIT 10
       )
       UPDATE notifications AS notification
       SET status = 'processing', lease_owner = $2,
           lease_until = NOW() + INTERVAL '30 seconds', updated_at = NOW()
       FROM due WHERE notification.id = due.id
       RETURNING notification.id, notification.organization_id,
         notification.source_id, notification.source_type, notification.event,
         notification.channel, notification.recipient,
         notification.payload, notification.attempts`,
      [channels, workerId, subscriberEnabled],
    );
    await Promise.all(result.rows.map((notification) => deliverNotification(pool, notification)));
  } catch (error) {
    console.error("[Uptime] Notification poll failed", safeErrorCode(error));
  } finally {
    polling = false;
  }
}

async function deliverNotification(pool: pg.Pool, notification: Notification) {
  try {
    if (notification.source_type === "uptime_incident_update") {
      await deliverSubscriberNotification(pool, notification);
      return;
    }
    const payload = notification.payload as TeamPayload;
    if (!validTeamPayload(payload, notification.source_id)) {
      await finish(pool, notification.id, "suppressed", "invalid_payload");
      return;
    }
    const monitor = await pool.query<{ enabled: boolean }>(
      `SELECT enabled FROM uptime_monitors
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [notification.source_id, notification.organization_id],
    );
    if (!monitor.rows[0]?.enabled) {
      await finish(pool, notification.id, "suppressed", "monitor_disabled");
      return;
    }
    if (notification.channel === "email") {
      const member = await pool.query(
        `SELECT 1 FROM members JOIN users ON users.id = members.user_id
         WHERE members.organization_id = $1 AND lower(users.email) = lower($2) LIMIT 1`,
        [notification.organization_id, notification.recipient],
      );
      if (!member.rowCount) {
        await finish(pool, notification.id, "suppressed", "recipient_not_member");
        return;
      }
      await sendEmail(notification.recipient, payload);
    } else {
      const integration = await pool.query<{ webhook_ciphertext: EncryptedPayload }>(
        `SELECT webhook_ciphertext FROM uptime_integrations
         WHERE organization_id = $1 AND provider = $2`,
        [notification.organization_id, notification.channel],
      );
      const encrypted = integration.rows[0]?.webhook_ciphertext;
      if (!encrypted || encrypted.fingerprint !== payload.webhookFingerprint) {
        await finish(pool, notification.id, "suppressed", "integration_changed");
        return;
      }
      const webhook = await decryptIntegrationWebhook(pool,
        notification.organization_id, notification.channel, encrypted);
      await sendWebhook(notification.channel, webhook, payload);
    }
    await finish(pool, notification.id, "sent", null);
  } catch (error) {
    const attempts = notification.attempts + 1;
    const permanent = error instanceof DeliveryError && error.permanent;
    const failed = permanent || attempts >= 5;
    await pool.query(
      `UPDATE notifications SET status = $3, attempts = $4,
         last_error = $5, next_attempt_at = NOW() + ($6 * INTERVAL '1 second'),
         lease_owner = NULL, lease_until = NULL, updated_at = NOW()
       WHERE id = $1 AND lease_owner = $2`,
      [notification.id, workerId, failed ? "failed" : "pending", attempts,
        safeErrorCode(error), Math.min(1_800, 30 * 2 ** (attempts - 1))],
    );
    console.warn(`[Uptime] Notification ${notification.id} ${failed ? "failed" : "retrying"}`);
  }
}

function validTeamPayload(payload: TeamPayload, monitorId: string) {
  return payload && payload.monitorId === monitorId &&
    (payload.state === "firing" || payload.state === "resolved") &&
    typeof payload.monitorName === "string" &&
    typeof payload.organizationSlug === "string";
}

async function deliverSubscriberNotification(pool: pg.Pool, notification: Notification) {
  const payload = notification.payload as SubscriberPayload;
  if (notification.event !== "published" || !validSubscriberPayload(payload, notification.source_id)) {
    await finish(pool, notification.id, "suppressed", "invalid_payload");
    return;
  }
  const details = await pool.query<{
    email: string;
    status: string;
    last_sent_at: Date | null;
    page_slug: string;
    published: boolean;
    published_at: Date | null;
    note: string;
    body_json: unknown;
  }>(
    `SELECT subscriber.email, subscriber.status, subscriber.last_sent_at,
       page.slug AS page_slug, page.published, update.published_at,
       update.note, update.body_json
     FROM uptime_subscribers AS subscriber
     JOIN uptime_status_pages AS page ON page.id = subscriber.page_id
     JOIN uptime_incident_updates AS update ON update.id = $4
     WHERE subscriber.id = $1 AND subscriber.page_id = $2
       AND subscriber.organization_id = $3
       AND page.organization_id = $3 AND update.organization_id = $3
       AND update.incident_id = $5`,
    [payload.subscriberId, payload.pageId, notification.organization_id,
      payload.updateId, payload.incidentId],
  );
  const detail = details.rows[0];
  if (!detail || detail.status !== "confirmed" || !detail.published ||
      !detail.published_at || detail.email.toLowerCase() !== notification.recipient.toLowerCase() ||
      detail.page_slug !== payload.pageSlug) {
    await finish(pool, notification.id, "suppressed", "subscriber_inactive");
    return;
  }
  const sent = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM notifications
     WHERE organization_id = $1 AND source_type = 'uptime_incident_update'
       AND channel = 'email' AND status = 'sent'
       AND payload->>'subscriberId' = $2
       AND sent_at > NOW() - INTERVAL '24 hours'`,
    [notification.organization_id, payload.subscriberId],
  );
  if ((sent.rows[0]?.count ?? 0) >= 20) {
    await finish(pool, notification.id, "suppressed", "send_limit");
    return;
  }
  // Smooth bursts to a subscriber without discarding a team-published update.
  if (detail.last_sent_at && Date.now() - detail.last_sent_at.getTime() < 60_000) {
    await pool.query(
      `UPDATE notifications SET status = 'pending',
         next_attempt_at = $3::timestamptz + INTERVAL '1 minute',
         lease_owner = NULL, lease_until = NULL, updated_at = NOW()
       WHERE id = $1 AND lease_owner = $2`,
      [notification.id, workerId, detail.last_sent_at],
    );
    return;
  }
  await sendSubscriberEmail(notification.recipient, payload, detail.body_json, detail.note);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE uptime_subscribers SET last_sent_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND page_id = $2 AND organization_id = $3 AND status = 'confirmed'`,
      [payload.subscriberId, payload.pageId, notification.organization_id],
    );
    await client.query(
      `UPDATE notifications SET status = 'sent', attempts = attempts + 1,
         sent_at = NOW(), last_error = NULL, lease_owner = NULL,
         lease_until = NULL, updated_at = NOW()
       WHERE id = $1 AND lease_owner = $2`,
      [notification.id, workerId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function validSubscriberPayload(payload: SubscriberPayload, updateId: string): boolean {
  return Boolean(payload && payload.updateId === updateId &&
    typeof payload.pageId === "string" && typeof payload.pageSlug === "string" &&
    typeof payload.incidentId === "string" && typeof payload.subscriberId === "string" &&
    typeof payload.title === "string" && typeof payload.note === "string" &&
    typeof payload.status === "string" && payload.title.length <= 200 &&
    payload.note.length <= 5_000);
}

export function makeUnsubscribeToken(subscriberId: string, pageId: string, expiryMs: number, secret: string): string {
  const payload = `${subscriberId}.${pageId}.${expiryMs}`;
  const signature = createHmac("sha256", secret).update(`unsubscribe:${payload}`).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

async function sendSubscriberEmail(recipient: string, payload: SubscriberPayload, body: unknown, storedNote: string) {
  const pageUrl = publicStatusPageUrl(payload.pageSlug, config.statusPublicUrl);
  const unsubscribe = new URL("/unsubscribe", config.statusPublicUrl);
  unsubscribe.searchParams.set("token", makeUnsubscribeToken(
    payload.subscriberId, payload.pageId,
    Date.now() + 365 * 24 * 60 * 60 * 1_000, config.unsubscribeSecret,
  ));
  const subject = `[Status update] ${payload.title}`;
  const response = await fetch("https://api.zeptomail.com/v1.1/email", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json",
      Authorization: `Zoho-enczapikey ${config.zeptoApiKey}` },
    body: JSON.stringify({
      from: { address: "no-reply@outray.dev", name: "OutRay Status" },
      to: [{ email_address: { address: recipient, name: recipient.split("@")[0] } }],
      subject,
      htmlbody: `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#090909;color:#fff;padding:32px"><h1>${escapeHtml(payload.title)}</h1><p>Status: ${escapeHtml(payload.status)}</p><div style="line-height:1.6">${renderIncidentHtml(body, storedNote || payload.note)}</div><p><a href="${escapeHtml(pageUrl)}" style="color:#a78bfa">View status page</a></p><p style="font-size:12px"><a href="${escapeHtml(unsubscribe.toString())}" style="color:#a1a1aa">Unsubscribe</a></p></body></html>`,
    }),
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new DeliveryError(`subscriber_email_http_${response.status}`,
    response.status < 500 && response.status !== 429);
}

export function publicStatusPageUrl(slug: string, baseUrl: string): string {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) {
    throw new DeliveryError("invalid_page_slug", true);
  }
  const url = new URL(baseUrl);
  url.hostname = `${slug}.${url.hostname}`;
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function finish(pool: pg.Pool, id: string, status: "sent" | "suppressed", reason: string | null) {
  await pool.query(
    `UPDATE notifications SET status = $3, attempts = attempts + 1,
       last_error = $4, sent_at = CASE WHEN $3 = 'sent' THEN NOW() ELSE sent_at END,
       lease_owner = NULL, lease_until = NULL, updated_at = NOW()
     WHERE id = $1 AND lease_owner = $2`,
    [id, workerId, status, reason],
  );
}

class DeliveryError extends Error {
  constructor(public readonly code: string, public readonly permanent: boolean) {
    super(code);
  }
}

async function sendEmail(recipient: string, payload: TeamPayload) {
  const url = dashboardLink(payload);
  const firing = payload.state === "firing";
  const subject = `${firing ? "[Down]" : "[Recovered]"} ${payload.monitorName}`;
  const text = `${payload.monitorName} is ${firing ? "down" : "back up"}.\n\nView monitor: ${url}`;
  const response = await fetch("https://api.zeptomail.com/v1.1/email", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json",
      Authorization: `Zoho-enczapikey ${config.zeptoApiKey}` },
    body: JSON.stringify({
      from: { address: "no-reply@outray.dev", name: "OutRay Uptime" },
      to: [{ email_address: { address: recipient, name: recipient.split("@")[0] } }],
      subject,
      htmlbody: `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#090909;color:#fff;padding:32px"><h1>${escapeHtml(subject)}</h1><p>${escapeHtml(text).replace(/\n/g, "<br>")}</p><a href="${escapeHtml(url)}" style="color:#a78bfa">View monitor</a></body></html>`,
    }),
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new DeliveryError(`email_http_${response.status}`, response.status < 500 && response.status !== 429);
}

async function sendWebhook(channel: "slack" | "discord", value: string, payload: TeamPayload) {
  const url = validWebhookUrl(value, channel);
  const firing = payload.state === "firing";
  const content = `[${firing ? "Down" : "Recovered"}] ${payload.monitorName}\n${dashboardLink(payload)}`;
  const body = channel === "slack"
    ? { text: escapeSlack(content) }
    : { content: content.slice(0, 1_900), allowed_mentions: { parse: [] } };
  const endpoint = channel === "discord" ? `${url}?wait=true` : url;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new DeliveryError(`${channel}_http_${response.status}`,
    response.status < 500 && response.status !== 429);
}

function dashboardLink(payload: TeamPayload) {
  const base = config.dashboardUrl.replace(/\/$/, "");
  return `${base}/${encodeURIComponent(payload.organizationSlug)}/uptime/monitors/${encodeURIComponent(payload.monitorId)}`;
}

export function validWebhookUrl(value: string, channel: "slack" | "discord"): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new DeliveryError("invalid_webhook", true); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) {
    throw new DeliveryError("invalid_webhook", true);
  }
  if (channel === "slack" &&
      (url.hostname === "hooks.slack.com" || url.hostname === "hooks.slack-gov.com") &&
      /^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(url.pathname)) return url.toString();
  if (channel === "discord" && url.hostname === "discord.com" &&
      /^\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+$/.test(url.pathname)) return url.toString();
  throw new DeliveryError("invalid_webhook", true);
}

function escapeSlack(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/@/g, "＠");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

function safeErrorCode(error: unknown): string {
  if (error instanceof DeliveryError) return error.code;
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code : "delivery_error";
}
