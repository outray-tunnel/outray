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
import { WorkspacePageHeader } from "@/components/workspace-page-header";

export const Route = createFileRoute("/$orgSlug/tokens")({
  head: () => ({
    meta: [{ title: "API Tokens - OutRay" }],
  }),
  component: TokensSettingsView,
});

interface AuthToken {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
  token?: string; // Only present when just created
}

function TokensSettingsView() {
  const { orgSlug } = Route.useParams();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState<string | null>(null);

  const { data: tokens, isLoading } = useQuery({
    queryKey: ["auth-tokens", orgSlug],
    queryFn: async () => {
      if (!orgSlug) return [];
      const response = await appClient.authTokens.list(orgSlug);
      if ("error" in response) {
        throw new Error(response.error);
      }
      return response.tokens.map((token) => ({
        ...token,
        createdAt: token.createdAt.toString(),
        lastUsedAt: token.lastUsedAt ? token.lastUsedAt.toString() : null,
      })) as AuthToken[];
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
            className="flex h-9 shrink-0 items-center gap-2 rounded-md bg-white px-3.5 text-[12px] font-medium text-black transition-colors hover:bg-zinc-200"
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
        title="Delete API Token"
        message="Are you sure you want to delete this token? This action cannot be undone and any applications using this token will stop working."
        confirmText="Delete Token"
        isDestructive
      />

      <section className="rounded-xl border border-white/[0.07]">
        <div className="hidden grid-cols-[minmax(0,1fr)_160px_120px_32px] gap-4 border-b border-white/[0.07] px-5 py-3 text-[9px] font-medium uppercase tracking-[0.1em] text-zinc-700 sm:px-6 md:grid">
          <span>Token</span>
          <span>Created</span>
          <span>Last used</span>
          <span />
        </div>

        {isLoading ? (
          <div className="divide-y divide-white/[0.07]" aria-busy="true">
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="grid animate-pulse gap-3 px-5 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_160px_120px_32px] md:items-center md:gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="size-9 shrink-0 rounded-lg bg-white/[0.05]" />
                  <div className="min-w-0 flex-1">
                    <div className="h-3 w-32 rounded bg-white/[0.07]" />
                    <div className="mt-2 h-2.5 w-24 rounded bg-white/[0.04]" />
                  </div>
                </div>
                <div className="h-2.5 w-20 rounded bg-white/[0.04]" />
                <div className="h-2.5 w-14 rounded bg-white/[0.04]" />
                <div className="size-8 rounded-lg bg-white/[0.035]" />
              </div>
            ))}
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
            <p className="mt-2 max-w-sm text-xs text-zinc-700">
              Create a token to authenticate the CLI or your own integrations.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.07]">
            {tokens?.map((token) => (
              <div
                key={token.id}
                className="grid gap-3 px-5 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_160px_120px_32px] md:items-center md:gap-4"
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
                    <h3 className="truncate text-xs font-medium text-zinc-300">
                      {token.name}
                    </h3>
                    <p className="mt-1 font-mono text-[10px] text-zinc-700">
                      outray_••••••••
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-600">
                  <span className="mr-2 text-zinc-700 md:hidden">Created</span>
                  {formatDistanceToNow(new Date(token.createdAt), {
                    addSuffix: true,
                  })}
                </p>
                <p className="text-[11px] text-zinc-600">
                  <span className="mr-2 text-zinc-700 md:hidden">
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
                  disabled={deleteMutation.isPending}
                  className="flex size-8 items-center justify-center rounded-md text-zinc-700 transition-colors hover:bg-red-500/[0.08] hover:text-red-400 disabled:opacity-40"
                  aria-label={`Delete ${token.name}`}
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
