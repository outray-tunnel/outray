import { encryptShare, completeShareUrl } from "@outray/share-crypto";
import { requireSecretsAdmin } from "../secrets/access";
import { snapshotSecrets, createOrganizationShare } from "../secrets/shares";
import { withMcpRequestActor, type McpRequestActor } from "./request-actor";
import { mcpOrigin } from "./config";
import { McpAccessError } from "./policy";
import type { McpArguments } from "./catalog";

export async function createMcpSecretShare(actor: McpRequestActor, args: McpArguments) {
  if (actor.catalog !== "direct") throw new McpAccessError("FORBIDDEN", 403, "Secret shares require a direct connection");
  let origin: URL;
  try { origin = new URL(process.env.SHARE_PUBLIC_URL || process.env.VITE_SHARE_PUBLIC_ORIGIN || ""); }
  catch { throw new McpAccessError("UNAVAILABLE", 503, "Secret sharing is not configured"); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new McpAccessError("UNAVAILABLE", 503, "Secret sharing is not configured");
  }
  const request = new Request(`${mcpOrigin()}/api/${encodeURIComponent(String(args.orgSlug))}/secrets/shares`, { method: "POST" });
  return withMcpRequestActor(request, actor, async () => {
    const access = await requireSecretsAdmin(request, String(args.orgSlug));
    const snapshot = await snapshotSecrets(access, String(args.vaultSlug), String(args.environmentSlug), args);
    const encrypted = await encryptShare({ type: "bundle", entries: snapshot.secrets.map(({ key, value }) => ({ key, value })) });
    const share = await createOrganizationShare(access, String(args.vaultSlug), String(args.environmentSlug), {
      ...args, ciphertext: encrypted.ciphertext, iv: encrypted.iv, verifier: encrypted.verifier,
      versions: snapshot.secrets.map((secret) => secret.version),
    });
    return { ...share, url: completeShareUrl(origin.origin, share.id, encrypted.key) };
  });
}
