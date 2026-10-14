import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Delete02Icon from "@outray/icons/stroke/Delete02Icon";
import { ConfirmMorph } from "./confirm-morph";

interface ResourceConfirmDeleteProps {
  triggerLabel: string;
  actionLabel: string;
  confirmLabel: string;
  description: string;
  pendingLabel: string;
  doneLabel: string;
  onConfirm: () => Promise<unknown>;
  disabled?: boolean;
}

/** API deletes are irreversible: use Arc's inline morph without offering Undo. */
export function ResourceConfirmDelete({
  triggerLabel,
  actionLabel,
  confirmLabel,
  description,
  pendingLabel,
  doneLabel,
  onConfirm,
  disabled,
}: ResourceConfirmDeleteProps) {
  const controlRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    const control = controlRef.current;
    const row = control?.closest("article");
    const panel = row?.closest("section[aria-label]");
    const ownedFocus = !!control?.contains(document.activeElement);
    const candidates: Array<HTMLElement | null | undefined> = [
      row?.nextElementSibling?.querySelector<HTMLElement>("button:not(:disabled)"),
      row?.previousElementSibling?.querySelector<HTMLElement>("button:not(:disabled)"),
      panel?.querySelector<HTMLElement>('input[type="search"], input, button:not(:disabled)'),
    ];
    setError(null);
    await onConfirm();

    // Query mutation success can remove this row before its promise resolves.
    // Restore keyboard focus after that commit, but never steal it if the user
    // moved elsewhere while the request was pending.
    if (ownedFocus && row) {
      requestAnimationFrame(() => {
        if (row.isConnected || document.activeElement !== document.body) return;
        candidates.find((candidate) => candidate?.isConnected)?.focus({ preventScroll: true });
      });
    }
  };

  return (
    <ConfirmMorph
      ref={controlRef}
      label={actionLabel}
      ariaLabel={triggerLabel}
      iconOnly
      icon={<HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.7} aria-hidden="true" />}
      prompt="Are you sure?"
      description={description}
      confirmLabel={confirmLabel}
      pendingLabel={pendingLabel}
      doneLabel={doneLabel}
      errorLabel={error ?? `Could not ${confirmLabel.toLowerCase()}`}
      resultTimeout={0}
      onConfirm={handleConfirm}
      onError={(reason) => setError(reason instanceof Error ? reason.message : "Could not complete this action. Try again.")}
      disabled={disabled}
    />
  );
}
