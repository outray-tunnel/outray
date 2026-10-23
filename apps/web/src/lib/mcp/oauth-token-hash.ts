import { createHash } from "node:crypto";

/** Shared with the OAuth provider; only one-way digests reach storage. */
export function hashMcpOAuthToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}
