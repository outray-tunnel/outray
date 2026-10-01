export type ShareContent =
  | { type: "text"; text: string }
  | { type: "bundle"; entries: Array<{ key: string; value: string }> };

export type EncryptedShare = {
  ciphertext: string;
  iv: string;
  verifier: string;
  key: string;
  passwordSalt?: string;
  passwordVerifier?: string;
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

const encoder = new TextEncoder();

function shareKeyParts(fragment: string): { keyBytes: Uint8Array; salt?: Uint8Array } {
  const parts = fragment.split(".");
  if (parts.length > 2) throw new Error("Invalid share link");
  const keyBytes = fromBase64url(parts[0]);
  const salt = parts[1] ? fromBase64url(parts[1]) : undefined;
  if (keyBytes.byteLength !== 32 || (salt && salt.byteLength !== 16)) throw new Error("Invalid share link");
  return { keyBytes, salt };
}

async function passwordMaterial(password: string, salt: Uint8Array): Promise<Uint8Array> {
  if (password.length < 8 || encoder.encode(password).byteLength > 256) {
    throw new Error("Use a password between 8 and 256 bytes.");
  }
  const imported = await crypto.subtle.importKey("raw", buffer(encoder.encode(password)), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: buffer(salt), iterations: 250_000 }, imported, 256));
}

async function mixedDigest(label: string, keyBytes: Uint8Array, material: Uint8Array): Promise<Uint8Array> {
  const labelBytes = encoder.encode(label);
  const input = new Uint8Array(labelBytes.length + keyBytes.length + material.length);
  input.set(labelBytes);
  input.set(keyBytes, labelBytes.length);
  input.set(material, labelBytes.length + keyBytes.length);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buffer(input)));
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

export async function encryptShare(content: ShareContent, password?: string): Promise<EncryptedShare> {
  const plaintext = validateShareContent(content);
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const salt = password ? crypto.getRandomValues(new Uint8Array(16)) : undefined;
  const material = salt ? await passwordMaterial(password!, salt) : undefined;
  const contentKey = material ? await mixedDigest("outray-share-content-v1", keyBytes, material) : keyBytes;
  const key = await crypto.subtle.importKey("raw", buffer(contentKey), "AES-GCM", false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: buffer(ivBytes) }, key, buffer(plaintext));
  const verifier = await crypto.subtle.digest("SHA-256", buffer(keyBytes));
  return {
    ciphertext: base64url(new Uint8Array(ciphertext)),
    iv: base64url(ivBytes),
    verifier: base64url(new Uint8Array(verifier)),
    key: base64url(keyBytes) + (salt ? `.${base64url(salt)}` : ""),
    ...(salt && material ? {
      passwordSalt: base64url(salt),
      passwordVerifier: base64url(await mixedDigest("outray-share-password-v1", keyBytes, material)),
    } : {}),
  };
}

export async function shareVerifier(key: string): Promise<string> {
  const { keyBytes } = shareKeyParts(key);
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer(keyBytes))));
}

export function shareNeedsPassword(fragment: string): boolean {
  return !!shareKeyParts(fragment).salt;
}

export async function sharePasswordVerifier(fragment: string, password: string): Promise<string> {
  const { keyBytes, salt } = shareKeyParts(fragment);
  if (!salt) throw new Error("This link does not require a password.");
  const material = await passwordMaterial(password, salt);
  return base64url(await mixedDigest("outray-share-password-v1", keyBytes, material));
}

export async function decryptShare(
  encrypted: Pick<EncryptedShare, "ciphertext" | "iv">,
  keyText: string,
  password?: string,
): Promise<ShareContent> {
  const { keyBytes, salt } = shareKeyParts(keyText);
  const iv = fromBase64url(encrypted.iv);
  if (iv.byteLength !== 12) throw new Error("Invalid share link");
  if (salt && !password) throw new Error("Enter the password to reveal this secret.");
  const material = salt ? await passwordMaterial(password!, salt) : undefined;
  const contentKey = material ? await mixedDigest("outray-share-content-v1", keyBytes, material) : keyBytes;
  const key = await crypto.subtle.importKey("raw", buffer(contentKey), "AES-GCM", false, ["decrypt"]);
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
