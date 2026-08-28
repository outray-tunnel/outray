import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { appClient } from "@/lib/app-client";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function BandwidthUsage() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const { data, isLoading } = useQuery({
    queryKey: ["bandwidth", orgSlug],
    queryFn: async () => {
      if (!orgSlug) return null;
      return await appClient.stats.bandwidth(orgSlug);
    },
    enabled: !!orgSlug,
  });

  if (isLoading || !data) {
    return <div className="h-28 animate-pulse border-y border-white/[0.06] bg-white/[0.015]" />;
  }
  if ("error" in data) return null;

  const { usage, limit, percentage } = data;

  return (
    <section className="border-y border-white/[0.07] py-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-zinc-300">Bandwidth</h3>
          <p className="mt-1 text-[11px] text-zinc-600">Current billing period</p>
        </div>
        <span className="font-mono text-[11px] text-zinc-500">
          {formatBytes(usage)} / {formatBytes(limit)}
        </span>
      </div>
      <div className="h-px bg-white/[0.08]">
        <div
          className={`h-full transition-[width] duration-500 ${
            percentage > 90
              ? "bg-red-500"
              : percentage > 75
                ? "bg-amber-500"
                : "bg-accent"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-zinc-700">
        <span>{percentage.toFixed(1)}% used</span>
        <span>Resets next month</span>
      </div>
    </section>
  );
}
