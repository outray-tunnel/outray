import type { RequestCapture, TunnelEvent } from "./types";

/** The same request object may be recreated by a live-feed refresh. */
export function requestInspectorIdentity(orgSlug: string, request: TunnelEvent): string {
  return JSON.stringify([orgSlug, request.tunnel_id, request.timestamp, request.request_id ?? null]);
}

export function requestQueryEntries(path: string): Array<[string, string]> {
  const question = path.indexOf("?");
  if (question < 0) return [];
  return [...new URLSearchParams(path.slice(question + 1).split("#")[0]).entries()];
}

export function requestInspectorUrl(request: Pick<TunnelEvent, "host" | "path">): string {
  const host = request.host.trim();
  const path = request.path || "/";
  if (!host) return path;
  const loopback = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const origin = /^https?:\/\//i.test(host) ? host.replace(/\/$/, "") : `${loopback ? "http" : "https"}://${host}`;
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Use real captured values; never synthesize a body or unobserved headers. */
export function requestInspectorCurl(request: TunnelEvent, capture: RequestCapture | null): string {
  const parts = [
    `curl --request ${shellQuote(request.method)} --url ${shellQuote(requestInspectorUrl(request))}`,
  ];
  const headers = capture?.request.headers ?? (request.user_agent ? { "User-Agent": request.user_agent } : {});
  for (const [key, values] of Object.entries(headers)) {
    for (const value of Array.isArray(values) ? values : [values]) {
      parts.push(`  --header ${shellQuote(`${key}: ${value}`)}`);
    }
  }
  if (capture?.request.body !== null && capture?.request.body !== undefined) {
    parts.push(`  --data-raw ${shellQuote(capture.request.body)}`);
  }
  return parts.join(" \\\n");
}

export function formatInspectorDuration(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}

export function formatInspectorTime(timestamp: number): { text: string; iso?: string } {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { text: "Unknown time" };
  return {
    text: date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }),
    iso: date.toISOString(),
  };
}

const statusNames: Record<number, string> = {
  200: "OK", 201: "Created", 202: "Accepted", 204: "No Content",
  301: "Moved Permanently", 302: "Found", 304: "Not Modified",
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
  409: "Conflict", 422: "Unprocessable Content", 429: "Too Many Requests",
  500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout",
};

export function requestInspectorStatus(code: number): { label: string; tone: string } {
  const valid = Number.isInteger(code) && code >= 100 && code < 600;
  if (!valid) return { label: "Unknown status", tone: "border-white/[0.08] bg-white/[0.025] text-zinc-400" };
  const tone = code >= 500
    ? "border-rose-400/[0.12] bg-rose-400/[0.05] text-rose-300"
    : code >= 400
      ? "border-amber-400/[0.12] bg-amber-400/[0.05] text-amber-300"
      : code >= 300
        ? "border-white/[0.08] bg-white/[0.025] text-zinc-300"
        : code >= 200
          ? "border-emerald-400/[0.12] bg-emerald-400/[0.05] text-emerald-300"
          : "border-sky-400/[0.12] bg-sky-400/[0.05] text-sky-300";
  return { label: `${code}${statusNames[code] ? ` ${statusNames[code]}` : ""}`, tone };
}
