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
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["bandwidth", orgSlug],
    queryFn: async () => {
      if (!orgSlug) return null;
      return await appClient.stats.bandwidth(orgSlug);
    },
    enabled: !!orgSlug,
  });

  if (isLoading) {
    return (
      <div
        className="h-44 animate-pulse rounded-xl border border-white/[0.08] bg-white/[0.02] motion-reduce:animate-none"
        aria-label="Loading billing usage"
        aria-busy="true"
      />
    );
  }
  if (error || !data || "error" in data) {
    return (
      <section className="rounded-xl border border-white/[0.08] bg-[#111112] px-5 py-4">
        <h3 className="text-[13px] font-medium text-zinc-200">Plan usage</h3>
        <p className="mt-2 text-[11px] text-zinc-500">
          Could not load billing-period transfer.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 text-[11px] text-zinc-300 underline underline-offset-4 hover:text-white"
        >
          Retry
        </button>
      </section>
    );
  }

  const { usage, limit, percentage } = data;

  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
      <div className="border-b border-white/[0.07] px-5 py-4">
        <div>
          <h3 className="text-[13px] font-medium text-zinc-200">Plan usage</h3>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Current billing period
          </p>
        </div>
      </div>
      <div className="px-5 py-5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[18px] font-normal tabular-nums text-zinc-100">
            {formatBytes(usage)}
          </span>
          <span className="text-[11px] tabular-nums text-zinc-500">
            of {formatBytes(limit)}
          </span>
        </div>
        <div
          className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.08]"
          role="progressbar"
          aria-label="Bandwidth used this billing period"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${percentage > 90 ? "bg-rose-400" : percentage > 75 ? "bg-amber-400" : "bg-zinc-200"}`}
            style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] tabular-nums text-zinc-500">
          {percentage.toFixed(1)}% of your monthly allowance
        </p>
      </div>
    </section>
  );
}
