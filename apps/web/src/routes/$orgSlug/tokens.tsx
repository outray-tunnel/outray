import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { CreateTokenModal } from "@/components/create-token-modal";
import { Button } from "@/components/arc/button/button";
import { TokensContent } from "@/components/workspace/tokens-content";
import { WorkspaceDialog, WorkspaceNotice } from "@/components/workspace/workspace-ui";
import { maskedTokenPrefix, type TokenStatusFilter } from "@/components/workspace/tokens-data";
import { appClient, type AuthToken } from "@/lib/app-client";
import { usePermission } from "@/lib/auth-client";

export const Route = createFileRoute("/$orgSlug/tokens")({
  head: () => ({ meta: [{ title: "API Tokens - OutRay" }] }),
  component: TokensSettingsView,
});

function TokensSettingsView() {
  const { orgSlug } = Route.useParams();
  return <TokensSettingsController key={orgSlug} orgSlug={orgSlug} />;
}

function TokensSettingsController({ orgSlug }: { orgSlug: string }) {
  const queryClient = useQueryClient();
  const { data: canManage, isPending: permissionPending } = usePermission({ authToken: ["create", "delete"] });
  const [isCreating, setIsCreating] = useState(false);
  const [tokenToRevoke, setTokenToRevoke] = useState<AuthToken | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TokenStatusFilter>("all");
  const [now, setNow] = useState(() => Date.now());
  const revokePendingRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const tokensQuery = useQuery({
    queryKey: ["auth-tokens", orgSlug],
    queryFn: async () => {
      const response = await appClient.authTokens.list(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response.tokens;
    },
    enabled: !!orgSlug && canManage && !permissionPending,
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!canManage || permissionPending) throw new Error("Only workspace owners and admins can revoke API tokens.");
      const response = await appClient.authTokens.revoke({ id, orgSlug });
      if ("error" in response) throw new Error(response.error);
      if (!response.success) throw new Error("The token could not be revoked. Try again.");
    },
    onSuccess: (_, id) => {
      queryClient.setQueryData<AuthToken[]>(["auth-tokens", orgSlug], (tokens) => tokens?.map((token) => token.id === id ? { ...token, revokedAt: new Date().toISOString() } : token));
      void queryClient.invalidateQueries({ queryKey: ["auth-tokens", orgSlug] });
      setTokenToRevoke(null);
    },
  });

  const closeRevoke = () => {
    if (revokePendingRef.current) return;
    setTokenToRevoke(null);
    revokeMutation.reset();
  };

  const confirmRevoke = async () => {
    if (!tokenToRevoke || !canManage || permissionPending || revokePendingRef.current) return;
    revokePendingRef.current = true;
    try {
      await revokeMutation.mutateAsync(tokenToRevoke.id);
    } catch {
      // The mutation error stays in the open confirmation so it can be retried.
    } finally {
      revokePendingRef.current = false;
    }
  };

  return <>
    <TokensContent tokens={tokensQuery.data ?? null} loading={tokensQuery.isLoading} refreshing={tokensQuery.isFetching && !!tokensQuery.data} error={tokensQuery.error?.message ?? null}
      canManage={canManage} permissionPending={permissionPending} search={search} status={status} now={now} onSearchChange={setSearch} onStatusChange={setStatus}
      onCreate={() => { if (canManage && !permissionPending) setIsCreating(true); }}
      onRevoke={(token) => { if (!canManage || permissionPending || token.revokedAt) return; revokeMutation.reset(); setTokenToRevoke(token); }}
      onRetry={() => { if (canManage && !permissionPending) void tokensQuery.refetch(); }} />
    <CreateTokenModal isOpen={isCreating} onClose={() => setIsCreating(false)} orgSlug={orgSlug} />
    <WorkspaceDialog open={!!tokenToRevoke} onClose={closeRevoke} title="Revoke API token" description="This token will no longer authenticate new requests. Revocation cannot be undone." busy={revokeMutation.isPending} size="sm"
      footer={<><Button variant="ghost" size="sm" onClick={closeRevoke} disabled={revokeMutation.isPending}>Cancel</Button><Button variant="danger" size="sm" onClick={() => void confirmRevoke()} loading={revokeMutation.isPending} disabled={!canManage || permissionPending}>Revoke token</Button></>}>
      {tokenToRevoke ? <div className="flex min-w-0 items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-3"><KeyRound size={16} className="shrink-0 text-zinc-500" aria-hidden="true" /><div className="min-w-0"><p className="truncate text-[13px] text-zinc-200" title={tokenToRevoke.name}>{tokenToRevoke.name}</p><p className="mt-0.5 font-mono text-[11px] text-zinc-500">{maskedTokenPrefix(tokenToRevoke.prefix)}</p></div></div> : null}
      {revokeMutation.error ? <div className="mt-3"><WorkspaceNotice message={revokeMutation.error.message} /></div> : null}
      {!canManage && !permissionPending ? <div className="mt-3"><WorkspaceNotice message="Only workspace owners and admins can revoke API tokens." /></div> : null}
    </WorkspaceDialog>
  </>;
}
