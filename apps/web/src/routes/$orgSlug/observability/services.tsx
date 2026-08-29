import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Search01Icon,
  ServerStack01Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import {
  HealthPill,
  ObservabilityHeader,
  ObservabilityPage,
  Panel,
  Sparkline,
  TimeRangeControl,
} from "@/components/observability/observability-ui";
import {
  latencyTrend,
  services,
} from "@/components/observability/mock-data";

export const Route = createFileRoute("/$orgSlug/observability/services")({
  head: () => ({ meta: [{ title: "Services - OutRay Observability" }] }),
  component: ServicesView,
});

function ServicesView() {
  const { orgSlug } = Route.useParams();
  const [query, setQuery] = useState("");
  const [environment, setEnvironment] = useState("all");

  const visibleServices = useMemo(
    () =>
      services.filter(
        (service) =>
          service.name.toLowerCase().includes(query.toLowerCase()) &&
          (environment === "all" || service.environment === environment),
      ),
    [environment, query],
  );

  return (
    <ObservabilityPage>
      <ObservabilityHeader
        title="Services"
        description="Health, throughput, latency, and deployment context for every reporting service."
        action={<TimeRangeControl />}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex h-10 w-full max-w-md items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-zinc-600 focus-within:border-white/[0.16] focus-within:text-zinc-400">
          <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.7} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a service"
            className="min-w-0 flex-1 bg-transparent text-xs text-zinc-300 outline-none placeholder:text-zinc-700"
          />
        </label>
        <div className="flex items-center gap-2">
          {["all", "production", "staging"].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setEnvironment(value)}
              className={`h-9 rounded-lg border px-3 text-[10px] capitalize transition-colors ${
                environment === value
                  ? "border-white/[0.12] bg-white/[0.08] text-zinc-200"
                  : "border-white/[0.06] text-zinc-700 hover:text-zinc-400"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Panel>
          <div className="hidden grid-cols-[minmax(0,1fr)_120px_100px_100px_100px_24px] gap-4 border-b border-white/[0.07] px-5 py-3 text-[9px] font-medium uppercase tracking-[0.09em] text-zinc-700 sm:px-6 lg:grid">
            <span>Service</span>
            <span>Health</span>
            <span>Throughput</span>
            <span>Errors</span>
            <span>Latency p95</span>
            <span />
          </div>
          <div className="divide-y divide-white/[0.06]">
            {visibleServices.map((service) => (
              <Link
                key={service.id}
                to="/$orgSlug/observability/services/$serviceId"
                params={{ orgSlug, serviceId: service.id }}
                className="grid w-full gap-4 px-5 py-5 text-left transition-colors hover:bg-white/[0.02] sm:px-6 lg:grid-cols-[minmax(0,1fr)_120px_100px_100px_100px_24px] lg:items-center"
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-zinc-500 ring-1 ring-white/[0.06]">
                    <HugeiconsIcon icon={ServerStack01Icon} size={16} strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-zinc-200">
                      {service.name}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-zinc-700">
                      {service.runtime} · {service.version} · {service.region}
                    </p>
                  </div>
                </div>
                <HealthPill health={service.health} />
                <div>
                  <p className="text-[11px] tabular-nums text-zinc-400">
                    {service.requestsPerMinute.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[9px] text-zinc-700">rpm</p>
                </div>
                <p className={`text-[11px] tabular-nums ${service.errorRate > 2 ? "text-rose-400" : "text-zinc-500"}`}>
                  {service.errorRate}%
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-[11px] tabular-nums ${service.p95 > 700 ? "text-amber-400" : "text-zinc-500"}`}>
                    {service.p95}ms
                  </span>
                  <Sparkline
                    values={latencyTrend.slice(0, 10).map((value) => value * (service.p95 / 486))}
                    tone={service.health === "healthy" ? "emerald" : service.health === "degraded" ? "amber" : "rose"}
                    width={54}
                    height={22}
                  />
                </div>
                <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.7} className="hidden text-zinc-800 lg:block" />
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </ObservabilityPage>
  );
}
