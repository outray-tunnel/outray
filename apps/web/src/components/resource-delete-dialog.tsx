import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Delete02Icon from "@hugeicons-pro/core-stroke-rounded/Delete02Icon";
import { Button } from "@/components/arc/button/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/arc/dialog/dialog";
import "./outray-arc-theme.css";

interface ResourceDeleteDialogProps {
  title: string;
  description: string;
  resourceName: string;
  actionLabel: string;
  triggerLabel: string;
  onConfirm: () => Promise<unknown>;
  disabled?: boolean;
}

/** A confirmation scoped to domain resources; failed actions stay open for retry. */
export function ResourceDeleteDialog({
  title,
  description,
  resourceName,
  actionLabel,
  triggerLabel,
  onConfirm,
  disabled,
}: ResourceDeleteDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const handleConfirm = async () => {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setIsPending(true);
    setError(null);
    try {
      await onConfirm();
      setIsOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not complete this action. Try again.",
      );
    } finally {
      inFlight.current = false;
      setIsPending(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (inFlight.current) return;
        setError(null);
        setIsOpen(open);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="md"
          disabled={disabled || isPending}
          aria-label={triggerLabel}
          title={triggerLabel}
          style={{ width: 36, paddingInline: 0 }}
        >
          <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.7} aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="outray-arc"
        title={title}
        description={description}
        closeDisabled={isPending}
        aria-busy={isPending}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (inFlight.current) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (inFlight.current) event.preventDefault();
        }}
      >
        <p className="mb-5 break-all rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 font-mono text-[12px] text-zinc-300">
          {resourceName}
        </p>
        {error && <p role="alert" className="mb-4 text-[12px] text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button
            ref={cancelRef}
            type="button"
            variant="secondary"
            size="sm"
            disabled={isPending}
            onClick={() => setIsOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            loading={isPending}
            onClick={() => void handleConfirm()}
          >
            {actionLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
