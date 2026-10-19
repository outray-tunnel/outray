import { HugeiconsIcon } from "@hugeicons/react";
import Add01Icon from "@outray/icons/stroke/Add01Icon";
import type { Ref } from "react";
import { Button } from "@/components/arc/button/button";

export function NewTunnelButton({
  isAtLimit,
  onClick,
  buttonRef,
}: {
  isAtLimit: boolean;
  onClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <Button
      type="button"
      ref={buttonRef}
      variant="secondary"
      size="md"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={isAtLimit ? "New tunnel (plan limit reached)" : "New tunnel"}
      className="shrink-0"
    >
      <HugeiconsIcon
        icon={Add01Icon}
        size={15}
        strokeWidth={1.9}
        aria-hidden="true"
      />
      New tunnel
    </Button>
  );
}
