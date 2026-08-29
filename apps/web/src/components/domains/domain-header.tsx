import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons-pro/core-stroke-rounded";

interface DomainHeaderProps {
  currentDomainCount: number;
  domainLimit: number;
  isUnlimited: boolean;
  isAtLimit: boolean;
  onAddClick: () => void;
}

export function DomainHeader({
  currentDomainCount,
  domainLimit,
  isUnlimited,
  isAtLimit,
  onAddClick,
}: DomainHeaderProps) {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-white/[0.07] pb-7">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-white">
          Custom Domains
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Connect branded addresses to your tunnels · {currentDomainCount} of{" "}
          {isUnlimited ? "∞" : domainLimit} used
        </p>
      </div>
      <button
        type="button"
        onClick={onAddClick}
        disabled={isAtLimit}
        className="flex h-9 shrink-0 items-center gap-2 rounded-md bg-white px-3.5 text-[12px] font-medium text-black transition-colors hover:bg-zinc-200 disabled:opacity-40"
      >
        <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.9} />
        <span className="hidden sm:inline">Add domain</span>
      </button>
    </header>
  );
}
