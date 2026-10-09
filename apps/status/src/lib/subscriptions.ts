import { randomUUID } from "node:crypto";
import { getStatusConfig } from "./config";
import { getPool, query } from "./db";
import { hashRateKey, makeUnsubscribeToken, newToken, normalizeEmail, tokenHash, verifyUnsubscribeToken } from "./security";
import { findPublishedPageById } from "./status-data";

interface SubscriberRow {
  id: string;
  page_id: string;
  organization_id: string;
  email: string;
  status: string;
  name: string;
  slug: string;
}

const CONFIRMATION_HOURS = 24;
const MAX_CONFIRMED_SUBSCRIBERS = 1_000;
const MAX_PENDING_SUBSCRIBERS = 2_000;
const MAX_SIGNUPS_PER_IP_HOUR = 5;
const MAX_SIGNUPS_PER_EMAIL_QUARTER_HOUR = 1;

export type SubscriptionResult = "sent" | "already-confirmed" | "rate-limited" | "full";

export async function requestSubscription(pageId: string, rawEmail: string, clientIp: string): Promise<SubscriptionResult> {
  const config = getStatusConfig();
  if (!config.enabled) throw new Error("Uptime is disabled");
  if (!config.zeptoApiKey || !config.fromEmail) throw new Error("Subscription email delivery is not configured");
  const email = normalizeEmail(rawEmail);
  if (!email) throw new Error("Invalid email address");
  const page = await findPublishedPageById(pageId);
  if (!page) throw new Error("Status page not found");

  const ipHash = hashRateKey("ip", clientIp);
  const emailHash = hashRateKey("email", email);
  const client = await getPool().connect();
  let rawToken: string | null = null;
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM uptime_status_pages WHERE id = $1 FOR UPDATE", [page.id]);
    await client.query(
      `DELETE FROM uptime_subscribers WHERE page_id = $1 AND status = 'pending'
       AND token_expires_at < NOW()`,
      [page.id],
    );
    const counts = await client.query<{ confirmed_count: string; pending_count: string }>(
      `SELECT COUNT(*) FILTER (WHERE status = 'confirmed')::text AS confirmed_count,
              COUNT(*) FILTER (WHERE status = 'pending')::text AS pending_count
       FROM uptime_subscribers WHERE page_id = $1`,
      [page.id],
    );
    const existing = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM uptime_subscribers
       WHERE page_id = $1 AND email = $2 LIMIT 1`,
      [page.id, email],
    );
    if (existing.rows[0]?.status === "confirmed") {
      await client.query("COMMIT");
      return "already-confirmed";
    }
    if (Number(counts.rows[0]?.confirmed_count || 0) >= MAX_CONFIRMED_SUBSCRIBERS ||
        (Number(counts.rows[0]?.pending_count || 0) >= MAX_PENDING_SUBSCRIBERS && !existing.rows[0])) {
      await client.query("COMMIT");
      return "full";
    }
    const limits = await client.query<{ ip_count: string; email_count: string }>(
      `SELECT
        COUNT(*) FILTER (WHERE ip_hash = $2 AND created_at >= NOW() - INTERVAL '1 hour')::text AS ip_count,
        COUNT(*) FILTER (WHERE email_hash = $3 AND created_at >= NOW() - INTERVAL '15 minutes')::text AS email_count
       FROM uptime_subscription_attempts WHERE page_id = $1
         AND created_at >= NOW() - INTERVAL '1 hour'`,
      [page.id, ipHash, emailHash],
    );
    if (Number(limits.rows[0]?.ip_count || 0) >= MAX_SIGNUPS_PER_IP_HOUR ||
        Number(limits.rows[0]?.email_count || 0) >= MAX_SIGNUPS_PER_EMAIL_QUARTER_HOUR) {
      await client.query("COMMIT");
      return "rate-limited";
    }
    await client.query(
      `INSERT INTO uptime_subscription_attempts (id, page_id, ip_hash, email_hash, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [randomUUID(), page.id, ipHash, emailHash],
    );
    rawToken = newToken();
    await client.query(
      `INSERT INTO uptime_subscribers
         (id, organization_id, page_id, email, status, token_hash, token_expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, NOW() + INTERVAL '24 hours', NOW(), NOW())
       ON CONFLICT (page_id, email) DO UPDATE SET
         id = EXCLUDED.id, status = 'pending', token_hash = EXCLUDED.token_hash,
         token_expires_at = EXCLUDED.token_expires_at, unsubscribed_at = NULL,
         confirmed_at = NULL, last_sent_at = NULL,
         updated_at = NOW()`,
      [randomUUID(), page.organization_id, page.id, email, tokenHash(rawToken)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (!rawToken) throw new Error("Could not create confirmation token");
  await sendConfirmationEmail(email, page.name, rawToken);
  return "sent";
}

export async function inspectConfirmation(token: string): Promise<SubscriberRow | null> {
  if (!validToken(token)) return null;
  const rows = await query<SubscriberRow>(
    `SELECT s.id, s.page_id, s.organization_id, s.email, s.status, p.name, p.slug
     FROM uptime_subscribers s JOIN uptime_status_pages p ON p.id = s.page_id
     WHERE s.token_hash = $1 AND s.token_expires_at > NOW()
       AND s.status = 'pending' AND p.published = true LIMIT 1`,
    [tokenHash(token)],
  );
  return rows[0] || null;
}

export async function confirmSubscription(token: string): Promise<SubscriberRow | null> {
  if (!validToken(token)) return null;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const candidate = await client.query<SubscriberRow>(
      `SELECT s.id, s.page_id, s.organization_id, s.email, s.status, p.name, p.slug
       FROM uptime_subscribers s JOIN uptime_status_pages p ON p.id = s.page_id
       WHERE s.token_hash = $1 AND s.token_expires_at > NOW()
         AND s.status = 'pending' AND p.published = true LIMIT 1`,
      [tokenHash(token)],
    );
    const subscriber = candidate.rows[0];
    if (!subscriber) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("SELECT id FROM uptime_status_pages WHERE id = $1 FOR UPDATE", [subscriber.page_id]);
    const count = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM uptime_subscribers
       WHERE page_id = $1 AND status = 'confirmed'`,
      [subscriber.page_id],
    );
    if (Number(count.rows[0]?.count || 0) >= MAX_CONFIRMED_SUBSCRIBERS) {
      await client.query("ROLLBACK");
      return null;
    }
    const result = await client.query(
      `UPDATE uptime_subscribers SET status = 'confirmed', confirmed_at = NOW(),
         token_hash = NULL, token_expires_at = NULL, updated_at = NOW()
       WHERE id = $1 AND token_hash = $2 AND status = 'pending'`,
      [subscriber.id, tokenHash(token)],
    );
    if (result.rowCount !== 1) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("COMMIT");
    return subscriber;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function inspectUnsubscribe(token: string): Promise<SubscriberRow | null> {
  const verified = verifyUnsubscribeToken(token);
  if (!verified) return null;
  const rows = await query<SubscriberRow>(
    `SELECT s.id, s.page_id, s.organization_id, s.email, s.status, p.name, p.slug
     FROM uptime_subscribers s JOIN uptime_status_pages p ON p.id = s.page_id
     WHERE s.id = $1 AND s.page_id = $2 AND s.status = 'confirmed' LIMIT 1`,
    [verified.subscriberId, verified.pageId],
  );
  return rows[0] || null;
}

export async function unsubscribe(token: string): Promise<SubscriberRow | null> {
  const subscriber = await inspectUnsubscribe(token);
  if (!subscriber) return null;
  await query(
    `UPDATE uptime_subscribers SET status = 'unsubscribed', unsubscribed_at = NOW(),
       updated_at = NOW() WHERE id = $1 AND page_id = $2 AND status = 'confirmed'`,
    [subscriber.id, subscriber.page_id],
  );
  return subscriber;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}${"•".repeat(Math.min(Math.max(local.length - 1, 2), 6))}@${domain}`;
}

export function makeUnsubscribeUrl(subscriberId: string, pageId: string): string {
  const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1_000;
  const token = makeUnsubscribeToken(subscriberId, pageId, expiresAt);
  const url = new URL("/unsubscribe", getStatusConfig().publicUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

async function sendConfirmationEmail(email: string, pageName: string, token: string): Promise<void> {
  const config = getStatusConfig();
  const url = new URL("/confirm", config.publicUrl);
  url.searchParams.set("token", token);
  const response = await fetch("https://api.zeptomail.com/v1.1/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Zoho-enczapikey ${config.zeptoApiKey}`,
    },
    body: JSON.stringify({
      from: { address: config.fromEmail, name: process.env.ZEPTO_FROM_NAME || "OutRay Status" },
      to: [{ email_address: { address: email, name: email.split("@")[0] } }],
      subject: `Confirm your subscription to ${pageName}`,
      htmlbody: `<!doctype html><html><body style="background:#09090b;color:#f4f4f5;font-family:Arial,sans-serif;padding:32px"><div style="max-width:560px;margin:auto"><h1 style="font-size:24px">Confirm your subscription</h1><p>You'll receive team-published incident updates for ${escapeHtml(pageName)} after confirming your email.</p><p><a href="${escapeHtml(url.toString())}" style="display:inline-block;background:#8367c7;color:white;text-decoration:none;border-radius:8px;padding:12px 18px">Confirm email</a></p><p style="color:#a1a1aa;font-size:13px">This link expires in ${CONFIRMATION_HOURS} hours. If you did not request this, ignore this email.</p></div></body></html>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Confirmation email delivery failed (${response.status})`);
}

function validToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{40,80}$/.test(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

export async function purgeSubscriptionAttempts(): Promise<number> {
  const rows = await query<{ deleted: number }>(
    `WITH removed AS (DELETE FROM uptime_subscription_attempts
       WHERE created_at < NOW() - INTERVAL '2 days' RETURNING id)
     SELECT COUNT(*)::integer AS deleted FROM removed`,
  );
  return rows[0]?.deleted || 0;
}
