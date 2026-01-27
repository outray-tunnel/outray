import { X, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAppStore } from "@/lib/store";
import { Modal, Button, IconButton } from "@/components/ui";

interface LimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  limit: number;
  currentPlan: string;
  resourceName: string;
}

export function LimitModal({
  isOpen,
  onClose,
  title,
  description,
  limit,
  currentPlan,
  resourceName,
}: LimitModalProps) {
  const { selectedOrganization } = useAppStore();
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            </div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
          </div>
          <IconButton
            onClick={onClose}
            icon={<X className="w-5 h-5" />}
            aria-label="Close"
          />
        </div>

        <div className="space-y-4">
          <p className="text-gray-400 text-sm leading-relaxed">{description}</p>

          <div className="bg-white/5 rounded-xl p-4 border border-white/5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-400">Current Plan</span>
              <span className="text-sm font-medium text-white capitalize">
                {currentPlan}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">{resourceName} Limit</span>
              <span className="text-sm font-medium text-white">{limit}</span>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Link
              to="/$orgSlug/billing"
              params={{ orgSlug: selectedOrganization?.slug! }}
              className="flex-1"
            >
              <Button variant="primary" fullWidth>
                Upgrade Plan
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Modal>
  );
}
