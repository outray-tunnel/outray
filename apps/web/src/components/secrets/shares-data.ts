import type { SecretShareRecord } from "@/lib/secrets-client";

export type SharesView = "all" | "active" | "ended";
export type ShareStatus = "active" | "revoked" | "expired" | "exhausted";

export function shareStatus(share: SecretShareRecord, now: number): ShareStatus {
  if (share.revokedAt) return "revoked";
  const expiry = new Date(share.expiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry <= now) return "expired";
  if (share.views >= share.maxViews) return "exhausted";
  return "active";
}

export function remainingReveals(share: SecretShareRecord): number {
  return Math.max(0, Math.min(share.maxViews, share.maxViews - share.views));
}

export function filterShares(shares: SecretShareRecord[], search: string, view: SharesView, now: number): SecretShareRecord[] {
  const query = search.trim().toLowerCase();
  return shares.filter((share) => {
    const active = shareStatus(share, now) === "active";
    if (view === "active" && !active || view === "ended" && active) return false;
    return !query || share.id.toLowerCase().includes(query) || share.keyNames.some((key) => key.toLowerCase().includes(query));
  });
}
