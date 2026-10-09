import { HugeiconsIcon } from "@hugeicons/react";
import Add01Icon from "@outray/icons/stroke/Add01Icon";
import type { Ref } from "react";
import { Button } from "@/components/arc/button/button";
import "./outray-arc-theme.css";

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
      variant="primary"
      size="md"
      onClick={onClick}
      aria-label={isAtLimit ? "New tunnel (plan limit reached)" : "New tunnel"}
      className="outray-arc shrink-0"
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
