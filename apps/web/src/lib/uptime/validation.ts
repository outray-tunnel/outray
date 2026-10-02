import { isIP } from "node:net";

export const UPTIME_LIMITS = {
  monitors: 10,
  pages: 1,
  customDomains: 1,
  confirmedSubscribers: 1_000,
  checkHistoryDays: 30,
  intervalSeconds: 60,
} as const;

export type MonitorInput = {
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
  enabled: boolean;
};

type Validation<T> = { success: true; data: T } | { success: false; field?: string; error: string };

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

export function validateMonitorInput(value: unknown, current?: MonitorInput): Validation<MonitorInput> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { success: false, error: "Expected a monitor object" };
  }
  const input = value as Record<string, unknown>;
  const allowed = new Set(["name", "url", "method", "headers", "expectedStatus", "responseText", "notificationEmails", "failureThreshold", "incidentPublishing", "publishAfterMinutes", "enabled"]);
  const unexpected = Object.keys(input).find((key) => !allowed.has(key));
  if (unexpected) return { success: false, field: unexpected, error: "Unknown monitor field" };

  const name = input.name ?? current?.name;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 120) {
    return { success: false, field: "name", error: "Name must be 1–120 characters" };
  }
  const rawUrl = input.url ?? current?.url;
  if (typeof rawUrl !== "string" || rawUrl.length > 2_048) {
    return { success: false, field: "url", error: "A public HTTP(S) URL is required" };
  }
  let url: URL;
  try { url = new URL(rawUrl); } catch {
    return { success: false, field: "url", error: "Invalid URL" };
  }
  if (rawUrl !== rawUrl.trim() || /[\\\r\n\0]/.test(rawUrl) ||
      (url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname ||
      url.username || url.password || url.hash || url.hostname.endsWith(".") ||
      (url.protocol === "http:" && !!url.port && url.port !== "80") ||
      (url.protocol === "https:" && !!url.port && url.port !== "443") ||
      /^(localhost|.*\.(?:localhost|local|internal|test|invalid|example))$/i.test(url.hostname) ||
      isIP(url.hostname.replace(/^\[|\]$/g, "")) !== 0) {
    return { success: false, field: "url", error: "Use a public DNS hostname over HTTP or HTTPS" };
  }
  const labels = url.hostname.split(".");
  if (url.hostname.length > 253 || labels.length < 2 ||
      labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) ||
      !/[a-z]/i.test(labels.at(-1) ?? "")) {
    return { success: false, field: "url", error: "Use a public DNS hostname over HTTP or HTTPS" };
  }
  // DNS resolution and every redirect are revalidated and pinned by the isolated probe worker.
  const method = input.method ?? current?.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    return { success: false, field: "method", error: "Method must be GET or HEAD" };
  }
  const headerValue = input.headers ?? current?.headers ?? {};
  if (!headerValue || typeof headerValue !== "object" || Array.isArray(headerValue)) {
    return { success: false, field: "headers", error: "Headers must be a name/value object" };
  }
  const headers = headerValue as Record<string, unknown>;
  const entries = Object.entries(headers);
  if (entries.length > 20 || entries.some(([key, val]) =>
    !headerToken.test(key) || blockedHeaders.has(key.toLowerCase()) ||
    key.toLowerCase().startsWith("proxy-") || key.toLowerCase().startsWith("x-forwarded-") ||
    typeof val !== "string" ||
    val.length > 1_024 || /[\r\n\0]/.test(val))) {
    return { success: false, field: "headers", error: "Headers contain an unsafe name or value" };
  }
  const totalHeaderBytes = entries.reduce((total, [key, val]) => total + Buffer.byteLength(key) + Buffer.byteLength(val as string), 0);
  if (totalHeaderBytes > 8_192) {
    return { success: false, field: "headers", error: "Headers exceed 8 KiB" };
  }
  const expectedStatus = input.expectedStatus === undefined ? current?.expectedStatus ?? null : input.expectedStatus;
  if (expectedStatus !== null && (!Number.isInteger(expectedStatus) || (expectedStatus as number) < 100 || (expectedStatus as number) > 599)) {
    return { success: false, field: "expectedStatus", error: "Expected status must be an HTTP status code" };
  }
  const responseText = input.responseText === undefined ? current?.responseText ?? null : input.responseText;
  if (responseText !== null && (typeof responseText !== "string" || !responseText.trim() || responseText.length > 256)) {
    return { success: false, field: "responseText", error: "Response text must be 1–256 characters" };
  }
  if (method === "HEAD" && responseText !== null) {
    return { success: false, field: "responseText", error: "Response-text matching requires GET" };
  }
  const emailsValue = input.notificationEmails ?? current?.notificationEmails ?? [];
  if (!Array.isArray(emailsValue) || emailsValue.length > 25 || emailsValue.some((email) =>
    typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { success: false, field: "notificationEmails", error: "Select valid team email recipients" };
  }
  const notificationEmails = Array.from(new Set(emailsValue.map((email: string) => email.trim().toLowerCase())));
  const failureThreshold = input.failureThreshold ?? current?.failureThreshold ?? 3;
  if (!Number.isInteger(failureThreshold) || (failureThreshold as number) < 2 || (failureThreshold as number) > 5) {
    return { success: false, field: "failureThreshold", error: "Confirm Down after 2–5 failed checks" };
  }
  const incidentPublishing = input.incidentPublishing ?? current?.incidentPublishing ?? "manual";
  if (incidentPublishing !== "manual" && incidentPublishing !== "after_confirmation" && incidentPublishing !== "automatic") {
    return { success: false, field: "incidentPublishing", error: "Choose a valid incident publishing mode" };
  }
  const publishAfterMinutes = input.publishAfterMinutes ?? current?.publishAfterMinutes ?? 5;
  if (!Number.isInteger(publishAfterMinutes) || (publishAfterMinutes as number) < 1 || (publishAfterMinutes as number) > 60) {
    return { success: false, field: "publishAfterMinutes", error: "Confirmation delay must be 1–60 minutes" };
  }
  const enabled = input.enabled ?? current?.enabled ?? true;
  if (typeof enabled !== "boolean") return { success: false, field: "enabled", error: "Enabled must be true or false" };

  return {
    success: true,
    data: {
      name: name.trim(), url: url.toString(), method,
      headers: Object.fromEntries(entries.map(([key, val]) => [key, val as string])),
      expectedStatus: expectedStatus as number | null,
      responseText: responseText as string | null,
      notificationEmails,
      failureThreshold: failureThreshold as number,
      incidentPublishing,
      publishAfterMinutes: publishAfterMinutes as number,
      enabled,
    },
  };
}

export function safeUptimeSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug) ? slug : null;
}

export function textField(value: unknown, max: number, required = false): string | null | undefined {
  if (value === null && !required) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if ((required && !text) || text.length > max) return undefined;
  return text || null;
}
