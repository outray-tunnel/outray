import { X, Key, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { appClient } from "@/lib/app-client";
import { Modal, ModalHeader, ModalContent, Button, Input, Label, IconButton } from "@/components/ui";

interface CreateTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateTokenModal({ isOpen, onClose }: CreateTokenModalProps) {
  const queryClient = useQueryClient();
  const [newTokenName, setNewTokenName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const { orgSlug } = useParams({ from: "/$orgSlug/tokens" });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await appClient.authTokens.create({
        name,
        orgSlug,
      });

      if ("error" in response) {
        throw new Error(response.error);
      }

      return response.token;
    },
    onSuccess: (token) => {
      if (token) {
        setCreatedToken(token);
      }
      setNewTokenName("");
      queryClient.invalidateQueries({
        queryKey: ["auth-tokens", orgSlug],
      });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim()) return;
    createMutation.mutate(newTokenName);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleClose = () => {
    setCreatedToken(null);
    setNewTokenName("");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <ModalHeader
        icon={<Key size={20} />}
        iconClassName="bg-yellow-500/10 text-yellow-500"
        title="Generate API Token"
        description="Create a new token for CLI access"
        onClose={handleClose}
      />

      <ModalContent>
        {!createdToken ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label>Token Name</Label>
              <Input
                type="text"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder="e.g. CI/CD Pipeline"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" type="button" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || !newTokenName.trim()}
                isLoading={createMutation.isPending}
              >
                Generate Token
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
              <div className="p-1 bg-green-500/20 rounded-full shrink-0 mt-0.5">
                <Check className="w-4 h-4 text-green-500" />
              </div>
              <div>
                <h4 className="text-green-500 font-medium text-sm">
                  Token Generated Successfully
                </h4>
                <p className="text-xs text-green-500/80 mt-1">
                  Make sure to copy your token now. You won't be able to see it
                  again!
                </p>
              </div>
            </div>

            <div>
              <Label>Your API Token</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white break-all">
                  {createdToken}
                </code>
                <IconButton
                  onClick={() => copyToClipboard(createdToken)}
                  icon={
                    copiedToken ? (
                      <Check size={18} className="text-green-500" />
                    ) : (
                      <Copy size={18} />
                    )
                  }
                  variant="secondary"
                  size="lg"
                  aria-label="Copy token"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
}
