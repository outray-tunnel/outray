import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermission } from "@/lib/auth-client";
import { secretsClient, type SecretTrashItem } from "@/lib/secrets-client";
import { SecretsTrashContent } from "@/components/secrets/trash-content";
import { TrashRestoreDialog } from "@/components/secrets/trash-restore-dialog";
import type { TrashView } from "@/components/secrets/trash-data";

export const Route = createFileRoute("/$orgSlug/secrets/trash")({
  head: () => ({ meta: [{ title: "Trash - OutRay Secrets" }] }),
  component: TrashPage,
});

function TrashPage() {
  const { orgSlug } = Route.useParams();
  return <WorkspaceTrashPage key={orgSlug} orgSlug={orgSlug} />;
}

export function WorkspaceTrashPage({ orgSlug }: { orgSlug: string }) {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { data: canRestore, isPending: permissionPending } = usePermission({ secretTrash: ["restore"] });
  const queryKey = ["secrets", orgSlug, "trash"];
  // Members may read Trash even when they cannot restore its contents.
  const query = useQuery({ queryKey, queryFn: () => secretsClient.trash(orgSlug), staleTime: 15_000 });
  const [search, setSearch] = useState("");
  const [view, setView] = useState<TrashView>("all");
  const [restoring, setRestoring] = useState<SecretTrashItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const restore = async (confirmed: boolean) => {
    if (!restoring || pending.current || !canRestore || permissionPending) return;
    const item = restoring;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await secretsClient.restoreTrash(orgSlug, item, confirmed);
      if (!mounted.current) return;
      // Prevent an in-flight pre-restore response from putting the item back.
      await queryClient.cancelQueries({ queryKey });
      if (!mounted.current) return;
      queryClient.setQueryData<SecretTrashItem[]>(queryKey, (items) => items?.filter((record) => record.batchId !== item.batchId));
      setRestoring(null);
      setNotice(item.type === "bulk" && item.metadata?.reason === "move"
        ? "Source secrets restored. Destination values are unchanged."
        : `Restored “${item.name}” to its original location.`);
      void query.refetch();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Could not restore this item. Try again.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <>
    <SecretsTrashContent items={query.data} loading={query.isPending} refreshing={query.isFetching && Boolean(query.data)} error={query.error?.message}
      canRestore={Boolean(canRestore)} permissionPending={permissionPending} search={search} view={view} onSearchChange={setSearch} onViewChange={setView}
      onClearFilters={() => { setSearch(""); setView("all"); }} onRetry={() => { void query.refetch(); }}
      onChooseVaults={() => void navigate({ to: "/$orgSlug/secrets/vaults", params: { orgSlug } })}
      onRestore={(item) => { if (canRestore && !permissionPending && !pending.current) { setError(null); setNotice(null); setRestoring(item); } }}
      notice={notice} onDismissNotice={() => setNotice(null)} />
    <TrashRestoreDialog key={restoring?.batchId ?? "closed"} item={restoring} loading={busy} error={error}
      onClose={() => { if (!pending.current) { setRestoring(null); setError(null); } }} onConfirm={(confirmed) => void restore(confirmed)} />
  </>;
}
