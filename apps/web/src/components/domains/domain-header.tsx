import { Plus } from "lucide-react";
import { Button } from "@/components/ui";

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
    <div className="flex items-start sm:items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl sm:text-2xl font-medium text-white">
          Custom Domains
        </h1>
        <p className="text-xs sm:text-sm text-white/40 mt-1">
          Connect your own domains to your tunnels · {currentDomainCount} /{" "}
          {isUnlimited ? "∞" : domainLimit} domains
        </p>
      </div>
      <Button
        onClick={onAddClick}
        disabled={isAtLimit}
        leftIcon={<Plus size={18} />}
        className="shrink-0"
      >
        <span className="hidden sm:inline">Add Domain</span>
      </Button>
    </div>
  );
}
