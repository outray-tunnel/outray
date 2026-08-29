import { useState } from "react";
import {
  Globe,
  Info,
  Copy,
  Trash2,
  Check,
} from "lucide-react";
import { ConfirmModal } from "../confirm-modal";
import { Button, Badge } from "@/components/ui";

interface Domain {
  id: string;
  domain: string;
  status: "active" | "failed" | "pending";
  createdAt: string;
}

interface DomainCardProps {
  domain: Domain;
  onVerify: (id: string) => void;
  onDelete: (id: string) => void;
  isVerifying: boolean;
}

export function DomainCard({
  domain,
  onVerify,
  onDelete,
  isVerifying,
}: DomainCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive: boolean;
    confirmText: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    isDestructive: false,
    confirmText: "",
  });

  const handleCopy = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getRecordName = (domainName: string) => {
    const parts = domainName.split(".");
    if (parts.length <= 2) return "@";
    return parts.slice(0, parts.length - 2).join(".");
  };

  const cnameName = getRecordName(domain.domain);
  const cnameValue = "edge.outray.app";

  const txtName =
    cnameName === "@" ? "_outray-challenge" : `_outray-challenge.${cnameName}`;
  const txtValue = domain.id;

  return (
    <div className="group border-b border-white/[0.06] px-5 py-5 last:border-b-0 sm:px-6">
      {/* Header row with icon, domain info, and delete button */}
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.04] ring-1 ring-white/[0.06] sm:flex">
          <Globe className="h-4 w-4 text-zinc-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h3 className="break-all text-[13px] font-medium text-zinc-300">
              {domain.domain}
            </h3>
            {domain.status === "active" ? (
              <Badge variant="success" dot>
                Active
              </Badge>
            ) : domain.status === "failed" ? (
              <Badge variant="error" dot>
                Failed
              </Badge>
            ) : (
              <Badge variant="warning" dot>
                Pending DNS
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[10px] text-zinc-700">
            Added on {new Date(domain.createdAt).toLocaleDateString()}
          </p>
        </div>

        {/* Delete button - always visible on mobile, hover on desktop */}
        <button
          onClick={() => {
            setConfirmState({
              isOpen: true,
              title: "Delete Domain",
              message: "Are you sure you want to delete this domain?",
              onConfirm: () => onDelete(domain.id),
              isDestructive: true,
              confirmText: "Delete",
            });
          }}
          className="shrink-0 p-2 text-zinc-800 transition-all hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100"
          title="Remove domain"
        >
          <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>

      {/* DNS Configuration section - full width below header */}
      {domain.status !== "active" && (
        <div className="mt-5 border-t border-white/[0.06] pt-5">
          <div className="flex items-start gap-3 border-b border-white/[0.06] pb-4">
            <div className="shrink-0 text-zinc-600">
              <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
            </div>
            <div>
              <h4 className="mb-1 text-xs font-medium text-zinc-300">
                DNS Configuration
              </h4>
              <p className="text-[11px] leading-relaxed text-zinc-600">
                Add these records to your domain provider to verify ownership
                and route traffic.
              </p>
            </div>
          </div>

          <div className="space-y-5 py-4">
            {/* CNAME Record */}
            <div className="border-b border-white/[0.06] pb-5">
              <div className="p-3 space-y-3">
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-blue-400">
                  CNAME
                </span>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] py-2">
                    <div className="min-w-0">
                      <span className="text-[10px] text-white/40 uppercase block mb-0.5">
                        Name
                      </span>
                      <span className="font-mono text-white text-sm">
                        {cnameName}
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        handleCopy(cnameName, `cname-name-${domain.id}`)
                      }
                      className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors shrink-0"
                    >
                      {copiedField === `cname-name-${domain.id}` ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] py-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] text-white/40 uppercase block mb-0.5">
                        Value
                      </span>
                      <span className="font-mono text-white/80 text-sm block truncate">
                        {cnameValue}
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        handleCopy(cnameValue, `cname-value-${domain.id}`)
                      }
                      className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors shrink-0"
                    >
                      {copiedField === `cname-value-${domain.id}` ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* TXT Record */}
            <div>
              <div className="p-3 space-y-3">
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-accent">
                  TXT
                </span>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] py-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] text-white/40 uppercase block mb-0.5">
                        Name
                      </span>
                      <span className="font-mono text-white text-sm block truncate">
                        {txtName}
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        handleCopy(txtName, `txt-name-${domain.id}`)
                      }
                      className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors shrink-0"
                    >
                      {copiedField === `txt-name-${domain.id}` ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] py-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] text-white/40 uppercase block mb-0.5">
                        Value
                      </span>
                      <span className="font-mono text-white/80 text-sm block truncate">
                        {txtValue}
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        handleCopy(txtValue, `txt-value-${domain.id}`)
                      }
                      className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors shrink-0"
                    >
                      {copiedField === `txt-value-${domain.id}` ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-1">
            <Button
              onClick={() => onVerify(domain.id)}
              disabled={isVerifying}
              isLoading={isVerifying}
              className="w-full"
            >
              {isVerifying ? "Verifying..." : "Verify DNS Records"}
            </Button>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive={confirmState.isDestructive}
        confirmText={confirmState.confirmText}
      />
    </div>
  );
}
