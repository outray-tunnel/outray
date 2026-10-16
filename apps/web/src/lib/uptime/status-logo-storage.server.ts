import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import instancePolicy from "../../../../../shared/instance-config";
import publicHosts from "../../../../../shared/public-hosts";

const { instanceConfig } = instancePolicy;
const { publicOrigin } = publicHosts;

export const MAX_STATUS_LOGO_BYTES = 256 * 1024;
const MAX_UPLOAD_BODY_BYTES = MAX_STATUS_LOGO_BYTES + 16 * 1024;
const FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|webp)$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export class InvalidStatusPageLogo extends Error {}

export type StatusPageLogoImage = {
  bytes: Uint8Array;
  contentType: "image/png" | "image/webp";
  extension: "png" | "webp";
};

export type StoredStatusPageLogo = {
  url: string;
  fileName: string;
  backend: "disk" | "cloudflare";
};

export function validateStatusPageLogo(bytes: Uint8Array, contentType?: string): StatusPageLogoImage {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_STATUS_LOGO_BYTES) {
    throw new InvalidStatusPageLogo("Logo must be a PNG or WebP under 256 KiB");
  }
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE);
  const webp = buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";
  if (!png && !webp) throw new InvalidStatusPageLogo("Only genuine PNG and WebP images are accepted");
  const detectedType = png ? "image/png" : "image/webp";
  if (contentType && contentType !== detectedType) {
    throw new InvalidStatusPageLogo("Logo content does not match its image type");
  }
  return { bytes, contentType: detectedType, extension: png ? "png" : "webp" };
}

/** Legacy database logos can be migrated without accepting arbitrary URLs. */
export function decodeLegacyStatusPageLogo(value: string): StatusPageLogoImage | null {
  if (!value.startsWith("data:")) return null;
  if (value.length > Math.ceil(MAX_STATUS_LOGO_BYTES / 3) * 4 + 64) {
    throw new InvalidStatusPageLogo("Logo exceeds 256 KiB");
  }
  const match = /^data:(image\/(?:png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new InvalidStatusPageLogo("Invalid stored logo");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.toString("base64") !== match[2]) throw new InvalidStatusPageLogo("Invalid stored logo encoding");
  return validateStatusPageLogo(bytes, match[1]);
}

/** Limit the stream before multipart parsing, not just the resulting File. */
export async function readStatusPageLogoUpload(request: Request): Promise<StatusPageLogoImage> {
  const contentType = request.headers.get("content-type") || "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new InvalidStatusPageLogo("Upload a PNG or WebP logo");
  }
  const advertisedLength = request.headers.get("content-length");
  if (advertisedLength && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > MAX_UPLOAD_BODY_BYTES)) {
    throw new InvalidStatusPageLogo("Logo upload exceeds 256 KiB");
  }
  if (!request.body) throw new InvalidStatusPageLogo("Upload a PNG or WebP logo");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_UPLOAD_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new InvalidStatusPageLogo("Logo upload exceeds 256 KiB");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new InvalidStatusPageLogo("Upload a PNG or WebP logo");
  }
  const logo = form.get("logo");
  if (!(logo instanceof File)) throw new InvalidStatusPageLogo("Upload a PNG or WebP logo");
  if (logo.size > MAX_STATUS_LOGO_BYTES) throw new InvalidStatusPageLogo("Logo must be a PNG or WebP under 256 KiB");
  return validateStatusPageLogo(new Uint8Array(await logo.arrayBuffer()));
}

function configuredOrigin(value: string, variable: string): URL {
  const origin = publicOrigin(value, variable);
  const local = ["localhost", "127.0.0.1"].includes(origin.hostname);
  if (origin.protocol !== "https:" && (process.env.NODE_ENV === "production" || !local)) {
    throw new Error(`${variable} must use HTTPS (HTTP loopback is only allowed in development)`);
  }
  return origin;
}

function deliveryOrigin(): URL {
  return configuredOrigin(process.env.DELIVERY_PUBLIC_URL || "https://delivery.outray.co", "DELIVERY_PUBLIC_URL");
}

function diskDirectory(): string {
  return resolve(process.env.STATUS_PAGE_LOGOS_DIR || resolve(process.cwd(), "data/status-page-logos"));
}

function consoleOrigin(): URL {
  const value = process.env.CONSOLE_PUBLIC_URL || process.env.APP_URL;
  if (!value) throw new Error("CONSOLE_PUBLIC_URL is required for self-hosted status-page logos");
  return configuredOrigin(value, "CONSOLE_PUBLIC_URL");
}

async function ensureDiskDirectory(): Promise<string> {
  const directory = diskDirectory();
  await mkdir(directory, { recursive: true, mode: 0o750 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Status logo directory must not be a symbolic link");
  return directory;
}

async function deliveryRequest(fileName: string, method: "PUT" | "DELETE", image?: StatusPageLogoImage): Promise<void> {
  const token = process.env.DELIVERY_UPLOAD_TOKEN;
  if (!token) throw new Error("DELIVERY_UPLOAD_TOKEN is required to store hosted status-page logos");
  const headers = new Headers({ authorization: `Bearer ${token}` });
  if (image) {
    headers.set("content-type", image.contentType);
    headers.set("content-length", String(image.bytes.byteLength));
  }
  const response = await fetch(`${deliveryOrigin().origin}/internal/status-page-logos/${fileName}`, {
    method,
    headers,
    body: image ? Buffer.from(image.bytes) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  const expected = method === "PUT" ? 201 : 204;
  await response.body?.cancel();
  if (response.status !== expected) throw new Error(`Status logo storage returned ${response.status}`);
}

export async function storeStatusPageLogo(bytes: Uint8Array, contentType?: string): Promise<StoredStatusPageLogo> {
  const image = validateStatusPageLogo(bytes, contentType);
  const fileName = `${randomUUID()}.${image.extension}`;
  if (instanceConfig().selfHosted) {
    // Resolve configuration before writing, so configuration failures leave no orphan file.
    const url = `${consoleOrigin().origin}/status-page-logos/${fileName}`;
    const directory = await ensureDiskDirectory();
    const file = await open(resolve(directory, fileName), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      await file.writeFile(image.bytes);
    } catch (error) {
      await file.close();
      await unlink(resolve(directory, fileName)).catch(() => {});
      throw error;
    }
    await file.close();
    return { url, fileName, backend: "disk" };
  }
  const url = `${deliveryOrigin().origin}/uptime-logos/${fileName}`;
  await deliveryRequest(fileName, "PUT", image);
  return { url, fileName, backend: "cloudflare" };
}

/** Roll back only a newly created, unreferenced object; never derive deletion targets from user input. */
export async function deleteNewStatusPageLogo(logo: StoredStatusPageLogo): Promise<void> {
  if (!FILE_NAME.test(logo.fileName)) throw new Error("Invalid managed logo name");
  if (logo.backend === "disk") {
    if (!instanceConfig().selfHosted || logo.url !== `${consoleOrigin().origin}/status-page-logos/${logo.fileName}`) {
      throw new Error("Logo does not belong to this disk store");
    }
    const directory = await ensureDiskDirectory();
    await unlink(resolve(directory, logo.fileName)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    return;
  }
  if (instanceConfig().selfHosted || logo.url !== `${deliveryOrigin().origin}/uptime-logos/${logo.fileName}`) {
    throw new Error("Logo does not belong to this delivery store");
  }
  await deliveryRequest(logo.fileName, "DELETE");
}

export async function serveDiskStatusPageLogo(fileName: string, head = false): Promise<Response> {
  const missing = () => new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  if (!instanceConfig().selfHosted || !FILE_NAME.test(fileName)) return missing();
  const directory = diskDirectory();
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) return missing();
    const file = await open(resolve(directory, fileName), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_STATUS_LOGO_BYTES) return missing();
      const headers = {
        "content-type": fileName.endsWith(".png") ? "image/png" : "image/webp",
        "content-length": String(stat.size),
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      };
      if (head) return new Response(null, { headers });
      // Bound reads even if a locally modified file grows after stat().
      const bytes = Buffer.alloc(MAX_STATUS_LOGO_BYTES + 1);
      let length = 0;
      while (length < bytes.length) {
        const result = await file.read(bytes, length, bytes.length - length, length);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      if (length !== stat.size || length > MAX_STATUS_LOGO_BYTES) return missing();
      validateStatusPageLogo(bytes.subarray(0, length), headers["content-type"]);
      return new Response(bytes.subarray(0, length), { headers });
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error instanceof InvalidStatusPageLogo || ["ENOENT", "ENOTDIR", "ELOOP"].includes((error as NodeJS.ErrnoException).code || "")) {
      return missing();
    }
    throw error;
  }
}
