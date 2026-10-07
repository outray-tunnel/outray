import { useState, type RefObject } from "react";
import { Button } from "../arc/button/button";
import { ObservabilitySetup } from "../onboarding/observability-setup";
import { SideSheet } from "../ui/side-sheet";

export function ConnectServiceSheet({
  open,
  onClose,
  orgSlug,
  onRecheck,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  onRecheck: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const close = () => {
    setTokenModalOpen(false);
    onClose();
  };

  return (
    <SideSheet
      open={open}
      onClose={close}
      title="Connect a service"
      description="Create an ingest token, install the SDK, and send telemetry from your application."
      returnFocusRef={returnFocusRef}
      closeDisabled={tokenModalOpen}
      onEscapeKeyDown={(event) => {
        if (tokenModalOpen) {
          event.preventDefault();
          setTokenModalOpen(false);
        }
      }}
      onInteractOutside={(event) => {
        if (tokenModalOpen) event.preventDefault();
      }}
      footer={<Button variant="secondary" size="sm" onClick={close} disabled={tokenModalOpen}>Done</Button>}
    >
      <ObservabilitySetup
        orgSlug={orgSlug}
        onRecheck={onRecheck}
        buttonSize="sm"
        tokenModalOpen={tokenModalOpen}
        onTokenModalOpenChange={setTokenModalOpen}
      />
      <p className="mt-4 text-[11px] leading-5 text-zinc-500">
        Your service will appear in the overview when its first telemetry arrives. You can close this panel without interrupting the connection.
      </p>
    </SideSheet>
  );
}
