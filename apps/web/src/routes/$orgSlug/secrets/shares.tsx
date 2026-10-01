import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import LinkSquare01Icon from "@hugeicons-pro/core-stroke-rounded/LinkSquare01Icon";
import { usePermission } from "@/lib/auth-client";
import { secretsClient, type SecretShareRecord } from "@/lib/secrets-client";
import { ConfirmSecretActionDialog } from "@/components/secrets/secret-dialogs";
import { useSecretsResource } from "@/components/secrets/use-secrets-resource";
import { SecretsButton, SecretsEmptyState, SecretsHeader, SecretsNotice, SecretsPage, SecretsSkeleton } from "@/components/secrets/secrets-ui";

export const Route = createFileRoute("/$orgSlug/secrets/shares")({
  head: () => ({ meta: [{ title: "Shares - OutRay Secrets" }] }),
  component: SharesPage,
});

function shareState(share: SecretShareRecord): { label: string; className: string } {
  if (share.revokedAt) return { label: "Revoked", className: "text-zinc-500" };
  if (new Date(share.expiresAt).getTime() <= Date.now()) return { label: "Expired", className: "text-zinc-500" };
  if (share.views >= share.maxViews) return { label: "Used up", className: "text-zinc-500" };
  return { label: "Active", className: "text-emerald-400" };
}

function SharesPage() {
  const { orgSlug } = Route.useParams();
  const { data: canManage, isPending } = usePermission({ secretShare: ["create"] });
  const resource = useSecretsResource(() => canManage ? secretsClient.shares(orgSlug) : Promise.resolve([]), [orgSlug, canManage]);
  const [revoking, setRevoking] = useState<SecretShareRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    setError(null);
    try {
      await secretsClient.revokeShare(orgSlug, revoking.id);
      setRevoking(null);
      resource.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke this share.");
    } finally {
      setBusy(false);
    }
  };

  return <SecretsPage>
    <SecretsHeader title="Shares" description="Links created from this organization. The complete viewing link is shown only once, at creation." />
    {error && <SecretsNotice message={error} onDismiss={() => setError(null)} />}
    {isPending || resource.loading && !resource.data ? <SecretsSkeleton rows={4} cards={0} /> : !canManage ?
      <SecretsEmptyState icon={LinkSquare01Icon} title="Shares are managed by admins" description="Ask an organization owner or admin to create or revoke secret shares." /> :
      resource.error && !resource.data ? <SecretsEmptyState icon={LinkSquare01Icon} title="Could not load shares" description={resource.error} action={<SecretsButton onClick={resource.reload}>Try again</SecretsButton>} /> :
      (resource.data || []).length === 0 ? <SecretsEmptyState icon={LinkSquare01Icon} title="No shares yet" description="Select secrets in a vault environment and choose Share to create an encrypted link." action={<Link to="/$orgSlug/secrets/vaults" params={{ orgSlug }}><SecretsButton>Go to vaults</SecretsButton></Link>} /> :
      <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
        {(resource.data || []).map((share) => {
          const state = shareState(share);
          return <div key={share.id} className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-zinc-500"><HugeiconsIcon icon={LinkSquare01Icon} size={16} /></span>
              <div className="min-w-0"><p className="truncate text-[13px] font-medium text-zinc-200">{share.keyNames.join(", ")}</p>
                <p className="mt-1 text-xs text-zinc-500">Created {new Date(share.createdAt).toLocaleDateString()} · Expires {new Date(share.expiresAt).toLocaleDateString()} · {Math.max(0, share.maxViews - share.views)} of {share.maxViews} reveals left</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3 pl-11 sm:pl-0"><span className={`text-xs ${state.className}`}>{state.label}</span>
              {state.label === "Active" && <SecretsButton className="h-9 px-3" tone="danger" onClick={() => setRevoking(share)}>Revoke</SecretsButton>}
            </div>
          </div>;
        })}
      </div>}
    <ConfirmSecretActionDialog open={!!revoking} onClose={() => setRevoking(null)} title="Revoke share?"
      description="This link will stop revealing content immediately. You cannot restore it."
      confirmLabel="Revoke share" danger loading={busy} onConfirm={() => void revoke()} />
  </SecretsPage>;
}
