import { createHash, timingSafeEqual } from "node:crypto";
import jpegImage from "../../../shared/jpeg-image";

const { isValidJpeg } = jpegImage;

export const MAX_LOGO_BYTES = 256 * 1024;
const PUBLIC_PREFIX = "/uptime-logos/";
const LEGACY_PUBLIC_PREFIX = "/status-page-logos/";
const INTERNAL_PREFIX = "/internal/status-page-logos/";
const ORGANIZATION_PUBLIC_PREFIX = "/org-logos/";
const ORGANIZATION_INTERNAL_PREFIX = "/internal/org-logos/";
const LOGO_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|webp)$/;
const ORGANIZATION_LOGO_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|webp|jpg|jpeg)$/;
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export interface StoredLogo {
  httpEtag: string;
  size: number;
  uploaded: Date;
  body?: ReadableStream<Uint8Array>;
}

export interface LogoBucket {
  head(key: string): Promise<StoredLogo | null>;
  get(key: string): Promise<StoredLogo | null>;
  put(
    key: string,
    body: Uint8Array,
    options: {
      onlyIf: Headers;
      httpMetadata: { contentType: string; cacheControl: string };
    },
  ): Promise<StoredLogo | null>;
  delete(key: string): Promise<void>;
}

export interface DeliveryEnv {
  STATUS_PAGE_LOGOS: LogoBucket;
  DELIVERY_UPLOAD_TOKEN?: string;
  PUBLIC_DELIVERY_URL?: string;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function jsonResponse(status: number, value: Record<string, unknown>): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function logoKey(filename: string): string | null {
  return LOGO_FILENAME.test(filename) ? `uptime-logos/${filename}` : null;
}

export function organizationLogoKey(filename: string): string | null {
  return ORGANIZATION_LOGO_FILENAME.test(filename) ? `org-logos/${filename}` : null;
}

function imageContentType(filename: string): "image/png" | "image/webp" | "image/jpeg" {
  if (filename.endsWith(".png")) return "image/png";
  return filename.endsWith(".webp") ? "image/webp" : "image/jpeg";
}

/** Compare fixed-size digests, including when a caller supplies a wrong-length token. */
export function authorizedUpload(request: Request, env: DeliveryEnv): boolean {
  const expected = env.DELIVERY_UPLOAD_TOKEN;
  if (!expected || expected.length < 32 || expected.length > 256) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization || authorization.length > 1024 || !authorization.startsWith("Bearer ")) {
    return false;
  }
  const supplied = authorization.slice("Bearer ".length);
  return timingSafeEqual(
    createHash("sha256").update(supplied).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

/** Validate image signatures/structure without trusting the caller's MIME type. */
export function matchesImageFormat(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "image/jpeg") return isValidJpeg(bytes);
  if (contentType === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    const end = [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];
    if (bytes.length < 45 || !signature.every((value, index) => bytes[index] === value)) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return view.getUint32(8) === 13 &&
      bytes[12] === 73 && bytes[13] === 72 && bytes[14] === 68 && bytes[15] === 82 &&
      view.getUint32(16) > 0 && view.getUint32(20) > 0 &&
      end.every((value, index) => bytes[bytes.length - end.length + index] === value);
  }

  if (contentType === "image/webp") {
    if (bytes.length < 20) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ascii = (offset: number, text: string) =>
      [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
    if (!ascii(0, "RIFF") || !ascii(8, "WEBP") || view.getUint32(4, true) + 8 !== bytes.length) return false;
    const validFirstChunk = ascii(12, "VP8 ") || ascii(12, "VP8L") || ascii(12, "VP8X");
    const chunkLength = view.getUint32(16, true);
    return validFirstChunk && chunkLength > 0 && 20 + chunkLength + (chunkLength % 2) <= bytes.length;
  }

  return false;
}

/** Never buffer more than the validated upload ceiling, even for chunked bodies. */
export async function readLogoBody(request: Request): Promise<Uint8Array> {
  const lengthHeader = request.headers.get("content-length");
  if (!lengthHeader || !/^[1-9]\d*$/.test(lengthHeader)) {
    throw new HttpError(411, "A valid Content-Length is required.");
  }
  const expectedLength = Number(lengthHeader);
  if (!Number.isSafeInteger(expectedLength) || expectedLength > MAX_LOGO_BYTES) {
    throw new HttpError(413, "Logo exceeds the 256 KiB limit.");
  }
  if (!request.body) throw new HttpError(400, "An image body is required.");

  const reader = request.body.getReader();
  const body = new Uint8Array(expectedLength);
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_LOGO_BYTES) throw new HttpError(413, "Logo exceeds the 256 KiB limit.");
      if (length > expectedLength) throw new HttpError(400, "Image length does not match Content-Length.");
      body.set(result.value, length - result.value.byteLength);
    }
    if (length !== expectedLength) throw new HttpError(400, "Image length does not match Content-Length.");
    return body;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((value) => {
    const candidate = value.trim();
    return candidate === "*" || candidate.replace(/^W\//, "") === etag;
  });
}

async function serveLogo(request: Request, env: DeliveryEnv, filename: string, key: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD", "cache-control": "no-store" } });
  }

  const object = request.method === "HEAD"
    ? await env.STATUS_PAGE_LOGOS.head(key)
    : await env.STATUS_PAGE_LOGOS.get(key);
  if (!object) return jsonResponse(404, { error: "Not found." });

  const headers = new Headers({
    "content-type": imageContentType(filename),
    "cache-control": IMMUTABLE_CACHE_CONTROL,
    "x-content-type-options": "nosniff",
    "etag": object.httpEtag,
    "last-modified": object.uploaded.toUTCString(),
    "access-control-allow-origin": "*",
    "cross-origin-resource-policy": "cross-origin",
  });
  if (etagMatches(request.headers.get("if-none-match"), object.httpEtag)) {
    await object.body?.cancel().catch(() => undefined);
    return new Response(null, { status: 304, headers });
  }
  headers.set("content-length", String(object.size));
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  if (!object.body) return jsonResponse(503, { error: "Logo delivery is temporarily unavailable." });
  return new Response(object.body, { status: 200, headers });
}

async function mutateLogo(request: Request, env: DeliveryEnv, filename: string, key: string, publicPrefix: string): Promise<Response> {
  if (!authorizedUpload(request, env)) {
    return jsonResponse(401, { error: "Unauthorized." });
  }
  if (request.method === "DELETE") {
    await env.STATUS_PAGE_LOGOS.delete(key);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  if (request.method !== "PUT") {
    return new Response(null, { status: 405, headers: { allow: "PUT, DELETE", "cache-control": "no-store" } });
  }

  const contentType = imageContentType(filename);
  if (request.headers.get("content-type") !== contentType) {
    return jsonResponse(415, { error: "Image type must match its extension." });
  }
  if (request.headers.has("content-encoding")) {
    return jsonResponse(415, { error: "Encoded image uploads are not supported." });
  }
  const body = await readLogoBody(request);
  if (!matchesImageFormat(body, contentType)) {
    const formats = publicPrefix === ORGANIZATION_PUBLIC_PREFIX ? "PNG, WebP, or JPEG" : "PNG or WebP";
    return jsonResponse(415, { error: `Upload must be a valid ${formats} image.` });
  }

  const stored = await env.STATUS_PAGE_LOGOS.put(key, body, {
    onlyIf: new Headers({ "If-None-Match": "*" }),
    httpMetadata: { contentType, cacheControl: IMMUTABLE_CACHE_CONTROL },
  });
  if (!stored) return jsonResponse(409, { error: "A logo with this filename already exists." });
  const origin = new URL(env.PUBLIC_DELIVERY_URL || "https://delivery.outray.co").origin;
  return jsonResponse(201, { key, url: `${origin}${publicPrefix}${filename}` });
}

export async function handleRequest(request: Request, env: DeliveryEnv): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === "/health" && (request.method === "GET" || request.method === "HEAD")) {
    return request.method === "HEAD"
      ? new Response(null, { headers: { "cache-control": "no-store" } })
      : jsonResponse(200, { ok: true });
  }
  const route = [
    { prefix: ORGANIZATION_INTERNAL_PREFIX, internal: true, publicPrefix: ORGANIZATION_PUBLIC_PREFIX, key: organizationLogoKey },
    { prefix: ORGANIZATION_PUBLIC_PREFIX, internal: false, publicPrefix: ORGANIZATION_PUBLIC_PREFIX, key: organizationLogoKey },
    { prefix: INTERNAL_PREFIX, internal: true, publicPrefix: PUBLIC_PREFIX, key: logoKey },
    { prefix: PUBLIC_PREFIX, internal: false, publicPrefix: PUBLIC_PREFIX, key: logoKey },
    { prefix: LEGACY_PUBLIC_PREFIX, internal: false, publicPrefix: PUBLIC_PREFIX, key: logoKey },
  ].find((candidate) => pathname.startsWith(candidate.prefix));
  if (!route) return jsonResponse(404, { error: "Not found." });
  const filename = pathname.slice(route.prefix.length);
  const key = route.key(filename);
  if (!key) return jsonResponse(404, { error: "Not found." });

  try {
    return route.internal
      ? await mutateLogo(request, env, filename, key, route.publicPrefix)
      : await serveLogo(request, env, filename, key);
  } catch (error) {
    if (error instanceof HttpError) return jsonResponse(error.status, { error: error.message });
    // Provider failures must not leak bucket names, credentials, or upstream messages.
    return jsonResponse(503, { error: "Logo delivery is temporarily unavailable." });
  }
}
