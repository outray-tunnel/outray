import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import Delete02Icon from "@hugeicons-pro/core-stroke-rounded/Delete02Icon";
import { usePermission } from "@/lib/auth-client";
import { secretsClient, type SecretTrashItem } from "@/lib/secrets-client";
import { ConfirmSecretActionDialog } from "@/components/secrets/secret-dialogs";
import { useSecretsResource } from "@/components/secrets/use-secrets-resource";
import { SecretsButton, SecretsEmptyState, SecretsHeader, SecretsNotice, SecretsPage, SecretsSkeleton } from "@/components/secrets/secrets-ui";

export const Route = createFileRoute("/$orgSlug/secrets/trash")({
  head: () => ({ meta: [{ title: "Trash - OutRay Secrets" }] }),
  component: TrashPage,
});

function TrashPage() {
  const { orgSlug } = Route.useParams();
  const { data: canRestore } = usePermission({ secretTrash: ["restore"] });
  const resource = useSecretsResource(() => secretsClient.trash(orgSlug), [orgSlug]);
  const [restoring, setRestoring] = useState<SecretTrashItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restore = async (confirmed: boolean) => {
    if (!restoring) return;
    setBusy(true);
    setError(null);
    try {
      await secretsClient.restoreTrash(orgSlug, restoring, confirmed);
      setRestoring(null);
      resource.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restore this batch.");
    } finally {
      setBusy(false);
    }
  };

  return <SecretsPage>
    <SecretsHeader title="Trash" description="Deleted secrets are grouped into recoverable batches. Restoring a move batch returns its original source values; destination changes remain." />
    {error && <SecretsNotice message={error} onDismiss={() => setError(null)} />}
    {resource.loading && !resource.data ? <SecretsSkeleton rows={4} cards={0} /> :
      resource.error && !resource.data ? <SecretsEmptyState icon={Delete02Icon} title="Trash could not be loaded" description={resource.error} action={<SecretsButton onClick={resource.reload}>Try again</SecretsButton>} /> :
      (resource.data || []).length === 0 ? <SecretsEmptyState icon={Delete02Icon} title="Trash is empty" description="Deleted secrets and vaults will appear here while they can still be restored." /> :
      <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
        {(resource.data || []).map((item) => <div key={item.batchId} className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="truncate text-[13px] text-zinc-200">{item.name}</p>
            <p className="mt-1 text-xs text-zinc-500">{item.type === "bulk" ? "Batch" : item.type} · {item.itemCount} {item.itemCount === 1 ? "item" : "items"} · Deleted {new Date(item.deletedAt).toLocaleDateString()} · Expires {new Date(item.expiresAt).toLocaleDateString()}</p>
          </div>
          {canRestore && <SecretsButton className="h-9 shrink-0 px-3" onClick={() => setRestoring(item)}>Restore</SecretsButton>}
        </div>)}
      </div>}
    <ConfirmSecretActionDialog open={!!restoring} onClose={() => setRestoring(null)} title="Restore from Trash?"
      description="Restore the selected item or batch. If keys now conflict, no changes will be made."
      confirmLabel="Restore" confirmationText={restoring?.name} production={restoring?.isProduction}
      loading={busy} onConfirm={(confirmed) => void restore(confirmed)} />
  </SecretsPage>;
}
