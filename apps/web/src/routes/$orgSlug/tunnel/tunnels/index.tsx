import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Alert02Icon from "@outray/icons/stroke/Alert02Icon";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import Copy01Icon from "@outray/icons/stroke/Copy01Icon";
import Route03Icon from "@outray/icons/stroke/Route03Icon";
import Tick02Icon from "@outray/icons/stroke/Tick02Icon";
import { Button } from "@/components/arc/button/button";
import { SearchField } from "@/components/arc/search-field/search-field";
import { Select } from "@/components/arc/select/select";
import { NewTunnelModal } from "@/components/new-tunnel-modal";
import { NewTunnelButton } from "@/components/new-tunnel-button";
import { LimitModal } from "@/components/limit-modal";
import { appClient, type Tunnel } from "@/lib/app-client";
import { getSubscriptionLimits } from "@/lib/subscription-plans";
import "@/components/outray-arc-theme.css";

export const Route = createFileRoute("/$orgSlug/tunnel/tunnels/")({
  head: () => ({ meta: [{ title: "Tunnels - OutRay" }] }),
  component: TunnelsView,
});

type SortOrder = "newest" | "oldest" | "name";

const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
];

function tunnelTitle(tunnel: Tunnel): string {
  if (tunnel.name?.trim()) return tunnel.name.trim();
  if (tunnel.protocol !== "http") {
    return `${tunnel.protocol.toUpperCase()} port ${tunnel.remotePort ?? "—"}`;
  }
  try {
    return new URL(tunnel.url).hostname;
  } catch {
    return tunnel.url || "HTTP tunnel";
  }
}

function createdDate(tunnel: Tunnel): string {
  const date = new Date(tunnel.createdAt);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleDateString();
}

function TunnelsView() {
  const { orgSlug } = Route.useParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOrder>("newest");
  const [isNewTunnelModalOpen, setIsNewTunnelModalOpen] = useState(false);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [copiedTunnelId, setCopiedTunnelId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newTunnelTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const { data: subscriptionData } = useQuery({
    queryKey: ["subscription", orgSlug],
    queryFn: async () => {
      const response = await appClient.subscriptions.get(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response;
    },
  });

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["tunnels", orgSlug],
    queryFn: async () => {
      const response = await appClient.tunnels.list(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const tunnels = data?.tunnels ?? [];
  const currentPlan = subscriptionData?.subscription?.plan || "free";
  const instanceOwned = !!subscriptionData?.instanceLimits;
  const tunnelLimit = getSubscriptionLimits(subscriptionData).maxTunnels;
  const isAtLimit = Boolean(subscriptionData) && tunnelLimit >= 0 && tunnels.length >= tunnelLimit;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredTunnels = tunnels
    .filter((tunnel) =>
      !normalizedSearch ||
      tunnelTitle(tunnel).toLowerCase().includes(normalizedSearch) ||
      tunnel.url.toLowerCase().includes(normalizedSearch),
    )
    .sort((a, b) => {
      if (sortBy === "name") {
        return tunnelTitle(a).localeCompare(tunnelTitle(b)) || a.id.localeCompare(b.id);
      }
      const difference = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return (sortBy === "newest" ? -difference : difference) || a.id.localeCompare(b.id);
    });

  const handleNewTunnelClick = () => {
    if (isAtLimit) {
      setIsLimitModalOpen(true);
      return;
    }
    setIsNewTunnelModalOpen(true);
  };

  const handleCopy = async (tunnel: Tunnel) => {
    try {
      await navigator.clipboard.writeText(tunnel.url);
      setCopyError(null);
      setCopiedTunnelId(tunnel.id);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedTunnelId(null), 2200);
    } catch {
      setCopiedTunnelId(null);
      setCopyError(`Could not copy ${tunnelTitle(tunnel)}’s address. Check clipboard permissions and try again.`);
    }
  };

  return (
    <div className="outray-arc outray-arc-list mx-auto max-w-[1440px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-normal tracking-[-0.035em] text-white">Active tunnels</h1>
          <p className="mt-1 text-[12px] text-zinc-500">Public endpoints currently connected to your services.</p>
        </div>
        <NewTunnelButton
          isAtLimit={isAtLimit}
          onClick={handleNewTunnelClick}
          buttonRef={newTunnelTriggerRef}
        />
      </header>

      {isAtLimit && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 text-amber-300">
          <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={1.7} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium">Tunnel limit reached</p>
            <p className="mt-0.5 text-[11px] text-amber-200/70">{instanceOwned ? `This installation allows ${tunnelLimit} active tunnels. Contact your administrator to increase capacity.` : `The ${currentPlan} plan includes ${tunnelLimit} tunnels.`}</p>
          </div>
          {!instanceOwned && <Link to="/$orgSlug/billing" params={{ orgSlug }} className="shrink-0 text-[11px] font-medium text-amber-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300">Upgrade plan</Link>}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-white/[0.09] bg-[#111112]" aria-label="Active tunnels">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
          <div>
            <h2 className="text-[14px] font-medium text-zinc-200">Connected now</h2>
            <p className="mt-0.5 text-[12px] text-zinc-500">New connections appear automatically.</p>
          </div>
          {!isPending && (
            <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums ${tunnels.length ? "border-emerald-400/[0.12] bg-emerald-400/[0.05] text-emerald-300" : "border-white/[0.08] bg-white/[0.03] text-zinc-400"}`}>
              <span className={`size-1.5 rounded-full ${tunnels.length ? "bg-emerald-400" : "bg-zinc-500"}`} aria-hidden="true" />
              {tunnels.length} online
            </span>
          )}
        </div>

        <div className="flex flex-col gap-4 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:max-w-[360px]">
            <SearchField appearance="workspace" label="Search tunnels" placeholder="Name or address" value={searchQuery} onValueChange={setSearchQuery} />
          </div>
          <div className="w-full sm:w-[160px]">
            <Select
              label="Sort by"
              options={sortOptions}
              value={sortBy}
              onValueChange={(value) => {
                if (value === "newest" || value === "oldest" || value === "name") setSortBy(value);
              }}
            />
          </div>
        </div>

        {copyError && (
          <div role="alert" className="flex items-center justify-between gap-3 border-b border-rose-400/[0.12] bg-rose-400/[0.04] px-5 py-3 text-[12px] text-rose-300">
            <span>{copyError}</span>
            <button type="button" onClick={() => setCopyError(null)} className="shrink-0 text-rose-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300">Dismiss</button>
          </div>
        )}
        {error && data && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-400/[0.12] bg-amber-400/[0.04] px-5 py-3 text-[12px] text-amber-200">
            <span>Could not refresh tunnels. Showing the last loaded connections.</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => void refetch()}>Retry</Button>
          </div>
        )}

        {error && !data ? (
          <div role="alert" className="flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center">
            <HugeiconsIcon icon={Alert02Icon} size={24} strokeWidth={1.5} className="text-rose-300" aria-hidden="true" />
            <p className="mt-3 text-[14px] font-medium text-zinc-200">Could not load active tunnels</p>
            <p className="mt-1 text-[12px] text-zinc-500">Check your connection and try again.</p>
            <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => void refetch()}>Try again</Button>
          </div>
        ) : isPending ? (
          <div className="divide-y divide-white/[0.06]" aria-label="Loading active tunnels" aria-busy="true">
            {[0, 1, 2].map((item) => (
              <div key={item} className="flex min-h-20 items-center gap-4 px-5 py-4">
                <span className="size-9 shrink-0 animate-pulse rounded-lg bg-white/[0.05] motion-reduce:animate-none" />
                <span className="min-w-0 flex-1 space-y-2">
                  <span className="block h-3 w-36 max-w-full animate-pulse rounded bg-white/[0.07] motion-reduce:animate-none" />
                  <span className="block h-2.5 w-52 max-w-full animate-pulse rounded bg-white/[0.04] motion-reduce:animate-none" />
                </span>
              </div>
            ))}
          </div>
        ) : filteredTunnels.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center">
            <HugeiconsIcon icon={Route03Icon} size={25} strokeWidth={1.5} className="text-zinc-600" aria-hidden="true" />
            <p className="mt-3 text-[14px] font-medium text-zinc-200">{normalizedSearch ? "No matching tunnels" : "No active tunnels"}</p>
            <p className="mt-1 max-w-sm text-[12px] leading-5 text-zinc-500">
              {normalizedSearch ? "Try another name or address." : "Use New tunnel to connect a service. It will appear here when the CLI connects."}
            </p>
            {normalizedSearch && <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => setSearchQuery("")}>Clear search</Button>}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {filteredTunnels.map((tunnel) => {
              const title = tunnelTitle(tunnel);
              const copied = copiedTunnelId === tunnel.id;
              return (
                <div key={tunnel.id} className="group flex min-w-0 items-center transition-colors hover:bg-white/[0.025] focus-within:bg-white/[0.025] motion-reduce:transition-none">
                  <Link
                    to="/$orgSlug/tunnel/tunnels/$tunnelId"
                    params={{ orgSlug, tunnelId: tunnel.id }}
                    search={{ tab: "overview" }}
                    className="flex min-h-20 min-w-0 flex-1 items-center gap-3 py-4 pl-5 pr-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/50 sm:gap-4"
                    aria-label={`Open tunnel ${title}`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.035] text-zinc-400">
                      <HugeiconsIcon icon={Route03Icon} size={17} strokeWidth={1.7} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-zinc-200 transition-colors group-hover:text-white">{title}</span>
                        <span className="shrink-0 rounded-md border border-white/[0.08] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-zinc-500">{tunnel.protocol}</span>
                      </span>
                      <span className="mt-1 block truncate font-mono text-[12px] text-zinc-500" title={tunnel.url}>{tunnel.url}</span>
                      <span className="mt-1 block text-[11px] text-zinc-500 sm:hidden">Created {createdDate(tunnel)}</span>
                    </span>
                    <span className="hidden shrink-0 text-[12px] text-zinc-500 sm:block">{createdDate(tunnel)}</span>
                    <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.7} className="hidden shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-300 sm:block" aria-hidden="true" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleCopy(tunnel)}
                    aria-label={copied ? `Copied ${title} address` : `Copy ${title} address`}
                    title={copied ? "Copied" : "Copy address"}
                    className={`mr-4 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 ${copied ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300" : "border-white/[0.08] text-zinc-500 hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-zinc-100"}`}
                  >
                    <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={16} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p role="status" className="sr-only">{copiedTunnelId ? "Tunnel address copied." : ""}</p>
      <NewTunnelModal isOpen={isNewTunnelModalOpen} onClose={() => setIsNewTunnelModalOpen(false)} orgSlug={orgSlug} triggerRef={newTunnelTriggerRef} />
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
