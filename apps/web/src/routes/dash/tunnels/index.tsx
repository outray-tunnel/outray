import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Globe,
  Copy,
  MoreVertical,
  Filter,
  ArrowUpDown,
  LayoutGrid,
  List,
  Search,
  Loader2,
} from "lucide-react";
import { appClient } from "../../../lib/app-client";

export const Route = createFileRoute("/dash/tunnels/")({
  component: TunnelsView,
});

function TunnelsView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["tunnels"],
    queryFn: () => appClient.tunnels.list(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gray-500" size={24} />
      </div>
    );
  }

  if (error || (data && "error" in data)) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        Failed to load tunnels
      </div>
    );
  }

  const tunnels = data && "tunnels" in data ? data.tunnels : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            size={16}
          />
          <input
            type="text"
            placeholder="Search tunnels by name, description or key"
            className="w-full bg-black border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-gray-300 hover:text-white hover:border-white/20 transition-colors">
            <Filter size={16} />
            Filters
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-gray-300 hover:text-white hover:border-white/20 transition-colors">
            <ArrowUpDown size={16} />
            Sort
          </button>
          <div className="h-9 w-px bg-white/10 mx-1" />
          <div className="flex bg-black border border-white/10 rounded-lg p-1">
            <button className="p-1.5 text-white bg-white/10 rounded-md">
              <List size={16} />
            </button>
            <button className="p-1.5 text-gray-500 hover:text-gray-300">
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {tunnels.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No tunnels found. Start one using the CLI!
          </div>
        ) : (
          tunnels.map((tunnel) => (
            <Link
              key={tunnel.id}
              to="/dash/tunnels/$tunnelId"
              params={{ tunnelId: tunnel.id }}
              className="block group bg-black border border-white/5 rounded-lg p-4 hover:border-white/10 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
                    <Globe size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-white">
                        {tunnel.name || new URL(tunnel.url).hostname}
                      </h3>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        HTTP
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500 font-mono">
                        {tunnel.url}
                      </span>
                      <button
                        className="text-gray-600 hover:text-gray-400 transition-colors"
                        onClick={(e) => {
                          e.preventDefault();
                          navigator.clipboard.writeText(tunnel.url);
                        }}
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1">
                        Status
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            tunnel.isOnline
                              ? "bg-green-500 animate-pulse"
                              : "bg-red-500"
                          }`}
                        />
                        <span className="text-sm font-mono text-gray-300 capitalize">
                          {tunnel.isOnline ? "online" : "offline"}
                        </span>
                      </div>
                    </div>
                    <div className="h-8 w-px bg-white/5" />
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1">
                        Created
                      </div>
                      <div className="text-sm font-mono text-gray-300">
                        {new Date(tunnel.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <button className="p-2 text-gray-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
