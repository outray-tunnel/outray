import { X, AlertCircle } from "lucide-react";
import { Modal, Button, IconButton } from "@/components/ui";

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: "error" | "info" | "success";
}

export function AlertModal({
  isOpen,
  onClose,
  title,
  message,
  type = "error",
}: AlertModalProps) {
  const colors = {
    error: "text-red-500 bg-red-500/10 border-red-500/20",
    info: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    success: "text-green-500 bg-green-500/10 border-green-500/20",
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border ${colors[type]}`}
            >
              <AlertCircle
                className={`w-5 h-5 ${colors[type].split(" ")[0]}`}
              />
            </div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
          </div>
          <IconButton
            onClick={onClose}
            icon={<X className="w-5 h-5" />}
            aria-label="Close"
          />
        </div>

        <p className="text-gray-400 text-sm leading-relaxed mb-6">{message}</p>

        <Button variant="primary" onClick={onClose} fullWidth>
          Close
        </Button>
      </div>
    </Modal>
  );
}
