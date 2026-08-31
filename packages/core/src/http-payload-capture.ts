import { trace, type Span } from "@opentelemetry/api";
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";

const REDACTED = "[REDACTED]";
const CAPTURE_VERSION = "1";
const DEFAULT_MAX_BODY_BYTES = 16 * 1024;
const HARD_MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_MAX_HEADER_BYTES = 8 * 1024;
const HARD_MAX_HEADER_BYTES = 32 * 1024;
const MAX_STRUCTURE_DEPTH = 8;
const MAX_COLLECTION_ENTRIES = 100;

const DEFAULT_SENSITIVE_HEADERS = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "api-key",
  "x-api-key",
  "auth-token",
  "x-auth-token",
  "access-token",
  "x-access-token",
  "refresh-token",
  "x-refresh-token",
  "client-secret",
  "x-client-secret",
  "private-key",
  "x-private-key",
  "session",
  "session-id",
  "x-csrf-token",
  "x-xsrf-token",
  "referer",
  "forwarded",
  "x-forwarded-for",
  "x-real-ip",
  "client-ip",
  "baggage",
] as const;

const DEFAULT_SENSITIVE_FIELDS = [
  "authorization",
  "cookie",
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "access-token",
  "refresh-token",
  "auth-token",
  "api-key",
  "private-key",
  "client-secret",
  "session",
  "session-id",
  "credit-card",
  "card-number",
  "cvv",
  "cvc",
  "ssn",
  "social-security",
  "passcode",
  "pin",
  "otp",
] as const;

export const OUTRAY_HTTP_CAPTURE_ATTRIBUTES = {
  version: "outray.http.capture.version",
  requestHeaders: "outray.http.request.headers",
  requestHeadersTruncated: "outray.http.request.headers.truncated",
  requestBody: "outray.http.request.body",
  requestBodySize: "outray.http.request.body.size",
  requestBodyTruncated: "outray.http.request.body.truncated",
  requestBodyContentType: "outray.http.request.body.content_type",
  responseHeaders: "outray.http.response.headers",
  responseHeadersTruncated: "outray.http.response.headers.truncated",
  responseBody: "outray.http.response.body",
  responseBodySize: "outray.http.response.body.size",
  responseBodyTruncated: "outray.http.response.body.truncated",
  responseBodyContentType: "outray.http.response.body.content_type",
} as const;

/**
 * Payload capture is deliberately opt-in. Defaults are bounded and only capture
 * JSON (including `application/*+json`) and URL-encoded form bodies.
 */
export interface HttpPayloadCaptureOptions {
  /** Capture request headers after redaction. @default true */
  requestHeaders?: boolean;
  /** Capture parsed request bodies after redaction. @default true */
  requestBody?: boolean;
  /** Capture response headers after redaction. @default true */
  responseHeaders?: boolean;
  /** Capture bounded response bodies after redaction. @default true */
  responseBody?: boolean;
  /** Maximum body bytes retained for capture. Clamped to 64 KiB. @default 16 KiB */
  maxBodyBytes?: number;
  /** Maximum serialized header bytes retained. Clamped to 32 KiB. @default 8 KiB */
  maxHeaderBytes?: number;
  /** Additional header names to redact. Defaults can only be extended. */
  redactedHeaders?: readonly string[];
  /** Additional JSON/form field names to redact. Defaults can only be extended. */
  redactedFields?: readonly string[];
}

export type HttpPayloadCaptureSetting = boolean | HttpPayloadCaptureOptions;

export type NodeHttpPayloadCaptureMiddleware = (
  request: IncomingMessage & { body?: unknown },
  response: ServerResponse,
  next: (error?: unknown) => void,
) => void;

interface NormalizedCaptureOptions {
  requestHeaders: boolean;
  requestBody: boolean;
  responseHeaders: boolean;
  responseBody: boolean;
  maxBodyBytes: number;
  maxHeaderBytes: number;
  redactedHeaders: Set<string>;
  redactedFields: Set<string>;
}

interface BodyCapture {
  contentType: string;
  size: number;
  truncated: boolean;
  value?: string;
}

interface StructureState {
  truncated: boolean;
  seen: WeakSet<object>;
}

interface ByteCollector {
  chunks: Buffer[];
  retainedBytes: number;
  totalBytes: number;
  truncated: boolean;
}

const RESPONSE_CAPTURED = Symbol.for("outray.http.payload-capture");

/** Returns true only when capture is enabled and the current context has a span. */
export function isHttpPayloadCaptureActive(
  setting: HttpPayloadCaptureSetting,
): boolean {
  try {
    const span = trace.getActiveSpan();
    return (
      normalizeOptions(setting) !== null &&
      span !== undefined &&
      span.isRecording()
    );
  } catch {
    return false;
  }
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clampBytes(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback;
  }

  return Math.max(1, Math.min(maximum, Math.floor(value)));
}

function normalizeOptions(
  setting: HttpPayloadCaptureSetting,
): NormalizedCaptureOptions | null {
  try {
    if (setting === false || setting == null) {
      return null;
    }

    const options = setting === true ? {} : setting;
    const redactedHeaders = new Set(
      [...DEFAULT_SENSITIVE_HEADERS, ...(options.redactedHeaders ?? [])].map(
        normalizeName,
      ),
    );
    const redactedFields = new Set(
      [...DEFAULT_SENSITIVE_FIELDS, ...(options.redactedFields ?? [])].map(
        normalizeName,
      ),
    );

    return {
      requestHeaders: options.requestHeaders !== false,
      requestBody: options.requestBody !== false,
      responseHeaders: options.responseHeaders !== false,
      responseBody: options.responseBody !== false,
      maxBodyBytes: clampBytes(
        options.maxBodyBytes,
        DEFAULT_MAX_BODY_BYTES,
        HARD_MAX_BODY_BYTES,
      ),
      maxHeaderBytes: clampBytes(
        options.maxHeaderBytes,
        DEFAULT_MAX_HEADER_BYTES,
        HARD_MAX_HEADER_BYTES,
      ),
      redactedHeaders,
      redactedFields,
    };
  } catch {
    return null;
  }
}

function isSensitive(name: string, names: Set<string>): boolean {
  const normalized = normalizeName(name);
  if (names.has(normalized)) {
    return true;
  }

  return (
    normalized.includes("password") ||
    normalized.includes("passwd") ||
    normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("apikey") ||
    normalized.includes("privatekey") ||
    normalized.includes("cardnumber") ||
    normalized.includes("creditcard") ||
    normalized.includes("socialsecurity") ||
    normalized.includes("authorization") ||
    normalized.includes("cookie")
  );
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (byteLength(value) <= maxBytes) {
    return value;
  }

  const buffer = Buffer.from(value, "utf8");
  let end = Math.min(maxBytes, buffer.byteLength);
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) {
    end -= 1;
  }
  return buffer.subarray(0, end).toString("utf8");
}

function safelySetAttribute(
  span: Span,
  name: string,
  value: string | number | boolean,
): void {
  try {
    if (!span.isRecording()) return;
    span.setAttribute(name, value);
  } catch {
    // Capture must never affect the host application.
  }
}

function contentTypeFrom(
  value: string | string[] | number | undefined,
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") {
    return "";
  }

  return raw.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isAllowedBodyContentType(contentType: string): boolean {
  return (
    contentType === "application/json" ||
    (contentType.startsWith("application/") && contentType.endsWith("+json")) ||
    contentType === "application/x-www-form-urlencoded"
  );
}

function isIdentityContentEncoding(
  value: string | string[] | number | undefined,
): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return (
    raw === undefined ||
    (typeof raw === "string" && raw.trim().toLowerCase() === "identity")
  );
}

function numericContentLength(
  value: string | string[] | undefined,
): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function headerEntries(
  headers: IncomingHttpHeaders | Headers | Record<string, unknown>,
): Array<[string, unknown]> {
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return Array.from(headers.entries());
  }

  return Object.entries(headers);
}

function serializeHeaders(
  headers: IncomingHttpHeaders | Headers | Record<string, unknown>,
  options: NormalizedCaptureOptions,
): { value: string; truncated: boolean } {
  const captured: Record<string, string | string[]> = Object.create(null);
  let truncated = false;

  const entries = headerEntries(headers).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length > MAX_COLLECTION_ENTRIES) {
    truncated = true;
  }

  for (const [rawName, rawValue] of entries.slice(0, MAX_COLLECTION_ENTRIES)) {
    if (rawValue === undefined) {
      continue;
    }

    const name = rawName.toLowerCase();
    let value: string | string[];
    if (isSensitive(name, options.redactedHeaders)) {
      value = REDACTED;
    } else if (Array.isArray(rawValue)) {
      const values = rawValue.slice(0, MAX_COLLECTION_ENTRIES);
      const perValueLimit = Math.max(
        1,
        Math.floor(options.maxHeaderBytes / Math.max(1, values.length)),
      );
      value = values.map((item) => {
        const stringValue = String(item);
        const bounded = truncateUtf8(stringValue, perValueLimit);
        if (bounded !== stringValue) truncated = true;
        return bounded;
      });
      if (rawValue.length > values.length) truncated = true;
    } else {
      const stringValue = String(rawValue);
      value = truncateUtf8(stringValue, options.maxHeaderBytes);
      if (value !== stringValue) truncated = true;
    }
    const candidate = JSON.stringify({ ...captured, [name]: value });

    if (byteLength(candidate) > options.maxHeaderBytes) {
      truncated = true;
      continue;
    }

    captured[name] = value;
  }

  return { value: JSON.stringify(captured), truncated };
}

function sanitizeStructure(
  value: unknown,
  fields: Set<string>,
  state: StructureState,
  depth = 0,
): unknown {
  if (depth > MAX_STRUCTURE_DEPTH) {
    state.truncated = true;
    return "[TRUNCATED]";
  }

  if (value === null || typeof value !== "object") {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (state.seen.has(value)) {
    state.truncated = true;
    return "[CIRCULAR]";
  }
  state.seen.add(value);

  if (Array.isArray(value)) {
    if (value.length > MAX_COLLECTION_ENTRIES) {
      state.truncated = true;
    }
    return value
      .slice(0, MAX_COLLECTION_ENTRIES)
      .map((item) => sanitizeStructure(item, fields, state, depth + 1));
  }

  const result: Record<string, unknown> = Object.create(null);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_COLLECTION_ENTRIES) {
    state.truncated = true;
  }

  for (const [name, entryValue] of entries.slice(0, MAX_COLLECTION_ENTRIES)) {
    result[name] = isSensitive(name, fields)
      ? REDACTED
      : sanitizeStructure(entryValue, fields, state, depth + 1);
  }

  return result;
}

function fitJsonString(value: string, maxBytes: number): string | undefined {
  if (maxBytes < 2) return undefined;
  if (byteLength(JSON.stringify(value)) <= maxBytes) return value;

  let low = 0;
  let high = value.length;
  let best = "";
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = value.slice(0, middle);
    if (byteLength(JSON.stringify(candidate)) <= maxBytes) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

function fitJsonValue(
  value: unknown,
  maxBytes: number,
  state: StructureState,
): unknown {
  if (typeof value === "string") {
    const fitted = fitJsonString(value, maxBytes);
    if (fitted !== value) state.truncated = true;
    return fitted;
  }

  if (value === null || typeof value !== "object") {
    try {
      const serialized = JSON.stringify(value);
      if (serialized !== undefined && byteLength(serialized) <= maxBytes) {
        return value;
      }
    } catch {
      // Fall through to a bounded omission.
    }
    state.truncated = true;
    return undefined;
  }

  if (Array.isArray(value)) {
    if (maxBytes < 2) {
      state.truncated = true;
      return undefined;
    }
    const result: unknown[] = [];
    for (const item of value) {
      const fitted = fitJsonValue(item, maxBytes, state);
      const candidate = [...result, fitted];
      if (byteLength(JSON.stringify(candidate)) > maxBytes) {
        state.truncated = true;
        break;
      }
      result.push(fitted);
    }
    return result;
  }

  if (maxBytes < 2) {
    state.truncated = true;
    return undefined;
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const [name, item] of Object.entries(value as Record<string, unknown>)) {
    if (byteLength(name) > maxBytes) {
      state.truncated = true;
      continue;
    }
    const fitted = fitJsonValue(item, maxBytes, state);
    const candidate = { ...result, [name]: fitted };
    if (byteLength(JSON.stringify(candidate)) > maxBytes) {
      state.truncated = true;
      continue;
    }
    result[name] = fitted;
  }
  return result;
}

function serializeStructuredBody(
  value: unknown,
  options: NormalizedCaptureOptions,
): { value?: string; truncated: boolean } {
  const state: StructureState = { truncated: false, seen: new WeakSet() };

  try {
    const sanitized = sanitizeStructure(value, options.redactedFields, state);
    const fitted = fitJsonValue(sanitized, options.maxBodyBytes, state);
    const serialized = JSON.stringify(fitted);
    if (serialized === undefined) {
      return { truncated: true };
    }

    return {
      value: serialized,
      truncated: state.truncated,
    };
  } catch {
    return { truncated: true };
  }
}

function serializeFormBody(
  form: URLSearchParams,
  options: NormalizedCaptureOptions,
): { value: string; truncated: boolean } {
  const parts: string[] = [];
  let truncated = false;
  let count = 0;

  for (const [name, rawValue] of form) {
    count += 1;
    if (count > MAX_COLLECTION_ENTRIES) {
      truncated = true;
      break;
    }

    if (byteLength(name) > options.maxBodyBytes) {
      truncated = true;
      continue;
    }
    const encodedName = encodeURIComponent(name);
    const boundedRawValue = truncateUtf8(rawValue, options.maxBodyBytes);
    if (boundedRawValue !== rawValue) truncated = true;
    const value = isSensitive(name, options.redactedFields)
      ? REDACTED
      : encodeURIComponent(boundedRawValue);
    const part = `${encodedName}=${value}`;
    const candidate = [...parts, part].join("&");

    if (byteLength(candidate) > options.maxBodyBytes) {
      truncated = true;
      break;
    }
    parts.push(part);
  }

  return { value: parts.join("&"), truncated };
}

function captureParsedBody(
  body: unknown,
  contentType: string,
  options: NormalizedCaptureOptions,
  observedSize?: number,
): BodyCapture | null {
  if (!isAllowedBodyContentType(contentType) || body === undefined) {
    return null;
  }

  if (
    typeof body === "string" ||
    Buffer.isBuffer(body) ||
    body instanceof Uint8Array
  ) {
    const raw =
      typeof body === "string" ? body : Buffer.from(body).toString("utf8");
    const size = observedSize ?? byteLength(raw);
    if (raw.length === 0) {
      return null;
    }
    if (byteLength(raw) > options.maxBodyBytes) {
      return { contentType, size, truncated: true };
    }

    try {
      if (contentType === "application/x-www-form-urlencoded") {
        const serialized = serializeFormBody(new URLSearchParams(raw), options);
        return {
          contentType,
          size,
          truncated:
            serialized.truncated ||
            (observedSize !== undefined && observedSize > options.maxBodyBytes),
          value: serialized.value,
        };
      }

      const serialized = serializeStructuredBody(JSON.parse(raw), options);
      return {
        contentType,
        size,
        truncated:
          serialized.truncated ||
          (observedSize !== undefined && observedSize > options.maxBodyBytes),
        value: serialized.value,
      };
    } catch {
      // Never emit an unparsed body because secrets cannot be redacted safely.
      return { contentType, size, truncated: true };
    }
  }

  if (contentType === "application/x-www-form-urlencoded") {
    const form = new URLSearchParams();
    if (body && typeof body === "object") {
      for (const [name, value] of Object.entries(
        body as Record<string, unknown>,
      )) {
        if (Array.isArray(value)) {
          for (const item of value) form.append(name, String(item));
        } else if (value !== undefined) {
          form.append(name, String(value));
        }
      }
    }
    const serialized = serializeFormBody(form, options);
    return {
      contentType,
      size: observedSize ?? byteLength(serialized.value),
      truncated:
        serialized.truncated ||
        (observedSize !== undefined && observedSize > options.maxBodyBytes),
      value: serialized.value,
    };
  }

  const serialized = serializeStructuredBody(body, options);
  return {
    contentType,
    size: observedSize ?? byteLength(serialized.value ?? ""),
    truncated:
      serialized.truncated ||
      (observedSize !== undefined && observedSize > options.maxBodyBytes),
    value: serialized.value,
  };
}

function writeHeaderAttributes(
  span: Span,
  side: "request" | "response",
  headers: IncomingHttpHeaders | Headers | Record<string, unknown>,
  options: NormalizedCaptureOptions,
): void {
  const captured = serializeHeaders(headers, options);
  const valueName =
    side === "request"
      ? OUTRAY_HTTP_CAPTURE_ATTRIBUTES.requestHeaders
      : OUTRAY_HTTP_CAPTURE_ATTRIBUTES.responseHeaders;
  const truncatedName =
    side === "request"
      ? OUTRAY_HTTP_CAPTURE_ATTRIBUTES.requestHeadersTruncated
      : OUTRAY_HTTP_CAPTURE_ATTRIBUTES.responseHeadersTruncated;

  safelySetAttribute(span, valueName, captured.value);
  safelySetAttribute(span, truncatedName, captured.truncated);
}

function writeBodyAttributes(
  span: Span,
  side: "request" | "response",
  captured: BodyCapture,
): void {
  const names =
    side === "request"
      ? {
          value: OUTRAY_HTTP_CAPTURE_ATTRIBUTES.requestBody,
          size: OUTRAY_HTTP_CAPTURE_ATTRIBUTES.requestBodySize,
          truncated: OUTRAY_HTTP_CAPTURE_ATTRIBUTES.requestBodyTruncated,
          contentType: OUTRAY_HTTP_CAPTURE_ATTRIBUTES.requestBodyContentType,
        }
      : {
          value: OUTRAY_HTTP_CAPTURE_ATTRIBUTES.responseBody,
          size: OUTRAY_HTTP_CAPTURE_ATTRIBUTES.responseBodySize,
          truncated: OUTRAY_HTTP_CAPTURE_ATTRIBUTES.responseBodyTruncated,
          contentType: OUTRAY_HTTP_CAPTURE_ATTRIBUTES.responseBodyContentType,
        };

  safelySetAttribute(span, names.contentType, captured.contentType);
  safelySetAttribute(span, names.size, captured.size);
  safelySetAttribute(span, names.truncated, captured.truncated);
  if (captured.value !== undefined) {
    safelySetAttribute(span, names.value, captured.value);
  }
}

function createCollector(): ByteCollector {
  return { chunks: [], retainedBytes: 0, totalBytes: 0, truncated: false };
}

function addChunk(
  collector: ByteCollector,
  chunk: unknown,
  encoding: BufferEncoding | undefined,
  maxBytes: number,
): void {
  if (chunk === undefined || chunk === null) {
    return;
  }

  let buffer: Buffer;
  try {
    if (Buffer.isBuffer(chunk)) {
      buffer = chunk;
    } else if (chunk instanceof Uint8Array) {
      buffer = Buffer.from(chunk);
    } else if (typeof chunk === "string") {
      buffer = Buffer.from(chunk, encoding);
    } else {
      return;
    }
  } catch {
    collector.truncated = true;
    return;
  }

  collector.totalBytes += buffer.byteLength;
  const remaining = maxBytes - collector.retainedBytes;
  if (remaining > 0) {
    const retained = buffer.subarray(0, remaining);
    collector.chunks.push(retained);
    collector.retainedBytes += retained.byteLength;
  }
  if (buffer.byteLength > remaining) {
    collector.truncated = true;
  }
}

function encodingFromArgs(args: unknown[]): BufferEncoding | undefined {
  const candidate = args[1];
  return typeof candidate === "string" && Buffer.isEncoding(candidate)
    ? candidate
    : undefined;
}

/**
 * Creates Connect/Express-compatible middleware. It does not consume request
 * streams; request bodies are captured only when an upstream/downstream parser
 * exposes `request.body`. Response collection is bounded before parsing.
 */
export function createNodeHttpPayloadCaptureMiddleware(
  setting: HttpPayloadCaptureSetting,
): NodeHttpPayloadCaptureMiddleware {
  const options = normalizeOptions(setting);

  return (request, response, next) => {
    if (!options) {
      next();
      return;
    }

    let span: Span | undefined;
    try {
      span = trace.getActiveSpan();
    } catch {
      // Fall through to the no-op path.
    }
    if (!span || !span.isRecording()) {
      next();
      return;
    }

    safelySetAttribute(
      span,
      OUTRAY_HTTP_CAPTURE_ATTRIBUTES.version,
      CAPTURE_VERSION,
    );

    if (options.requestHeaders) {
      try {
        writeHeaderAttributes(span, "request", request.headers, options);
      } catch {
        // Invalid/non-standard headers must not affect request handling.
      }
    }

    const markedResponse = response as ServerResponse & {
      [RESPONSE_CAPTURED]?: boolean;
    };
    try {
      if (markedResponse[RESPONSE_CAPTURED]) {
        next();
        return;
      }
      markedResponse[RESPONSE_CAPTURED] = true;
    } catch {
      next();
      return;
    }

    try {
      const collector = createCollector();
      const originalWrite = response.write;
      const originalEnd = response.end;
      let finalized = false;

      if (options.responseBody) {
        response.write = function (
          this: ServerResponse,
          ...args: unknown[]
        ): boolean {
          addChunk(
            collector,
            args[0],
            encodingFromArgs(args),
            options.maxBodyBytes,
          );
          return originalWrite.apply(
            this,
            args as Parameters<typeof originalWrite>,
          );
        } as typeof response.write;
      }

      response.end = function (
        this: ServerResponse,
        ...args: unknown[]
      ): ServerResponse {
        if (options.responseBody) {
          addChunk(
            collector,
            args[0],
            encodingFromArgs(args),
            options.maxBodyBytes,
          );
        }

        if (!finalized) {
          finalized = true;

          try {
            if (
              options.requestBody &&
              isIdentityContentEncoding(request.headers["content-encoding"])
            ) {
              const requestContentType = contentTypeFrom(
                request.headers["content-type"],
              );
              const requestBody = captureParsedBody(
                request.body,
                requestContentType,
                options,
                numericContentLength(request.headers["content-length"]),
              );
              if (requestBody) {
                writeBodyAttributes(span, "request", requestBody);
              }
            }

            if (options.responseHeaders) {
              writeHeaderAttributes(
                span,
                "response",
                response.getHeaders() as Record<string, unknown>,
                options,
              );
            }

            if (options.responseBody) {
              const responseContentType = contentTypeFrom(
                response.getHeader("content-type") as
                  | string
                  | string[]
                  | number
                  | undefined,
              );
              if (
                isAllowedBodyContentType(responseContentType) &&
                isIdentityContentEncoding(
                  response.getHeader("content-encoding") as
                    | string
                    | string[]
                    | number
                    | undefined,
                )
              ) {
                const raw = Buffer.concat(collector.chunks);
                const responseBody = captureParsedBody(
                  raw,
                  responseContentType,
                  options,
                  collector.totalBytes,
                );
                if (responseBody) {
                  responseBody.truncated ||= collector.truncated;
                  writeBodyAttributes(span, "response", responseBody);
                }
              }
            }
          } catch {
            // Capture must never prevent a response from completing.
          }
        }

        return originalEnd.apply(this, args as Parameters<typeof originalEnd>);
      } as typeof response.end;
    } catch {
      // A framework may expose a non-standard/frozen response object. Skip safely.
    }

    next();
  };
}

async function readBoundedWebBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<ByteCollector> {
  const collector = createCollector();
  if (!body) {
    return collector;
  }

  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      addChunk(collector, value, undefined, maxBytes);
      if (collector.truncated) {
        // A clone uses a tee'd stream. Its cancel promise can wait for the
        // original branch, which the framework cannot consume until capture
        // returns, so cancellation must never be awaited here.
        void reader.cancel().catch(() => undefined);
        break;
      }
    }
  } catch {
    collector.truncated = true;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Some Web Stream implementations keep the lock during cancellation.
    }
  }

  return collector;
}

/** Capture a cloned Fetch Request without touching the handler's request stream. */
export async function captureFetchRequest(
  request: Request,
  setting: HttpPayloadCaptureSetting,
): Promise<void> {
  const options = normalizeOptions(setting);
  const span = trace.getActiveSpan();
  if (!options || !span || !span.isRecording()) return;

  safelySetAttribute(
    span,
    OUTRAY_HTTP_CAPTURE_ATTRIBUTES.version,
    CAPTURE_VERSION,
  );
  if (options.requestHeaders) {
    writeHeaderAttributes(span, "request", request.headers, options);
  }

  const contentType = contentTypeFrom(
    request.headers.get("content-type") ?? undefined,
  );
  if (
    !options.requestBody ||
    request.method === "GET" ||
    request.method === "HEAD" ||
    !isAllowedBodyContentType(contentType) ||
    !isIdentityContentEncoding(
      request.headers.get("content-encoding") ?? undefined,
    )
  ) {
    return;
  }

  const collector = await readBoundedWebBody(
    request.body,
    options.maxBodyBytes,
  );
  const declaredSize = numericContentLength(
    request.headers.get("content-length") ?? undefined,
  );
  const captured = captureParsedBody(
    Buffer.concat(collector.chunks),
    contentType,
    options,
    declaredSize ?? collector.totalBytes,
  );
  if (captured) {
    captured.truncated ||= collector.truncated;
    writeBodyAttributes(span, "request", captured);
  }
}

/** Capture a cloned Fetch Response without buffering or replacing the response returned to the client. */
export async function captureFetchResponse(
  response: Response,
  setting: HttpPayloadCaptureSetting,
): Promise<void> {
  const options = normalizeOptions(setting);
  const span = trace.getActiveSpan();
  if (!options || !span || !span.isRecording()) return;

  safelySetAttribute(
    span,
    OUTRAY_HTTP_CAPTURE_ATTRIBUTES.version,
    CAPTURE_VERSION,
  );
  if (options.responseHeaders) {
    writeHeaderAttributes(span, "response", response.headers, options);
  }

  const contentType = contentTypeFrom(
    response.headers.get("content-type") ?? undefined,
  );
  if (
    !options.responseBody ||
    !isAllowedBodyContentType(contentType) ||
    !isIdentityContentEncoding(
      response.headers.get("content-encoding") ?? undefined,
    )
  ) {
    return;
  }

  const collector = await readBoundedWebBody(
    response.body,
    options.maxBodyBytes,
  );
  const declaredSize = numericContentLength(
    response.headers.get("content-length") ?? undefined,
  );
  const captured = captureParsedBody(
    Buffer.concat(collector.chunks),
    contentType,
    options,
    declaredSize ?? collector.totalBytes,
  );
  if (captured) {
    captured.truncated ||= collector.truncated;
    writeBodyAttributes(span, "response", captured);
  }
}
