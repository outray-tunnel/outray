export type ShareContent =
  | { type: "text"; text: string }
  | { type: "bundle"; entries: Array<{ key: string; value: string }> };

export type EncryptedShare = {
  ciphertext: string;
  iv: string;
  verifier: string;
  key: string;
};

export const MAX_SHARE_BYTES = 256 * 1024;
export const MAX_SHARE_ENTRIES = 50;

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid share link");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function buffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

export function validateShareContent(content: ShareContent): Uint8Array {
  if (content.type === "text") {
    if (typeof content.text !== "string" || !content.text.trim()) {
      throw new Error("Enter something to share.");
    }
  } else if (content.type === "bundle") {
    if (!Array.isArray(content.entries) || content.entries.length < 1 || content.entries.length > MAX_SHARE_ENTRIES) {
      throw new Error(`Choose between 1 and ${MAX_SHARE_ENTRIES} secrets.`);
    }
    const keys = new Set<string>();
    for (const entry of content.entries) {
      if (!entry || typeof entry.key !== "string" || !entry.key.trim() || typeof entry.value !== "string") {
        throw new Error("Every secret needs a name and value.");
      }
      if (keys.has(entry.key)) throw new Error("Secret names must be unique.");
      keys.add(entry.key);
    }
  } else {
    throw new Error("Invalid share content.");
  }
  const bytes = new TextEncoder().encode(JSON.stringify(content));
  if (bytes.byteLength > MAX_SHARE_BYTES) throw new Error("This share exceeds 256 KiB.");
  return bytes;
}

export async function encryptShare(content: ShareContent): Promise<EncryptedShare> {
  const plaintext = validateShareContent(content);
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", buffer(keyBytes), "AES-GCM", false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: buffer(ivBytes) }, key, buffer(plaintext));
  const verifier = await crypto.subtle.digest("SHA-256", buffer(keyBytes));
  return {
    ciphertext: base64url(new Uint8Array(ciphertext)),
    iv: base64url(ivBytes),
    verifier: base64url(new Uint8Array(verifier)),
    key: base64url(keyBytes),
  };
}

export async function shareVerifier(key: string): Promise<string> {
  const keyBytes = fromBase64url(key);
  if (keyBytes.byteLength !== 32) throw new Error("Invalid share link");
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer(keyBytes))));
}

export async function decryptShare(
  encrypted: Pick<EncryptedShare, "ciphertext" | "iv">,
  keyText: string,
): Promise<ShareContent> {
  const keyBytes = fromBase64url(keyText);
  const iv = fromBase64url(encrypted.iv);
  if (keyBytes.byteLength !== 32 || iv.byteLength !== 12) throw new Error("Invalid share link");
  const key = await crypto.subtle.importKey("raw", buffer(keyBytes), "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buffer(iv) },
    key,
    buffer(fromBase64url(encrypted.ciphertext)),
  );
  const content = JSON.parse(new TextDecoder().decode(plaintext)) as ShareContent;
  validateShareContent(content);
  return content;
}

export function completeShareUrl(origin: string, id: string, key: string): string {
  const url = new URL(`/${id}`, origin);
  url.hash = key;
  return url.toString();
}
