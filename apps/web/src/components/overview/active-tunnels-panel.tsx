import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Clock, ChevronRight, Network } from "lucide-react";
import { type Tunnel } from "@/lib/app-client";

export function ActiveTunnelsPanel({
  activeTunnels,
  orgSlug,
}: {
  activeTunnels: Tunnel[];
  orgSlug: string;
}) {
  const hasTunnels = activeTunnels.length > 0;

  return (
    <div className="bg-white/2 border border-white/5 rounded-2xl p-6 flex flex-col flex-1">
      <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
        <Network size={18} className="text-blue-400" />
        Active Tunnels
      </h3>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2 -mr-2 custom-scrollbar">
        {!hasTunnels ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 py-8">
            <Network size={32} className="mb-3 opacity-50" />
            <p className="text-sm">No active tunnels</p>
            <Link
              to="/$orgSlug/tunnels"
              className="mt-2 text-xs text-accent hover:underline"
              params={{ orgSlug }}
            >
              Start your first tunnel
            </Link>
          </div>
        ) : (
          activeTunnels.slice(0, 5).map((tunnel) => (
            <Link
              key={tunnel.id}
              to="/$orgSlug/tunnels/$tunnelId"
              params={{ orgSlug, tunnelId: tunnel.id }}
              className="block p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all group"
              search={{ tab: "overview" }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${tunnel.isOnline ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
                  />
                  <span className="text-sm font-medium text-white truncate max-w-30">
                    {tunnel.name || tunnel.id}
                  </span>
                </div>
                <ChevronRight
                  size={14}
                  className="text-gray-500 group-hover:text-white transition-colors"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="font-mono truncate max-w-35">
                  {tunnel.url}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {new Date(tunnel.createdAt).toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>

      {hasTunnels && (
        <Link
          to="/$orgSlug/tunnels"
          className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-white transition-colors py-2 border-t border-white/5"
          params={{ orgSlug }}
        >
          View all tunnels
          <ArrowUpRight size={14} />
        </Link>
      )}
    </div>
  );
}
