import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { Modal, Button, IconButton } from "@/components/ui";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<unknown>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false,
}: ConfirmModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (isConfirming) return;
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (isConfirming) return;
    setIsConfirming(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not complete this action. Please try again.",
      );
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            </div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
          </div>
          <IconButton
            onClick={handleClose}
            disabled={isConfirming}
            icon={<X className="w-5 h-5" />}
            aria-label="Close"
          />
        </div>

        <p className="text-gray-400 text-sm leading-relaxed mb-6">{message}</p>

        {error && (
          <p role="alert" className="mb-4 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isConfirming}
            className="flex-1"
          >
            {cancelText}
          </Button>
          <Button
            variant={isDestructive ? "destructive" : "primary"}
            onClick={() => void handleConfirm()}
            isLoading={isConfirming}
            className="flex-1"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
