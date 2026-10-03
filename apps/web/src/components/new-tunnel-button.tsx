import { HugeiconsIcon } from "@hugeicons/react";
import Add01Icon from "@hugeicons-pro/core-stroke-rounded/Add01Icon";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";

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
      size="lg"
      shape="pill"
      onClick={onClick}
      aria-label={isAtLimit ? "New tunnel (plan limit reached)" : "New tunnel"}
      leftIcon={
        <HugeiconsIcon
          icon={Add01Icon}
          size={15}
          strokeWidth={1.9}
          aria-hidden="true"
        />
      }
      className="shrink-0 !text-[14px]"
    >
      New tunnel
    </Button>
  );
}
