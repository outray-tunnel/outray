/** Public integration settings shared by the console and both status runtimes. */
export const MAX_ANALYTICS_ORIGINS = 10;
export const PUBLIC_STATUS_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeAnalyticsOrigins(value: unknown, allowLocalhost = false): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_ANALYTICS_ORIGINS) return null;
  const origins = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !entry.trim() || entry.length > 2048) return null;
    try {
      const url = new URL(entry.trim());
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if ((url.protocol !== "https:" && !(allowLocalhost && local && url.protocol === "http:")) ||
          url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.hostname.includes("*")) return null;
      origins.add(url.origin);
    } catch { return null; }
  }
  return [...origins];
}

export function headlessStatusUrls(origin: string, pageId: string) {
  const base = new URL(origin).origin;
  const page = `${base}/api/v1/pages/${encodeURIComponent(pageId)}`;
  return { page, incident: `${page}/incidents/INCIDENT_ID`, subscribe: `${page}/subscribe`, script: `${base}/status-tracker.v1.js` };
}

export default { MAX_ANALYTICS_ORIGINS, PUBLIC_STATUS_ID, normalizeAnalyticsOrigins, headlessStatusUrls };
