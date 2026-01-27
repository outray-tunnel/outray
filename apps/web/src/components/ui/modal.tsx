import { type ReactNode } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { IconButton } from "./icon-button";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

export interface ModalHeaderProps {
  icon?: ReactNode;
  iconClassName?: string;
  title: string;
  description?: string;
  onClose: () => void;
}

export interface ModalContentProps {
  children: ReactNode;
  className?: string;
}

export interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

const sizeStyles: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export function Modal({
  isOpen,
  onClose,
  children,
  size = "md",
}: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`w-full ${sizeStyles[size]} bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto flex flex-col max-h-[90vh]`}
            >
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

export function ModalHeader({
  icon,
  iconClassName = "bg-white/5 text-white",
  title,
  description,
  onClose,
}: ModalHeaderProps) {
  return (
    <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        {icon && (
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconClassName}`}
          >
            {icon}
          </div>
        )}
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {description && (
            <p className="text-sm text-gray-500">{description}</p>
          )}
        </div>
      </div>
      <IconButton
        onClick={onClose}
        icon={<X size={20} />}
        aria-label="Close modal"
      />
    </div>
  );
}

export function ModalContent({ children, className = "" }: ModalContentProps) {
  return (
    <div className={`p-6 overflow-y-auto ${className}`}>{children}</div>
  );
}

export function ModalFooter({ children, className = "" }: ModalFooterProps) {
  return (
    <div
      className={`p-6 border-t border-white/5 flex justify-end gap-3 shrink-0 ${className}`}
    >
      {children}
    </div>
  );
}
