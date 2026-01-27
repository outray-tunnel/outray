import { createFileRoute } from "@tanstack/react-router";
import { Key, Plus, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { CreateTokenModal } from "@/components/create-token-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { appClient } from "@/lib/app-client";
import { Card, CardHeader, CardContent, Button, IconButton } from "@/components/ui";

export const Route = createFileRoute("/$orgSlug/tokens")({
  head: () => ({
    meta: [
      { title: "API Tokens - OutRay" },
    ],
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
    <div className="space-y-6">
      <Card padding={false}>
        <CardHeader
          icon={<Key className="w-5 h-5" />}
          iconClassName="bg-yellow-500/10 text-yellow-400"
          title="API Tokens"
          description="Manage access tokens for the CLI and API"
          action={
            <Button
              onClick={() => setIsCreating(true)}
              leftIcon={<Plus size={16} />}
              size="sm"
            >
              <span className="hidden sm:inline">New Token</span>
            </Button>
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

        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-white/20" />
            </div>
          ) : tokens?.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No API tokens found. Generate one to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {tokens?.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between p-4 bg-white/2 border border-white/5 rounded-xl hover:border-white/10 transition-colors"
                >
                  <div>
                    <h4 className="text-white font-medium">{token.name}</h4>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span>
                        Created{" "}
                        {formatDistanceToNow(new Date(token.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                      <span>•</span>
                      <span>
                        {token.lastUsedAt
                          ? `Last used ${formatDistanceToNow(
                              new Date(token.lastUsedAt),
                              { addSuffix: true },
                            )}`
                          : "Never used"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="font-mono text-xs text-gray-600">
                      outray_...
                    </div>
                    <IconButton
                      onClick={() => setTokenToDelete(token.id)}
                      disabled={deleteMutation.isPending}
                      isLoading={deleteMutation.isPending && tokenToDelete === token.id}
                      icon={<Trash2 size={18} />}
                      variant="destructive"
                      aria-label="Delete token"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
