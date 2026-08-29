import { HugeiconsIcon } from "@hugeicons/react";
import {
  Activity03Icon,
  Globe02Icon,
  Route03Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import { formatBytes, formatNumber } from "./format";

export type OverviewStats = {
  totalRequests: number;
  requestsChange?: number;
  activeTunnels?: number | null;
  activeTunnelsChange?: number;
  totalDataTransfer: number;
  dataTransferChange?: number;
};

export function StatsSummary({ stats }: { stats?: OverviewStats | null }) {
  const items = [
    {
      label: "Total requests",
      value: formatNumber(stats?.totalRequests || 0),
      detail: "Across all tunnels",
      icon: Activity03Icon,
    },
    {
      label: "Active tunnels",
      value: (stats?.activeTunnels ?? 0).toString(),
      detail: "Currently connected",
      icon: Route03Icon,
    },
    {
      label: "Data transfer",
      value: formatBytes(stats?.totalDataTransfer || 0),
      detail: "Current billing period",
      icon: Globe02Icon,
    },
  ];

  return (
    <section className="grid overflow-hidden rounded-xl border border-white/[0.07] md:grid-cols-3 md:divide-x md:divide-white/[0.07]">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-start gap-4 border-b border-white/[0.07] px-6 py-6 last:border-b-0 md:border-b-0"
        >
          <span className="mt-0.5 text-zinc-600">
            <HugeiconsIcon
              icon={item.icon}
              size={17}
              strokeWidth={1.7}
              aria-hidden="true"
            />
          </span>
          <div>
            <p className="text-[11px] text-zinc-600">{item.label}</p>
            <p className="mt-1.5 text-2xl font-medium tracking-[-0.04em] text-zinc-200">
              {item.value}
            </p>
            <p className="mt-1 text-[10px] text-zinc-700">{item.detail}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
