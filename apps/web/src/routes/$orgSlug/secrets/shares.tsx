import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermission } from "@/lib/auth-client";
import { secretsClient, type SecretShareRecord } from "@/lib/secrets-client";
import { ConfirmSecretActionDialog } from "@/components/secrets/secret-dialogs";
import { SecretsSharesContent } from "@/components/secrets/shares-content";
import type { SharesView } from "@/components/secrets/shares-data";

export const Route = createFileRoute("/$orgSlug/secrets/shares")({
  head: () => ({ meta: [{ title: "Shares - OutRay Secrets" }] }),
  component: SharesPage,
});

function SharesPage() {
  const { orgSlug } = Route.useParams();
  return <WorkspaceSharesPage key={orgSlug} orgSlug={orgSlug} />;
}

export function WorkspaceSharesPage({ orgSlug }: { orgSlug: string }) {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { data: canManage, isPending: permissionPending } = usePermission({ secretShare: ["create"] });
  const queryKey = ["secrets", orgSlug, "shares"];
  const query = useQuery({
    queryKey,
    queryFn: () => secretsClient.shares(orgSlug),
    enabled: !permissionPending && Boolean(canManage),
    staleTime: 15_000,
  });
  const [search, setSearch] = useState("");
  const [view, setView] = useState<SharesView>("all");
  const [now, setNow] = useState(Date.now);
  const [revoking, setRevoking] = useState<SecretShareRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const tick = () => { if (!document.hidden) setNow(Date.now()); };
    const timer = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const revoke = async () => {
    if (!revoking || pending.current || !canManage) return;
    const share = revoking;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await secretsClient.revokeShare(orgSlug, share.id);
      if (!mounted.current) return;
      // A pre-revocation refresh must not overwrite the confirmed result.
      await queryClient.cancelQueries({ queryKey });
      if (!mounted.current) return;
      queryClient.setQueryData<SecretShareRecord[]>(queryKey, (shares) => shares?.map((record) => record.id === share.id ? { ...record, revokedAt: new Date().toISOString() } : record));
      setRevoking(null);
      setNotice("Share revoked. The link can no longer reveal secrets.");
      void query.refetch();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Could not revoke this share.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <>
    <SecretsSharesContent shares={query.data} loading={query.isPending} refreshing={query.isFetching && Boolean(query.data)}
      permissionPending={permissionPending} canManage={Boolean(canManage)} now={now} error={query.error?.message}
      search={search} view={view} onSearchChange={setSearch} onViewChange={setView}
      onClearFilters={() => { setSearch(""); setView("all"); }}
      onChooseSecrets={() => void navigate({ to: "/$orgSlug/secrets/vaults", params: { orgSlug } })}
      onRetry={() => { setNow(Date.now()); void query.refetch(); }}
      onRevoke={(share) => { setError(null); setNotice(null); setRevoking(share); }}
      notice={notice} onDismissNotice={() => setNotice(null)} />
    <ConfirmSecretActionDialog open={Boolean(revoking)} onClose={() => { if (!pending.current) { setRevoking(null); setError(null); } }} title="Revoke share?"
      description={`Stop access to ${revoking?.keyNames.length === 1 ? "this secret" : "these secrets"} through this link. Revocation is immediate and cannot be undone.`}
      confirmLabel="Revoke share" danger loading={busy} error={error} onConfirm={() => void revoke()} />
  </>;
}
