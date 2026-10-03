import type { RefObject } from "react";
import { NewTunnelButton } from "@/components/new-tunnel-button";

export function OverviewHeader({
  isAtLimit,
  onNewTunnelClick,
  triggerRef,
}: {
  isAtLimit: boolean;
  onNewTunnelClick: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 pb-1">
      <div className="min-w-0">
        <h1 className="text-[20px] font-normal tracking-[-0.035em] text-white">
          Overview
        </h1>
        <p className="mt-1 text-[12px] text-zinc-500">
          Traffic and connections across your tunnels.
        </p>
      </div>
      <NewTunnelButton
        isAtLimit={isAtLimit}
        onClick={onNewTunnelClick}
        buttonRef={triggerRef}
      />
    </header>
  );
}
