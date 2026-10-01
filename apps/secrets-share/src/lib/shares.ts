import { createHmac, randomBytes } from "node:crypto";
import { shareConfig } from "./config";
import { shareDb } from "./db";

const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_CIPHERTEXT_BYTES = 256 * 1024 + 1024;

export type CreateShareInput = {
  ciphertext: string;
  iv: string;
  verifier: string;
  contentFormat: "text" | "bundle";
  durationValue: number;
  durationUnit: "minutes" | "hours" | "days" | "months";
  maxViews: number;
  passwordSalt?: string;
  passwordVerifier?: string;
};

export function validateShareInput(input: unknown): { data: CreateShareInput; expiresAt: Date } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid share");
  const data = input as CreateShareInput;
  if (data.contentFormat !== "text" && data.contentFormat !== "bundle") throw new Error("Invalid share format");
  if (!Number.isInteger(data.durationValue) ||
      !((data.durationUnit === "minutes" && data.durationValue >= 5 && data.durationValue <= 129_600) ||
        (data.durationUnit === "hours" && data.durationValue >= 1 && data.durationValue <= 2_160) ||
        (data.durationUnit === "days" && data.durationValue >= 1 && data.durationValue <= 90) ||
        (data.durationUnit === "months" && data.durationValue >= 1 && data.durationValue <= 3))) {
    throw new Error("Choose an expiry between 5 minutes and 3 months");
  }
  if (!Number.isInteger(data.maxViews) || data.maxViews < 1 || data.maxViews > 100) {
    throw new Error("Choose 1–100 reveals");
  }
  if (typeof data.ciphertext !== "string" || !BASE64URL.test(data.ciphertext) ||
      Buffer.byteLength(data.ciphertext, "base64url") < 17 ||
      Buffer.byteLength(data.ciphertext, "base64url") > MAX_CIPHERTEXT_BYTES ||
      typeof data.iv !== "string" || !BASE64URL.test(data.iv) || Buffer.byteLength(data.iv, "base64url") !== 12 ||
      typeof data.verifier !== "string" || !BASE64URL.test(data.verifier) || Buffer.byteLength(data.verifier, "base64url") !== 32) {
    throw new Error("Invalid encrypted content");
  }
  const hasSalt = data.passwordSalt !== undefined;
  const hasProof = data.passwordVerifier !== undefined;
  if (hasSalt !== hasProof || (hasSalt && (
    typeof data.passwordSalt !== "string" || !BASE64URL.test(data.passwordSalt) || Buffer.byteLength(data.passwordSalt, "base64url") !== 16 ||
    typeof data.passwordVerifier !== "string" || !BASE64URL.test(data.passwordVerifier) || Buffer.byteLength(data.passwordVerifier, "base64url") !== 32
  ))) throw new Error("Invalid password protection");
  const expiresAt = new Date();
  if (data.durationUnit === "minutes") expiresAt.setTime(expiresAt.getTime() + data.durationValue * 60_000);
  else if (data.durationUnit === "hours") expiresAt.setTime(expiresAt.getTime() + data.durationValue * 3_600_000);
  else if (data.durationUnit === "days") expiresAt.setUTCDate(expiresAt.getUTCDate() + data.durationValue);
  else {
    // Clamped calendar-month addition, avoiding overflow from dates like January 31.
    const day = expiresAt.getUTCDate();
    expiresAt.setUTCDate(1);
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + data.durationValue);
    const lastDay = new Date(Date.UTC(expiresAt.getUTCFullYear(), expiresAt.getUTCMonth() + 1, 0)).getUTCDate();
    expiresAt.setUTCDate(Math.min(day, lastDay));
  }
  return { data, expiresAt };
}

export function clientRateKey(ip: string, action: string): string {
  return createHmac("sha256", shareConfig().rateLimitSecret).update(`${action}\0${ip}`).digest("hex");
}

export async function enforceRateLimit(ip: string, action: "create" | "reveal"): Promise<boolean> {
  const key = clientRateKey(ip, action);
  const limit = action === "create" ? 10 : 60;
  const result = await shareDb().query<{ count: number }>(
    `INSERT INTO secret_share_rate_limits (key, count, window_ends_at)
     VALUES ($1, 1, now() + interval '1 hour')
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN secret_share_rate_limits.window_ends_at <= now() THEN 1 ELSE secret_share_rate_limits.count + 1 END,
       window_ends_at = CASE WHEN secret_share_rate_limits.window_ends_at <= now() THEN now() + interval '1 hour' ELSE secret_share_rate_limits.window_ends_at END
     RETURNING count`,
    [key],
  );
  return (result.rows[0]?.count || 0) <= limit;
}

export async function createShare(input: unknown): Promise<string> {
  const { data, expiresAt } = validateShareInput(input);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = randomBytes(16).toString("base64url");
    const result = await shareDb().query(
      `INSERT INTO secret_share_links
       (id, ciphertext, iv, key_verifier, content_format, expires_at, max_views, password_salt, password_verifier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, data.ciphertext, data.iv, data.verifier, data.contentFormat, expiresAt, data.maxViews,
        data.passwordSalt ?? null, data.passwordVerifier ?? null],
    );
    if (result.rowCount) return id;
  }
  throw new Error("Could not create share");
}

export async function revealShare(id: string, verifier: string, passwordVerifier?: string): Promise<{ ciphertext: string; iv: string } | null> {
  if (!ID_PATTERN.test(id) || !BASE64URL.test(verifier) || Buffer.byteLength(verifier, "base64url") !== 32) return null;
  if (passwordVerifier !== undefined && (!BASE64URL.test(passwordVerifier) || Buffer.byteLength(passwordVerifier, "base64url") !== 32)) return null;
  // The verifier is a SHA-256 digest of a 256-bit fragment key; comparing in SQL
  // does not expose the decryption key. The update serializes concurrent reveals.
  const result = await shareDb().query<{ ciphertext: string; iv: string }>(
    `UPDATE secret_share_links SET views = views + 1, last_revealed_at = now()
     WHERE id = $1 AND key_verifier = $2
       AND (password_verifier IS NULL OR password_verifier = $3)
       AND expires_at > now()
       AND revoked_at IS NULL AND views < max_views
     RETURNING ciphertext, iv`,
    [id, verifier, passwordVerifier ?? null],
  );
  return result.rows[0] || null;
}

export function requestClientIp(request: Request, fallback: string): string {
  const headerName = shareConfig().clientIpHeader;
  const header = headerName ? request.headers.get(headerName) : null;
  const value = header?.split(",")[0]?.trim() || fallback;
  return value.length <= 100 ? value : fallback;
}

export function validOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === shareConfig().publicOrigin;
}

export function isShareId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export async function purgeExpiredShares(): Promise<void> {
  const client = await shareDb().connect();
  try {
    const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(74211521) AS locked");
    if (!lock.rows[0]?.locked) return;
    try {
      await client.query("UPDATE secret_share_links SET ciphertext = '', iv = '' WHERE ciphertext <> '' AND (expires_at <= now() OR revoked_at IS NOT NULL OR views >= max_views)");
      await client.query("DELETE FROM secret_share_links l WHERE l.expires_at < now() - interval '30 days' AND NOT EXISTS (SELECT 1 FROM secret_share_ownership o WHERE o.share_id = l.id)");
      await client.query("DELETE FROM secret_share_rate_limits WHERE window_ends_at <= now()");
    } finally {
      await client.query("SELECT pg_advisory_unlock(74211521)");
    }
  } finally {
    client.release();
  }
}
