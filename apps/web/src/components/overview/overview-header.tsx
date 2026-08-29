import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons-pro/core-stroke-rounded";

export function OverviewHeader({
  isAtLimit,
  onNewTunnelClick,
}: {
  isAtLimit: boolean;
  onNewTunnelClick: () => void;
}) {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-white/[0.07] pb-7">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-white">
          Overview
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Traffic, capacity, and tunnel health at a glance.
        </p>
      </div>
      <button
        type="button"
        onClick={onNewTunnelClick}
        disabled={isAtLimit}
        className="flex h-9 shrink-0 items-center gap-2 rounded-md bg-white px-3.5 text-[12px] font-medium text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <HugeiconsIcon
          icon={Add01Icon}
          size={15}
          strokeWidth={1.9}
          aria-hidden="true"
        />
        <span className="hidden sm:inline">New tunnel</span>
      </button>
    </header>
  );
}
