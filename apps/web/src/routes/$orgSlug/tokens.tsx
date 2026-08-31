import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  Key01Icon,
  Loading03Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import { CreateTokenModal } from "@/components/create-token-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { appClient } from "@/lib/app-client";
import type { AuthToken } from "@/lib/app-client";
import { WorkspacePageHeader } from "@/components/workspace-page-header";

export const Route = createFileRoute("/$orgSlug/tokens")({
  head: () => ({
    meta: [{ title: "API Tokens - OutRay" }],
  }),
  component: TokensSettingsView,
});

function TokensSettingsView() {
  const { orgSlug } = Route.useParams();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState<string | null>(null);

  const { data: tokens, isLoading, error } = useQuery({
    queryKey: ["auth-tokens", orgSlug],
    queryFn: async () => {
      if (!orgSlug) return [];
      const response = await appClient.authTokens.list(orgSlug);
      if ("error" in response) {
        throw new Error(response.error);
      }
      return response.tokens as AuthToken[];
    },
    enabled: !!orgSlug,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!orgSlug) throw new Error("No active organization");
      const response = await appClient.authTokens.delete({ id, orgSlug });
      if ("error" in response) {
        throw new Error(response.error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["auth-tokens", orgSlug],
      });
      setTokenToDelete(null);
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <WorkspacePageHeader
        title="API tokens"
        description="Create credentials for the OutRay CLI and API."
        action={
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
          >
            <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.9} />
            <span className="hidden sm:inline">New token</span>
          </button>
        }
      />

      <CreateTokenModal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
      />

      <ConfirmModal
        isOpen={!!tokenToDelete}
        onClose={() => setTokenToDelete(null)}
        onConfirm={() => {
          if (tokenToDelete) {
            deleteMutation.mutate(tokenToDelete);
          }
        }}
        title="Revoke API token"
        message="This immediately stops every tunnel, deployment, and Secrets client using this credential. It cannot be made active again."
        confirmText="Revoke token"
        isDestructive
      />

      <section className="overflow-hidden rounded-2xl border border-white/[0.08]">
        <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(180px,1fr)_130px_130px_40px] gap-5 border-b border-white/[0.08] px-6 py-3.5 text-[13px] font-medium uppercase tracking-[0.08em] text-zinc-600 lg:grid">
          <span>Token</span>
          <span>Access</span>
          <span>Expires</span>
          <span>Last used</span>
          <span />
        </div>

        {isLoading ? (
          <div className="divide-y divide-white/[0.07]" aria-busy="true">
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="grid animate-pulse gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(180px,1fr)_130px_130px_40px] lg:items-center lg:gap-5"
              >
                <div className="flex items-center gap-3">
                  <div className="size-9 shrink-0 rounded-lg bg-white/[0.05]" />
                  <div className="min-w-0 flex-1">
                    <div className="h-3 w-32 rounded bg-white/[0.07]" />
                    <div className="mt-2 h-2.5 w-24 rounded bg-white/[0.04]" />
                  </div>
                </div>
                <div className="h-7 w-40 rounded-lg bg-white/[0.04]" />
                <div className="h-2.5 w-20 rounded bg-white/[0.04]" />
                <div className="h-2.5 w-14 rounded bg-white/[0.04]" />
                <div className="size-8 rounded-lg bg-white/[0.035]" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
            <HugeiconsIcon
              icon={Key01Icon}
              size={27}
              strokeWidth={1.5}
              className="mb-4 text-zinc-700"
            />
            <h3 className="text-sm font-medium text-zinc-300">
              Token management is restricted
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-600">
              {error.message}
            </p>
          </div>
        ) : tokens?.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center py-12 text-center">
            <HugeiconsIcon
              icon={Key01Icon}
              size={27}
              strokeWidth={1.5}
              className="mb-4 text-zinc-700"
            />
            <h3 className="text-sm font-medium text-zinc-300">No API tokens</h3>
            <p className="mt-2 max-w-sm text-sm text-zinc-700">
              Create a scoped credential for tunnels, Secrets, or automation.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.07]">
            {tokens?.map((token) => (
              <div
                key={token.id}
                className="grid gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(180px,1fr)_130px_130px_40px] lg:items-center lg:gap-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.035] text-zinc-600">
                    <HugeiconsIcon
                      icon={Key01Icon}
                      size={14}
                      strokeWidth={1.7}
                    />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-zinc-300">
                      {token.name}
                    </h3>
                    <p className="mt-1 font-mono text-[13px] text-zinc-600">
                      {token.prefix}••••••••
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-[13px] font-medium text-zinc-500">
                    {token.environmentId
                      ? "Environment"
                      : token.projectId
                        ? "Project"
                        : "Organization"}
                  </span>
                  {token.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-[13px] text-zinc-600"
                    >
                      {scope.replace("tunnel:", "").replace("secrets:", "")}
                    </span>
                  ))}
                </div>
                <p className="text-[13px] text-zinc-600">
                  <span className="mr-2 text-zinc-700 lg:hidden">Expires</span>
                  {token.revokedAt
                    ? "Revoked"
                    : token.expiresAt
                      ? formatDistanceToNow(new Date(token.expiresAt), {
                          addSuffix: true,
                        })
                      : "Never"}
                </p>
                <p className="text-[13px] text-zinc-600">
                  <span className="mr-2 text-zinc-700 lg:hidden">
                    Last used
                  </span>
                  {token.lastUsedAt
                    ? formatDistanceToNow(new Date(token.lastUsedAt), {
                        addSuffix: true,
                      })
                    : "Never"}
                </p>
                <button
                  type="button"
                  onClick={() => setTokenToDelete(token.id)}
                  disabled={deleteMutation.isPending || !!token.revokedAt}
                  className="flex size-9 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-red-500/[0.08] hover:text-red-400 disabled:opacity-30"
                  aria-label={`Revoke ${token.name}`}
                >
                  <HugeiconsIcon
                    icon={
                      deleteMutation.isPending && tokenToDelete === token.id
                        ? Loading03Icon
                        : Delete02Icon
                    }
                    size={14}
                    strokeWidth={1.7}
                    className={
                      deleteMutation.isPending && tokenToDelete === token.id
                        ? "animate-spin"
                        : undefined
                    }
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
