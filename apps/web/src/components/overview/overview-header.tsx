import { Plus } from "lucide-react";

export function OverviewHeader({
  isAtLimit,
  onNewTunnelClick,
}: {
  isAtLimit: boolean;
  onNewTunnelClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Overview
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Welcome back, here's what's happening.
        </p>
      </div>
      <button
        onClick={onNewTunnelClick}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors font-medium shadow-lg shadow-white/5 ${
          isAtLimit
            ? "bg-white/10 text-gray-400 cursor-not-allowed"
            : "bg-white hover:bg-gray-200 text-black"
        }`}
      >
        <Plus size={18} />
        New Tunnel
      </button>
    </div>
  );
}
