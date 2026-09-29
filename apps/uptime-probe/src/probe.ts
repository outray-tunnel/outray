import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

export type ProbeMethod = "GET" | "HEAD";
export type ProbeTarget = {
  url: string;
  method: ProbeMethod;
  headers: Record<string, string>;
  expectedStatus: number | null;
  responseText: string | null;
};

export type ProbeResult = {
  success: boolean;
  statusCode: number | null;
  latencyMs: number;
  errorKind: string | null;
};

export class ProbeValidationError extends Error {
  constructor(public readonly kind: string) {
    super(kind);
  }
}

const maxResponseBytes = 64 * 1024;
const maxRedirects = 3;
const timeoutMs = 10_000;
const forbiddenHeaders = new Set([
  "host", "connection", "keep-alive", "proxy-connection", "proxy-authenticate",
  "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade",
  "content-length", "content-encoding", "forwarded", "x-forwarded-for",
  "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "cf-connecting-ip",
  "true-client-ip", "metadata-flavor", "x-aws-ec2-metadata-token",
  "accept-encoding", "expect", "x-http-method-override", "x-method-override",
  "x-original-url", "x-rewrite-url", "x-original-host", "x-host",
  "__proto__", "constructor", "prototype",
]);

/** Only globally routable unicast addresses are probeable. */
export function isPublicIp(address: string): boolean {
  const normalized = address.startsWith("[") && address.endsWith("]")
    ? address.slice(1, -1)
    : address;
  const family = isIP(normalized);
  if (!family) return false;
  try {
    if (family === 4) {
      const parsed = ipaddr.IPv4.parse(normalized);
      return parsed.range() === "unicast" &&
        !parsed.match(ipaddr.IPv4.parse("198.18.0.0"), 15);
    }
    const parsed = ipaddr.IPv6.parse(normalized);
    if (parsed.isIPv4MappedAddress()) return isPublicIp(parsed.toIPv4Address().toString());
    if (parsed.range() !== "unicast") return false;
    // Only global unicast v6, excluding known special-purpose ranges that
    // older IP libraries do not classify as reserved.
    return parsed.match(ipaddr.IPv6.parse("2000::"), 3) &&
      !parsed.match(ipaddr.IPv6.parse("2001::"), 23) &&
      !parsed.match(ipaddr.IPv6.parse("2001:db8::"), 32) &&
      !parsed.match(ipaddr.IPv6.parse("2002::"), 16) &&
      !parsed.match(ipaddr.IPv6.parse("3fff::"), 20);
  } catch {
    return false;
  }
}

/** Validates both input URLs and every redirect target before DNS or network I/O. */
export function validatePublicUrl(value: string): URL {
  if (!value || value.length > 2_048 || value !== value.trim() || /[\\\r\n\0]/.test(value)) {
    throw new ProbeValidationError("invalid_target");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProbeValidationError("invalid_target");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username || url.password || url.hash ||
      (url.protocol === "http:" && url.port && url.port !== "80") ||
      (url.protocol === "https:" && url.port && url.port !== "443")) {
    throw new ProbeValidationError("invalid_target");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new ProbeValidationError("unsafe_target");
  } else {
    const labels = hostname.split(".");
    if (hostname.length > 253 || labels.length < 2 ||
        labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) ||
        !/[a-z]/i.test(labels.at(-1) ?? "") ||
        /\.(?:local|localhost|internal|test|invalid|example)$/i.test(hostname)) {
      throw new ProbeValidationError("unsafe_target");
    }
  }
  return url;
}

export function validateHeaders(input: Record<string, string>): Record<string, string> {
  if (!input || Array.isArray(input) || typeof input !== "object" || Object.keys(input).length > 20) {
    throw new ProbeValidationError("unsafe_headers");
  }
  let bytes = 0;
  const output: Record<string, string> = {};
  for (const [name, value] of Object.entries(input)) {
    const lower = name.toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
        forbiddenHeaders.has(lower) || lower.startsWith("proxy-") ||
        lower.startsWith("x-forwarded-") ||
        typeof value !== "string" || /[\r\n\0]/.test(value)) {
      throw new ProbeValidationError("unsafe_headers");
    }
    bytes += Buffer.byteLength(name) + Buffer.byteLength(value);
    if (bytes > 8_192) throw new ProbeValidationError("unsafe_headers");
    output[name] = value;
  }
  return output;
}

export type ResolvedAddress = { address: string; family: number };
type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

async function resolvePublic(hostname: string, resolver: Resolver, signal: AbortSignal): Promise<ResolvedAddress> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare)) {
    if (!isPublicIp(bare)) throw new ProbeValidationError("unsafe_target");
    return { address: bare, family: isIP(bare) };
  }
  let addresses: ResolvedAddress[];
  try {
    addresses = await withAbort(resolver(bare), signal);
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ProbeValidationError("dns_failure");
  }
  // Reject the whole RRset if even one answer is private. Do not choose a public
  // answer from an attacker-controlled mixed set.
  if (!addresses.length || addresses.some((record) =>
    record.family !== isIP(record.address) || !isPublicIp(record.address))) {
    throw new ProbeValidationError("unsafe_dns");
  }
  return addresses[0];
}

function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

export async function probeHttp(
  target: ProbeTarget,
  dependencies: { resolve?: Resolver } = {},
): Promise<ProbeResult> {
  const startedAt = Date.now();
  let statusCode: number | null = null;
  try {
    if (target.method !== "GET" && target.method !== "HEAD") {
      throw new ProbeValidationError("invalid_method");
    }
    if (target.method === "HEAD" && target.responseText) {
      throw new ProbeValidationError("invalid_match");
    }
    if (target.expectedStatus !== null &&
        (!Number.isInteger(target.expectedStatus) || target.expectedStatus < 100 || target.expectedStatus > 599)) {
      throw new ProbeValidationError("invalid_status");
    }
    let url = validatePublicUrl(target.url);
    let headers = validateHeaders(target.headers);
    const resolver = dependencies.resolve ?? ((hostname: string) => dns.lookup(hostname, { all: true, verbatim: true }));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      for (let redirects = 0; ; redirects += 1) {
        const address = await resolvePublic(url.hostname, resolver, controller.signal);
        const response = await requestOnce(url, target.method, headers, address, controller.signal,
          target.responseText !== null);
        statusCode = response.statusCode;
        if (response.redirect) {
          if (redirects >= maxRedirects) throw new ProbeValidationError("redirect_limit");
          const next = validatePublicUrl(new URL(response.redirect, url).toString());
          if (url.protocol === "https:" && next.protocol !== "https:") {
            throw new ProbeValidationError("redirect_downgrade");
          }
          if (next.origin !== url.origin) headers = {};
          url = next;
          continue;
        }
        const statusMatches = target.expectedStatus === null
          ? statusCode >= 200 && statusCode <= 399
          : statusCode === target.expectedStatus;
        if (!statusMatches) {
          return { success: false, statusCode, latencyMs: Date.now() - startedAt,
            errorKind: "unexpected_status" };
        }
        if (target.responseText !== null && !response.body.includes(target.responseText)) {
          return { success: false, statusCode, latencyMs: Date.now() - startedAt,
            errorKind: response.truncated ? "response_too_large" : "text_mismatch" };
        }
        return { success: true, statusCode, latencyMs: Date.now() - startedAt, errorKind: null };
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return {
      success: false,
      statusCode,
      latencyMs: Date.now() - startedAt,
      errorKind: error instanceof ProbeValidationError ? error.kind :
        isAbort(error) ? "timeout" : "network_error",
    };
  }
}

function isAbort(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.message === "The operation was aborted");
}

type Response = { statusCode: number; redirect: string | null; body: string; truncated: boolean };

function requestOnce(
  url: URL,
  method: ProbeMethod,
  headers: Record<string, string>,
  address: ResolvedAddress,
  signal: AbortSignal,
  readBody: boolean,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(pinnedRequestOptions(url, method, headers, address, signal), (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = response.headers.location;
      const redirect = statusCode >= 300 && statusCode < 400 && typeof location === "string"
        ? location : null;
      if (redirect || !readBody) {
        response.destroy();
        resolve({ statusCode, redirect, body: "", truncated: false });
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      let finished = false;
      response.on("data", (chunk: Buffer) => {
        if (finished) return;
        const remaining = maxResponseBytes - bytes;
        if (chunk.length > remaining) {
          if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
          finished = true;
          response.destroy();
          resolve({ statusCode, redirect: null, body: Buffer.concat(chunks).toString("utf8"), truncated: true });
          return;
        }
        bytes += chunk.length;
        chunks.push(chunk);
      });
      response.once("end", () => {
        if (!finished) resolve({ statusCode, redirect: null, body: Buffer.concat(chunks).toString("utf8"), truncated: false });
      });
      response.once("error", (error) => { if (!finished) reject(error); });
    });
    request.once("error", reject);
    request.end();
  });
}

export function pinnedRequestOptions(
  url: URL,
  method: ProbeMethod,
  headers: Record<string, string>,
  address: ResolvedAddress,
  signal: AbortSignal,
): http.RequestOptions & { servername: string } {
  return {
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ""),
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method,
      headers: { "user-agent": "OutRay-Uptime/1.0", accept: "*/*", "accept-encoding": "identity", ...headers },
      agent: false,
      signal,
      servername: url.hostname.replace(/^\[|\]$/g, ""),
      // The vetted answer is pinned into the socket dial. TLS verification and
      // the Host header still use the original hostname.
      lookup: (_hostname, options, callback) => {
        const done = typeof options === "function" ? options : callback;
        if (typeof done === "function") done(null, address.address, address.family);
      },
    };
}
