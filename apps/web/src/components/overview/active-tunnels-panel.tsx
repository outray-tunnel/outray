import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowUpRight01Icon from "@outray/icons/stroke/ArrowUpRight01Icon";
import { RefreshCw } from "lucide-react";
import { type Tunnel } from "@/lib/app-client";

export function ActiveTunnelsPanel({
  activeTunnels,
  orgSlug,
  isLoading = false,
  error,
  onRetry,
}: {
  activeTunnels: Tunnel[];
  orgSlug: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const hasTunnels = activeTunnels.length > 0;

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
      <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
        <div>
          <h3 className="text-[13px] font-medium text-zinc-200">
            Online tunnels
          </h3>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Currently connected
          </p>
        </div>
        {!error && !isLoading && (
          <span className="text-[11px] tabular-nums text-zinc-400">
            {activeTunnels.length} online
          </span>
        )}
      </div>

      <div className="flex-1 divide-y divide-white/[0.06] px-5">
        {error ? (
          <div
            className="flex min-h-32 flex-col items-start justify-center py-5 text-[12px] text-zinc-400"
            role="alert"
          >
            <p>Could not load online tunnels.</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 inline-flex items-center gap-1.5 text-zinc-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <RefreshCw size={12} aria-hidden="true" /> Retry
              </button>
            )}
          </div>
        ) : isLoading ? (
          <div
            className="space-y-3 py-5"
            aria-label="Loading online tunnels"
            aria-busy="true"
          >
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-8 animate-pulse rounded bg-white/[0.035] motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : !hasTunnels ? (
          <div className="flex min-h-32 flex-col items-start justify-center py-5">
            <p className="text-[12px] text-zinc-300">No tunnels online</p>
            <Link
              to="/$orgSlug/tunnel/tunnels"
              className="mt-1 text-[11px] text-zinc-500 hover:text-white"
              params={{ orgSlug }}
            >
              View all tunnels
            </Link>
          </div>
        ) : (
          activeTunnels.slice(0, 5).map((tunnel) => (
            <Link
              key={tunnel.id}
              to="/$orgSlug/tunnel/tunnels/$tunnelId"
              params={{ orgSlug, tunnelId: tunnel.id }}
              className="group flex min-h-12 items-center gap-3 py-3 text-xs transition-colors hover:text-white"
              search={{ tab: "overview" }}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  tunnel.isOnline ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              <span className="min-w-0 flex-1 truncate text-zinc-300">
                {tunnel.name || tunnel.id}
              </span>
              <span className="hidden max-w-[40%] truncate font-mono text-[10px] text-zinc-600 sm:block">
                {tunnel.url}
              </span>
              <HugeiconsIcon
                icon={ArrowUpRight01Icon}
                size={12}
                strokeWidth={1.7}
                className="text-zinc-700 group-hover:text-zinc-400"
                aria-hidden="true"
              />
            </Link>
          ))
        )}
      </div>

      {hasTunnels && !error && !isLoading && (
        <Link
          to="/$orgSlug/tunnel/tunnels"
          className="flex min-h-11 items-center gap-1.5 border-t border-white/[0.07] px-5 text-[11px] text-zinc-500 transition-colors hover:text-zinc-200"
          params={{ orgSlug }}
        >
          View all tunnels
          <HugeiconsIcon
            icon={ArrowUpRight01Icon}
            size={12}
            strokeWidth={1.7}
            aria-hidden="true"
          />
        </Link>
      )}
    </section>
  );
}
