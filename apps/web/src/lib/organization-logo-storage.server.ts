import { randomUUID } from "node:crypto";
import publicHosts from "../../../../shared/public-hosts";
import jpegImage from "../../../../shared/jpeg-image";
import { MAX_STATUS_LOGO_BYTES, validateStatusPageLogo } from "./uptime/status-logo-storage.server";

export const MAX_ORGANIZATION_LOGO_BYTES = MAX_STATUS_LOGO_BYTES;
const { isValidJpeg } = jpegImage;
const MAX_UPLOAD_BYTES = MAX_ORGANIZATION_LOGO_BYTES + 16 * 1024;
const FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|webp|jpe?g)$/;

export class InvalidOrganizationLogo extends Error {
  readonly status: 400 | 413;
  constructor(message: string, status: 400 | 413 = 400) { super(message); this.status = status; }
}
export type OrganizationLogoImage = { bytes: Uint8Array; contentType: "image/png" | "image/webp" | "image/jpeg"; extension: "png" | "webp" | "jpg" };
export type StoredOrganizationLogo = { url: string; fileName: string };

/** Match the delivery service's bounded image structural validation. */
export function validateOrganizationLogo(bytes: Uint8Array, contentType?: string): OrganizationLogoImage {
  if (!bytes.byteLength || bytes.byteLength > MAX_ORGANIZATION_LOGO_BYTES) {
    throw new InvalidOrganizationLogo("Logo must be a PNG, JPEG or WebP under 256 KiB", bytes.byteLength ? 413 : 400);
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    if ((contentType && contentType !== "image/jpeg") || !isValidJpeg(bytes)) {
      throw new InvalidOrganizationLogo("Upload a genuine PNG, JPEG or WebP image with a matching image type");
    }
    return { bytes, contentType: "image/jpeg", extension: "jpg" };
  }
  let image: OrganizationLogoImage;
  try { image = validateStatusPageLogo(bytes, contentType); }
  catch { throw new InvalidOrganizationLogo("Upload a genuine PNG, JPEG or WebP image with a matching image type"); }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, value: string) => [...value].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  const pngEnd = [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];
  const png = image.extension === "png" && bytes.length >= 45 && view.getUint32(8) === 13 && ascii(12, "IHDR") &&
    view.getUint32(16) > 0 && view.getUint32(20) > 0 && pngEnd.every((value, index) => bytes[bytes.length - pngEnd.length + index] === value);
  const webp = image.extension === "webp" && bytes.length >= 20 && view.getUint32(4, true) + 8 === bytes.length &&
    (ascii(12, "VP8 ") || ascii(12, "VP8L") || ascii(12, "VP8X")) && view.getUint32(16, true) > 0 &&
    20 + view.getUint32(16, true) + (view.getUint32(16, true) % 2) <= bytes.length;
  if (!png && !webp) throw new InvalidOrganizationLogo("Upload a genuine PNG, JPEG or WebP image");
  return image;
}

/** Bound the stream before parsing multipart fields or buffering a File. */
export async function readOrganizationLogoUpload(request: Request): Promise<OrganizationLogoImage> {
  const contentType = request.headers.get("content-type") || "";
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !request.body) throw new InvalidOrganizationLogo("Upload a PNG, JPEG or WebP logo");
  const advertised = request.headers.get("content-length");
  if (advertised && (!/^\d+$/.test(advertised) || !Number.isSafeInteger(Number(advertised)) || Number(advertised) > MAX_UPLOAD_BYTES)) {
    throw new InvalidOrganizationLogo("Logo upload exceeds 256 KiB", 413);
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_UPLOAD_BYTES) {
        await reader.cancel().catch(() => {});
        throw new InvalidOrganizationLogo("Logo upload exceeds 256 KiB", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { "content-type": contentType } }).formData(); }
  catch { throw new InvalidOrganizationLogo("Upload a PNG, JPEG or WebP logo"); }
  const logo = form.get("logo");
  if (form.getAll("logo").length !== 1 || [...form.keys()].some((key) => key !== "logo") || !(logo instanceof File)) {
    throw new InvalidOrganizationLogo("Upload one PNG, JPEG or WebP logo");
  }
  if (logo.size > MAX_ORGANIZATION_LOGO_BYTES) throw new InvalidOrganizationLogo("Logo must be a PNG, JPEG or WebP under 256 KiB", 413);
  if (!["image/png", "image/webp", "image/jpeg"].includes(logo.type)) throw new InvalidOrganizationLogo("Upload a PNG, JPEG or WebP image");
  return validateOrganizationLogo(new Uint8Array(await logo.arrayBuffer()), logo.type);
}

function deliveryOrigin(): string {
  const url = publicHosts.publicOrigin(process.env.DELIVERY_PUBLIC_URL || "https://delivery.outray.co", "DELIVERY_PUBLIC_URL");
  if (url.protocol !== "https:" && (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("DELIVERY_PUBLIC_URL must use HTTPS");
  }
  return url.origin;
}

async function deliveryRequest(fileName: string, method: "PUT" | "DELETE", image?: OrganizationLogoImage): Promise<void> {
  const token = process.env.DELIVERY_UPLOAD_TOKEN;
  if (!token) throw new Error("DELIVERY_UPLOAD_TOKEN is required to store organization logos");
  const headers = new Headers({ authorization: `Bearer ${token}` });
  if (image) { headers.set("content-type", image.contentType); headers.set("content-length", String(image.bytes.byteLength)); }
  const response = await fetch(`${deliveryOrigin()}/internal/org-logos/${fileName}`, {
    method, headers, body: image ? Buffer.from(image.bytes) : undefined,
    redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  await response.body?.cancel();
  if (response.status !== (method === "PUT" ? 201 : 204)) throw new Error(`Organization logo storage returned ${response.status}`);
}

export async function storeOrganizationLogo(bytes: Uint8Array, contentType?: string): Promise<StoredOrganizationLogo> {
  const image = validateOrganizationLogo(bytes, contentType);
  const fileName = `${randomUUID()}.${image.extension}`;
  const url = `${deliveryOrigin()}/org-logos/${fileName}`;
  await deliveryRequest(fileName, "PUT", image);
  return { url, fileName };
}

/** Only accept a just-created managed object, never an arbitrary deletion URL. */
export async function deleteNewOrganizationLogo(logo: StoredOrganizationLogo): Promise<void> {
  if (!FILE_NAME.test(logo.fileName) || logo.url !== `${deliveryOrigin()}/org-logos/${logo.fileName}`) throw new Error("Invalid managed organization logo");
  await deliveryRequest(logo.fileName, "DELETE");
}
