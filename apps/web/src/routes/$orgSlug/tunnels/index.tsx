import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Alert02Icon,
  ArrowRight01Icon,
  Copy01Icon,
  Route03Icon,
  Search01Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import { appClient } from "@/lib/app-client";
import { getPlanLimits } from "@/lib/subscription-plans";
import { NewTunnelModal } from "@/components/new-tunnel-modal";
import { LimitModal } from "@/components/limit-modal";
import { Select } from "@/components/ui/select";

export const Route = createFileRoute("/$orgSlug/tunnels/")({
  head: () => ({ meta: [{ title: "Tunnels - OutRay" }] }),
  component: TunnelsView,
});

function TunnelsView() {
  const { orgSlug } = Route.useParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest");
  const [isNewTunnelModalOpen, setIsNewTunnelModalOpen] = useState(false);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);

  const { data: subscriptionData } = useQuery({
    queryKey: ["subscription", orgSlug],
    queryFn: async () => {
      const response = await appClient.subscriptions.get(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response;
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["tunnels", orgSlug],
    queryFn: () => appClient.tunnels.list(orgSlug),
  });

  const tunnels = data && "tunnels" in data ? data.tunnels : [];
  const currentPlan = subscriptionData?.subscription?.plan || "free";
  const tunnelLimit = getPlanLimits(currentPlan as any).maxTunnels;
  const isAtLimit = tunnelLimit !== -1 && tunnels.length >= tunnelLimit;

  const filteredTunnels = tunnels
    .filter(
      (tunnel) =>
        tunnel.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tunnel.url.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      if (sortBy === "newest") {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
      if (sortBy === "oldest") {
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      }
      return (a.name || "").localeCompare(b.name || "");
    });

  const handleNewTunnelClick = () => {
    if (isAtLimit) {
      setIsLimitModalOpen(true);
      return;
    }
    setIsNewTunnelModalOpen(true);
  };

  if (error || (data && "error" in data)) {
    return (
      <div className="flex min-h-64 items-center justify-center text-xs text-red-400">
        Failed to load tunnels
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex items-end justify-between gap-6 border-b border-white/[0.07] pb-7">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-white">
            Active tunnels
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Manage public endpoints connected to your local services.
          </p>
        </div>
        <button
          type="button"
          onClick={handleNewTunnelClick}
          disabled={isAtLimit}
          className="flex h-9 shrink-0 items-center gap-2 rounded-md bg-white px-3.5 text-[12px] font-medium text-black transition-colors hover:bg-zinc-200 disabled:opacity-40"
        >
          <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.9} />
          <span className="hidden sm:inline">New tunnel</span>
        </button>
      </header>

      {isAtLimit && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 px-5 py-4 text-amber-300">
          <HugeiconsIcon
            icon={Alert02Icon}
            size={16}
            strokeWidth={1.7}
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">Tunnel limit reached</p>
            <p className="mt-1 text-[11px] text-amber-300/50">
              The {currentPlan} plan includes {tunnelLimit} tunnels.
            </p>
          </div>
          <Link
            to="/$orgSlug/billing"
            params={{ orgSlug }}
            className="text-[11px] font-medium text-amber-300 hover:text-amber-200"
          >
            Upgrade plan
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex h-9 max-w-sm flex-1 items-center gap-2 border-b border-white/[0.09] text-zinc-600 focus-within:border-white/20 focus-within:text-zinc-400">
          <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.7} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search tunnels"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-zinc-300 outline-none placeholder:text-zinc-700"
          />
        </label>
        <div className="flex items-center gap-2 text-[11px] text-zinc-700">
          <span>Sort</span>
          <Select
            value={sortBy}
            onChange={(value) =>
              setSortBy(value as "newest" | "oldest" | "name")
            }
            options={[
              { value: "newest", label: "Newest" },
              { value: "oldest", label: "Oldest" },
              { value: "name", label: "Name" },
            ]}
            ariaLabel="Sort tunnels"
            className="w-28"
            triggerClassName="h-9 bg-transparent"
          />
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-white/[0.07]">
        <div className="hidden grid-cols-[minmax(0,1fr)_100px_120px_24px] gap-4 border-b border-white/[0.07] px-6 py-4 text-[9px] font-medium uppercase tracking-[0.1em] text-zinc-700 md:grid">
          <span>Tunnel</span>
          <span>Status</span>
          <span>Created</span>
          <span />
        </div>

        {isLoading ? (
          <div className="divide-y divide-white/[0.06]">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="flex h-17 animate-pulse items-center gap-3 px-6 py-4"
              >
                <span className="h-7 w-7 rounded-md bg-white/[0.04]" />
                <span className="h-3 w-44 bg-white/[0.04]" />
              </div>
            ))}
          </div>
        ) : filteredTunnels.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center">
            <HugeiconsIcon
              icon={Route03Icon}
              size={26}
              strokeWidth={1.5}
              className="mb-4 text-zinc-700"
            />
            <p className="text-sm text-zinc-400">
              {searchQuery ? "No tunnels match your search" : "No tunnels yet"}
            </p>
            <p className="mt-1 text-[11px] text-zinc-700">
              {searchQuery
                ? "Try a different name or URL."
                : "Create one here or connect through the CLI."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {filteredTunnels.map((tunnel) => {
              const title =
                tunnel.name ||
                (tunnel.protocol === "http"
                  ? new URL(tunnel.url).hostname
                  : `${tunnel.protocol?.toUpperCase()} port ${tunnel.remotePort}`);

              return (
                <Link
                  key={tunnel.id}
                  to="/$orgSlug/tunnels/$tunnelId"
                  params={{ orgSlug, tunnelId: tunnel.id }}
                  search={{ tab: "overview" }}
                  className="group grid gap-4 px-6 py-5 transition-colors hover:bg-white/[0.02] md:grid-cols-[minmax(0,1fr)_100px_120px_24px] md:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-zinc-600 ring-1 ring-white/[0.06]">
                      <HugeiconsIcon
                        icon={Route03Icon}
                        size={15}
                        strokeWidth={1.7}
                      />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13px] font-medium text-zinc-300 group-hover:text-white">
                          {title}
                        </p>
                        <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-700">
                          {tunnel.protocol || "http"}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="truncate font-mono text-[10px] text-zinc-700">
                          {tunnel.url}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            void navigator.clipboard.writeText(tunnel.url);
                          }}
                          className="text-zinc-800 hover:text-zinc-400"
                          aria-label="Copy tunnel URL"
                        >
                          <HugeiconsIcon
                            icon={Copy01Icon}
                            size={11}
                            strokeWidth={1.7}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        tunnel.isOnline ? "bg-emerald-500" : "bg-red-500"
                      }`}
                    />
                    {tunnel.isOnline ? "Online" : "Offline"}
                  </div>
                  <span className="text-[11px] text-zinc-600">
                    {new Date(tunnel.createdAt).toLocaleDateString()}
                  </span>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={14}
                    strokeWidth={1.7}
                    className="hidden text-zinc-800 group-hover:text-zinc-400 md:block"
                  />
                </Link>
              );
            })}
          </div>
        )}
      </section>

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
