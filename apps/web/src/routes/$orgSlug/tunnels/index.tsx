import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Globe,
  Copy,
  MoreVertical,
  ArrowUpDown,
  LayoutGrid,
  List,
  Search,
  Check,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { appClient } from "@/lib/app-client";
import { getPlanLimits } from "@/lib/subscription-plans";
import { NewTunnelModal } from "@/components/new-tunnel-modal";
import { LimitModal } from "@/components/limit-modal";
import { Button } from "@/components/ui";

export const Route = createFileRoute("/$orgSlug/tunnels/")({
  head: () => ({
    meta: [
      { title: "Tunnels - OutRay" },
    ],
  }),
  component: TunnelsView,
});

function TunnelsView() {
  const { orgSlug } = Route.useParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isNewTunnelModalOpen, setIsNewTunnelModalOpen] = useState(false);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);

  const { data: subscriptionData } = useQuery({
    queryKey: ["subscription", orgSlug],
    queryFn: async () => {
      if (!orgSlug) return null;
      const response = await appClient.subscriptions.get(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    enabled: !!orgSlug,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["tunnels", orgSlug],
    queryFn: () => {
      if (!orgSlug) throw new Error("No active organization");
      return appClient.tunnels.list(orgSlug);
    },
    enabled: !!orgSlug,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center justify-between gap-4 opacity-50 pointer-events-none">
          <div className="relative flex-1 max-w-md">
            <div className="h-10 bg-white/5 rounded-lg w-full" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-24 bg-white/5 rounded-lg" />
            <div className="h-10 w-20 bg-white/5 rounded-lg" />
            <div className="h-9 w-px bg-white/10 mx-1" />
            <div className="h-10 w-20 bg-white/5 rounded-lg" />
          </div>
        </div>

        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-white/2 border border-white/5 rounded-2xl p-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/5" />
                  <div>
                    <div className="h-4 w-32 bg-white/5 rounded mb-2" />
                    <div className="h-3 w-48 bg-white/5 rounded" />
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end gap-1">
                      <div className="h-2 w-12 bg-white/5 rounded" />
                      <div className="h-3 w-16 bg-white/5 rounded" />
                    </div>
                    <div className="h-8 w-px bg-white/5" />
                    <div className="flex flex-col items-end gap-1">
                      <div className="h-2 w-12 bg-white/5 rounded" />
                      <div className="h-3 w-20 bg-white/5 rounded" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
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
  const subscription = subscriptionData?.subscription;
  const currentPlan = subscription?.plan || "free";
  const planLimits = getPlanLimits(currentPlan as any);
  const tunnelLimit = planLimits.maxTunnels;
  const isAtLimit = tunnels.length >= tunnelLimit;

  const handleNewTunnelClick = () => {
    if (isAtLimit) {
      setIsLimitModalOpen(true);
      return;
    }
    setIsNewTunnelModalOpen(true);
  };

  const filteredTunnels = tunnels
    .filter(
      (t) =>
        t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.url.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      if (sortBy === "newest")
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      if (sortBy === "oldest")
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
      return 0;
    });

  return (
    <div className="space-y-6">
      {isAtLimit && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-orange-200">
              Tunnel Limit Reached
            </h3>
            <p className="text-xs text-orange-200/60 mt-0.5">
              You have reached the limit of {tunnelLimit} tunnels on the{" "}
              <span className="capitalize">{currentPlan}</span> plan. Upgrade to
              create more.
            </p>
          </div>
          <Link
            to="/$orgSlug/billing"
            params={{ orgSlug }}
            className="ml-auto px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-200 text-xs font-medium rounded-lg transition-colors"
          >
            Upgrade Plan
          </Link>
        </div>
      )}

      <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 min-w-0 max-w-md group">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-accent transition-colors"
            size={16}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tunnels..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent/50 focus:bg-white/10 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="relative">
            <button
              onClick={() => setIsSortOpen(!isSortOpen)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-all sm:min-w-35 justify-between"
            >
              <div className="flex items-center gap-2">
                <ArrowUpDown size={16} />
                <span className="capitalize hidden sm:inline">{sortBy}</span>
              </div>
            </button>

            {isSortOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setIsSortOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-40 bg-[#0A0A0A] border border-white/10 rounded-xl overflow-hidden shadow-xl z-20 py-1">
                  {(["newest", "oldest", "name"] as const).map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setSortBy(option);
                        setIsSortOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center justify-between"
                    >
                      <span className="capitalize">{option}</span>
                      {sortBy === option && (
                        <Check size={14} className="text-accent" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* View mode toggle - hidden on mobile (always grid on mobile) */}
          <div className="hidden sm:block h-9 w-px bg-white/10 mx-1" />

          <div className="hidden sm:flex bg-white/5 border border-white/10 rounded-xl p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-lg transition-all ${
                viewMode === "list"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded-lg transition-all ${
                viewMode === "grid"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <LayoutGrid size={16} />
            </button>
          </div>

          <Button
            onClick={handleNewTunnelClick}
            disabled={isAtLimit}
            leftIcon={<Plus size={18} />}
          >
            <span className="hidden sm:inline">New Tunnel</span>
          </Button>
        </div>
      </div>

      {/* Grid on mobile, respect viewMode on larger screens */}
      <div
        className={`grid grid-cols-1 gap-4 ${
          viewMode === "grid"
            ? "sm:grid-cols-2 lg:grid-cols-3"
            : "sm:grid-cols-1"
        }`}
      >
        {filteredTunnels.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">
            {searchQuery
              ? "No tunnels match your search"
              : "No tunnels found. Start one using the CLI!"}
          </div>
        ) : (
          filteredTunnels.map((tunnel) => (
            <Link
              key={tunnel.id}
              to="/$orgSlug/tunnels/$tunnelId"
              params={{ orgSlug, tunnelId: tunnel.id }}
              className={`block group bg-white/2 border border-white/5 rounded-2xl hover:border-white/10 transition-all p-4 sm:p-6 ${
                viewMode === "grid" ? "h-full flex flex-col" : "sm:block"
              }`}
              search={{
                tab: "overview",
              }}
            >
              {/* Always use grid-style layout on mobile, respect viewMode on larger screens */}
              <div
                className={
                  viewMode === "grid"
                    ? "flex flex-col h-full"
                    : "flex flex-col sm:flex-row sm:items-center sm:justify-between"
                }
              >
                <div
                  className={`flex items-center gap-3 sm:gap-4 ${viewMode === "grid" ? "mb-4 sm:mb-6" : "mb-4 sm:mb-0"}`}
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20 shrink-0">
                    <Globe size={18} className="sm:hidden" />
                    <Globe size={20} className="hidden sm:block" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-white truncate">
                        {tunnel.name ||
                          (tunnel.protocol === "http"
                            ? new URL(tunnel.url).hostname
                            : `${tunnel.protocol?.toUpperCase()} Port ${tunnel.remotePort}`)}
                      </h3>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                          tunnel.protocol === "tcp"
                            ? "bg-purple-500/10 text-purple-500 border border-purple-500/20"
                            : tunnel.protocol === "udp"
                              ? "bg-orange-500/10 text-orange-500 border border-orange-500/20"
                              : "bg-green-500/10 text-green-500 border border-green-500/20"
                        }`}
                      >
                        {(tunnel.protocol || "http").toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500 font-mono truncate">
                        {tunnel.url}
                      </span>
                      <button
                        className="text-gray-600 hover:text-gray-400 transition-colors shrink-0"
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

                <div
                  className={
                    viewMode === "grid"
                      ? "mt-auto pt-4 sm:pt-6 border-t border-white/5 flex items-center justify-between"
                      : "pt-4 sm:pt-0 border-t sm:border-t-0 border-white/5 flex items-center justify-between sm:gap-8"
                  }
                >
                  <div
                    className={`flex items-center ${viewMode === "grid" ? "gap-4 w-full justify-between" : "gap-4 sm:gap-6 w-full sm:w-auto justify-between sm:justify-start"}`}
                  >
                    <div className={viewMode === "grid" ? "" : "sm:text-right"}>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1">
                        Status
                      </div>
                      <div
                        className={`flex items-center gap-2 ${viewMode === "grid" ? "" : "sm:justify-end"}`}
                      >
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

                    {!viewMode && (
                      <div className="hidden sm:block h-8 w-px bg-white/5" />
                    )}

                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1">
                        Created
                      </div>
                      <div className="text-sm font-mono text-gray-300">
                        {new Date(tunnel.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {viewMode !== "grid" && (
                    <button className="hidden sm:block p-2 text-gray-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                      <MoreVertical size={16} />
                    </button>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      <NewTunnelModal
        isOpen={isNewTunnelModalOpen}
        onClose={() => setIsNewTunnelModalOpen(false)}
      />

      <LimitModal
        isOpen={isLimitModalOpen}
        onClose={() => setIsLimitModalOpen(false)}
        title="Tunnel Limit Reached"
        description={`You've reached your plan's limit of ${tunnelLimit} active tunnels. Upgrade your plan to create more tunnels.`}
        limit={tunnelLimit}
        currentPlan={currentPlan}
        resourceName="Active Tunnels"
      />
    </div>
  );
}
