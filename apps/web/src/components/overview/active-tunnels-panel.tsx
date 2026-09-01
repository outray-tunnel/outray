import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowUpRight01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowUpRight01Icon";
import Route03Icon from "@hugeicons-pro/core-stroke-rounded/Route03Icon";
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
    <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.07] p-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-zinc-300">Active tunnels</h3>
          <p className="mt-1 text-[11px] text-zinc-600">Recent connections</p>
        </div>
        <span className="text-[11px] tabular-nums text-zinc-700">
          {activeTunnels.length} online
        </span>
      </div>

      <div className="flex-1 divide-y divide-white/[0.06] overflow-y-auto">
        {!hasTunnels ? (
          <div className="flex h-full min-h-36 flex-col items-center justify-center py-8 text-center text-zinc-700">
            <HugeiconsIcon
              icon={Route03Icon}
              size={24}
              strokeWidth={1.5}
              className="mb-3"
              aria-hidden="true"
            />
            <p className="text-xs">No active tunnels</p>
            <Link
              to="/$orgSlug/tunnels"
              className="mt-2 text-[11px] text-zinc-500 hover:text-white"
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
              className="group flex items-center gap-3 py-3 text-xs transition-colors hover:text-white"
              search={{ tab: "overview" }}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  tunnel.isOnline ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              <span className="min-w-0 flex-1 truncate text-zinc-400">
                {tunnel.name || tunnel.id}
              </span>
              <span className="truncate font-mono text-[10px] text-zinc-700">
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

      {hasTunnels && (
        <Link
          to="/$orgSlug/tunnels"
          className="mt-3 flex items-center gap-1.5 pt-3 text-[11px] text-zinc-600 transition-colors hover:text-zinc-300"
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
