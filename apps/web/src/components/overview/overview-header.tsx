import { Plus } from "lucide-react";
import { Button } from "@/components/ui";

export function OverviewHeader({
  isAtLimit,
  onNewTunnelClick,
}: {
  isAtLimit: boolean;
  onNewTunnelClick: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          Overview
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          Welcome back, here's what's happening.
        </p>
      </div>
      <Button
        onClick={onNewTunnelClick}
        disabled={isAtLimit}
        leftIcon={<Plus size={18} />}
        className="w-full sm:w-auto shrink-0"
      >
        <span>New Tunnel</span>
      </Button>
    </div>
  );
}
