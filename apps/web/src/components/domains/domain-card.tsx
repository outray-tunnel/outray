import { useState } from "react";
import {
  Globe,
  CheckCircle,
  AlertCircle,
  Info,
  Copy,
  Trash2,
  Check,
} from "lucide-react";
import { ConfirmModal } from "../confirm-modal";
import { Button, IconButton, Badge } from "@/components/ui";

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
    <div className="group bg-white/2 border border-white/5 rounded-2xl p-4 sm:p-6 hover:border-white/10 transition-all">
      {/* Header row with icon, domain info, and delete button */}
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="hidden sm:flex w-10 h-10 rounded-full bg-white/5 items-center justify-center shrink-0">
          <Globe className="w-5 h-5 text-white/40" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h3 className="text-base sm:text-lg font-medium text-white break-all">
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
          <p className="text-xs sm:text-sm text-white/40 mt-1">
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
          className="p-2 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-500/10 text-white/40 sm:text-white/20 hover:text-red-400 rounded-lg transition-all shrink-0"
          title="Remove domain"
        >
          <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>

      {/* DNS Configuration section - full width below header */}
      {domain.status !== "active" && (
        <div className="mt-4 bg-black/20 rounded-xl border border-white/5 overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-white/5 flex items-start gap-3">
            <div className="p-1.5 sm:p-2 bg-blue-500/10 rounded-lg shrink-0">
              <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-medium text-white mb-1">
                DNS Configuration
              </h4>
              <p className="text-[11px] sm:text-xs text-white/60 leading-relaxed">
                Add these records to your domain provider to verify ownership
                and route traffic.
              </p>
            </div>
          </div>

          <div className="p-3 sm:p-4 space-y-3">
            {/* CNAME Record */}
            <div className="bg-white/5 rounded-lg border border-white/5 overflow-hidden">
              <div className="p-3 space-y-3">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-medium ring-1 ring-inset ring-blue-500/20">
                  CNAME
                </span>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 p-2 bg-black/20 rounded-lg">
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
                  <div className="flex items-center justify-between gap-2 p-2 bg-black/20 rounded-lg">
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
            <div className="bg-white/5 rounded-lg border border-white/5 overflow-hidden">
              <div className="p-3 space-y-3">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 text-xs font-medium ring-1 ring-inset ring-purple-500/20">
                  TXT
                </span>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 p-2 bg-black/20 rounded-lg">
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
                  <div className="flex items-center justify-between gap-2 p-2 bg-black/20 rounded-lg">
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

          <div className="px-3 sm:px-4 pb-3 sm:pb-4">
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
