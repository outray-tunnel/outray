import { useState, type RefObject } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowUpRight01Icon from "@outray/icons/stroke/ArrowUpRight01Icon";
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
      footer={<>
        <a
          href="/docs/observability/getting-started"
          target="_blank"
          rel="noreferrer"
          className="mr-auto inline-flex min-h-8 items-center gap-1.5 rounded-md text-[12px] text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none"
        >
          Read the docs
          <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} strokeWidth={1.8} aria-hidden="true" />
        </a>
        <Button variant="secondary" size="sm" onClick={close} disabled={tokenModalOpen}>Done</Button>
      </>}
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
