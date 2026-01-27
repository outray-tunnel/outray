import { Plus } from "lucide-react";
import { Button } from "@/components/ui";

interface SubdomainHeaderProps {
  currentSubdomainCount: number;
  subdomainLimit: number;
  isUnlimited: boolean;
  isAtLimit: boolean;
  onAddClick: () => void;
}

export function SubdomainHeader({
  currentSubdomainCount,
  subdomainLimit,
  isUnlimited,
  isAtLimit,
  onAddClick,
}: SubdomainHeaderProps) {
  return (
    <div className="flex items-start sm:items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl sm:text-2xl font-semibold text-white">
          Subdomains
        </h1>
        <p className="text-xs sm:text-sm text-gray-400 mt-1">
          Reserve subdomains for your tunnels · {currentSubdomainCount} /{" "}
          {isUnlimited ? "∞" : subdomainLimit} subdomains
        </p>
      </div>
      <Button
        onClick={onAddClick}
        disabled={isAtLimit}
        leftIcon={<Plus size={18} />}
        className="shrink-0"
      >
        <span className="hidden sm:inline">Reserve Subdomain</span>
      </Button>
    </div>
  );
}
