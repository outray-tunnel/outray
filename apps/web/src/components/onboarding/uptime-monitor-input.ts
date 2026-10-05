/** Browser-safe draft validation. DNS and redirect safety remain server-side. */
export interface UptimeMonitorDraft {
  name: string;
  url: string;
  method: "GET" | "HEAD";
  statusMode: "range" | "exact";
  expectedStatus: string;
  responseText: string;
  headers: string;
  notificationEmails: string[];
  failureThreshold: number;
  incidentPublishing: "manual" | "after_confirmation" | "automatic";
  publishAfterMinutes: string;
}

export interface UptimeMonitorPayload {
  name: string;
  url: string;
  method: "GET" | "HEAD";
  headers: Record<string, string>;
  expectedStatus: number | null;
  responseText: string | null;
  notificationEmails: string[];
  failureThreshold: number;
  incidentPublishing: "manual" | "after_confirmation" | "automatic";
  publishAfterMinutes: number;
  enabled: true;
}

export type MonitorField = Exclude<keyof UptimeMonitorDraft, "statusMode">;
type MonitorValidation =
  | { success: true; data: UptimeMonitorPayload }
  | { success: false; field: MonitorField; error: string };

const monitorFields = new Set<string>([
  "name", "url", "method", "expectedStatus", "responseText", "headers",
  "notificationEmails", "failureThreshold", "incidentPublishing", "publishAfterMinutes",
]);

export function isUptimeMonitorField(field: unknown): field is MonitorField {
  return typeof field === "string" && monitorFields.has(field);
}

export function createUptimeMonitorDraft(): UptimeMonitorDraft {
  return {
    name: "", url: "", method: "GET", statusMode: "range", expectedStatus: "200",
    responseText: "", headers: "", notificationEmails: [], failureThreshold: 3,
    incidentPublishing: "manual", publishAfterMinutes: "5",
  };
}

const blockedHeaders = new Set([
  "host", "connection", "content-length", "transfer-encoding", "upgrade", "te",
  "trailer", "proxy-authorization", "proxy-authenticate", "forwarded",
  "accept-encoding", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto",
  "x-real-ip", "via", "cookie", "set-cookie", "keep-alive", "proxy-connection",
  "content-encoding", "cf-connecting-ip", "true-client-ip", "metadata-flavor",
  "x-aws-ec2-metadata-token", "expect", "x-http-method-override",
  "x-method-override", "x-original-url", "x-rewrite-url", "x-original-host", "x-host",
]);
const headerToken = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function parseUptimeHeaderLines(input: string): Record<string, string> {
  const entries: Array<[string, string]> = [];
  const names = new Set<string>();
  for (const line of input.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    if (separator < 1) throw new Error("Use one Name: Value header per line.");
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    const normalized = name.toLowerCase();
    if (!headerToken.test(name) || blockedHeaders.has(normalized) ||
      normalized.startsWith("proxy-") || normalized.startsWith("x-forwarded-") ||
      !value || value.length > 1_024 || /[\r\n\0]/.test(line)) {
      throw new Error("Headers contain an unsafe name or value.");
    }
    if (names.has(normalized)) throw new Error("Use each header name only once.");
    names.add(normalized);
    entries.push([name, value]);
  }
  if (entries.length > 20) throw new Error("Use no more than 20 headers.");
  const encoder = new TextEncoder();
  const bytes = entries.reduce((total, [name, value]) => total + encoder.encode(name).length + encoder.encode(value).length, 0);
  if (bytes > 8_192) throw new Error("Headers must total no more than 8 KiB.");
  return Object.fromEntries(entries);
}

export function validateUptimeMonitorDraft(draft: UptimeMonitorDraft): MonitorValidation {
  const name = draft.name.trim();
  if (!name || name.length > 120) return { success: false, field: "name", error: "Enter a name with 1–120 characters." };

  const rawUrl = draft.url.trim();
  let url: URL;
  try { url = new URL(rawUrl); } catch {
    return { success: false, field: "url", error: "Enter a complete public HTTP or HTTPS URL." };
  }
  const labels = url.hostname.split(".");
  if (rawUrl.length > 2_048 || /[\\\r\n\0]/.test(rawUrl) ||
    !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash ||
    (url.protocol === "http:" && !!url.port && url.port !== "80") ||
    (url.protocol === "https:" && !!url.port && url.port !== "443") ||
    /^(localhost|.*\.(?:localhost|local|internal|test|invalid|example))$/i.test(url.hostname) ||
    url.hostname.length > 253 || labels.length < 2 ||
    labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) ||
    !/[a-z]/i.test(labels.at(-1) ?? "")) {
    return { success: false, field: "url", error: "Use a public DNS hostname, without credentials, fragments, or a custom port." };
  }
  if (draft.method !== "GET" && draft.method !== "HEAD") return { success: false, field: "method", error: "Choose GET or HEAD." };

  const expectedStatus = draft.statusMode === "exact" ? Number(draft.expectedStatus) : null;
  if (draft.statusMode === "exact" && (!/^\d{3}$/.test(draft.expectedStatus) || !Number.isInteger(expectedStatus) || expectedStatus! < 100 || expectedStatus! > 599)) {
    return { success: false, field: "expectedStatus", error: "Enter an HTTP status code from 100 to 599." };
  }
  const responseText = draft.method === "GET" && draft.responseText.trim() ? draft.responseText : null;
  if (responseText !== null && responseText.length > 256) return { success: false, field: "responseText", error: "Response text must be no more than 256 characters." };

  let headers: Record<string, string>;
  try { headers = parseUptimeHeaderLines(draft.headers); } catch (cause) {
    return { success: false, field: "headers", error: cause instanceof Error ? cause.message : "Check the header names and values." };
  }
  const notificationEmails = [...new Set(draft.notificationEmails.map((email) => email.trim().toLowerCase()))];
  if (notificationEmails.length > 25 || notificationEmails.some((email) => email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { success: false, field: "notificationEmails", error: "Select up to 25 valid team email recipients." };
  }
  if (!Number.isInteger(draft.failureThreshold) || draft.failureThreshold < 2 || draft.failureThreshold > 5) return { success: false, field: "failureThreshold", error: "Choose 2–5 failed checks to confirm Down." };
  if (!["manual", "after_confirmation", "automatic"].includes(draft.incidentPublishing)) return { success: false, field: "incidentPublishing", error: "Choose an incident publishing mode." };
  const publishAfterMinutes = draft.incidentPublishing === "after_confirmation" ? Number(draft.publishAfterMinutes) : 5;
  if (!Number.isInteger(publishAfterMinutes) || publishAfterMinutes < 1 || publishAfterMinutes > 60) return { success: false, field: "publishAfterMinutes", error: "Enter a delay from 1 to 60 minutes." };

  return { success: true, data: {
    name, url: url.toString(), method: draft.method, headers, expectedStatus, responseText,
    notificationEmails, failureThreshold: draft.failureThreshold,
    incidentPublishing: draft.incidentPublishing, publishAfterMinutes, enabled: true,
  } };
}
