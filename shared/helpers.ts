import { ADJECTIVES, NOUNS } from "./words";

export function generateId(prefix: string = ""): string {
  const random = Math.random().toString(36).substring(2, 15);
  return prefix ? `${prefix}_${random}` : random;
}

export function generateSubdomain(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

export function extractSubdomain(
  host: string,
  baseDomain: string,
): string | null {
  if (!host) return null;

  const cleanHost = host.split(":")[0].replace(/\.$/, "").toLowerCase();
  const base = baseDomain.toLowerCase();

  if (cleanHost === base) return null;
  if (!cleanHost.endsWith(`.${base}`)) return null;

  const sub = cleanHost.slice(0, cleanHost.length - base.length - 1);
  return sub || null;
}

export function getBandwidthKey(organizationId: string, date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `bw:${organizationId}:${year}-${month}`;
}
