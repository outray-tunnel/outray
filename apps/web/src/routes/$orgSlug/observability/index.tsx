import { createFileRoute, Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Activity03Icon,
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Pulse02Icon,
  ServerStack01Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import {
  Freshness,
  HealthPill,
  KpiCard,
  ObservabilityHeader,
  ObservabilityPage,
  Panel,
  TimeRangeControl,
  TrendChart,
} from "@/components/observability/observability-ui";
import {
  errorTrend,
  latencyTrend,
  monitors,
  services,
  trafficTrend,
} from "@/components/observability/mock-data";

export const Route = createFileRoute("/$orgSlug/observability/")({
  head: () => ({ meta: [{ title: "Observability - OutRay" }] }),
  component: ObservabilityOverview,
});

function ObservabilityOverview() {
  const { orgSlug } = Route.useParams();
  const unhealthyServices = services.filter(
    (service) => service.health !== "healthy",
  );

  return (
    <ObservabilityPage>
      <ObservabilityHeader
        title="Overview"
        description="Application health, performance, and active incidents across every connected service."
        action={<TimeRangeControl />}
      />

      <section className="grid overflow-hidden rounded-xl border border-white/[0.07] sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-white/[0.07]">
        <KpiCard
          label="Requests"
          value="2.84M"
          detail="versus previous period"
          change="12.4%"
          icon={Pulse02Icon}
          trend={trafficTrend}
        />
        <KpiCard
          label="Error rate"
          value="0.73%"
          detail="versus previous period"
          change="0.18%"
          direction="down"
          icon={Alert02Icon}
          tone="rose"
          trend={errorTrend}
        />
        <KpiCard
          label="P95 latency"
          value="486ms"
          detail="across all services"
          change="8.1%"
          direction="down"
          icon={Clock01Icon}
          tone="amber"
          trend={latencyTrend}
        />
        <KpiCard
          label="Availability"
          value="99.97%"
          detail="30-day rolling SLO"
          change="0.04%"
          icon={CheckmarkCircle02Icon}
          tone="emerald"
          trend={trafficTrend.map((value, index) => 98 + value / 100 + index / 300)}
        />
      </section>

      <div className="grid gap-7 lg:grid-cols-3">
        <Panel
          title="Request volume"
          description="Requests per minute across all production services"
          action={<Freshness />}
          className="lg:col-span-2"
        >
          <div className="flex items-center gap-5 px-5 pt-5 text-[10px] sm:px-6">
            <span className="flex items-center gap-2 text-zinc-500">
              <span className="size-1.5 rounded-full bg-violet-400" />
              Total traffic
            </span>
            <span className="text-zinc-700">Peak 5,814 rpm</span>
          </div>
          <TrendChart values={trafficTrend} />
        </Panel>

        <Panel
          title="Service health"
          description={`${services.length} reporting services`}
          action={
            <Link
              to="/$orgSlug/observability/services"
              params={{ orgSlug }}
              className="text-[10px] text-zinc-600 transition-colors hover:text-zinc-300"
            >
              View all
            </Link>
          }
        >
          <div className="divide-y divide-white/[0.06]">
            {services.slice(0, 5).map((service) => (
              <Link
                key={service.id}
                to="/$orgSlug/observability/services/$serviceId"
                params={{ orgSlug, serviceId: service.id }}
                className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-white/[0.02] sm:px-6"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.035] text-zinc-600">
                  <HugeiconsIcon
                    icon={ServerStack01Icon}
                    size={15}
                    strokeWidth={1.7}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-zinc-300">
                    {service.name}
                  </p>
                  <p className="mt-1 text-[9px] text-zinc-700">
                    {service.p95}ms p95 · {service.requestsPerMinute.toLocaleString()} rpm
                  </p>
                </div>
                <HealthPill health={service.health} />
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-7 lg:grid-cols-2">
        <Panel title="Active incidents" description="Issues requiring attention">
          <div className="divide-y divide-white/[0.06]">
            {monitors
              .filter((monitor) => monitor.state === "firing")
              .map((monitor) => (
                <Link
                  key={monitor.name}
                  to="/$orgSlug/observability/monitors"
                  params={{ orgSlug }}
                  className="flex items-center gap-4 px-5 py-5 transition-colors hover:bg-white/[0.02] sm:px-6"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-rose-400/[0.08] text-rose-400">
                    <HugeiconsIcon icon={Alert02Icon} size={15} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-zinc-300">
                      {monitor.name}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-700">
                      {monitor.service} · {monitor.changed}
                    </p>
                  </div>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={14}
                    strokeWidth={1.7}
                    className="text-zinc-800"
                  />
                </Link>
              ))}
          </div>
        </Panel>

        <Panel title="Needs attention" description="Services outside their normal baseline">
          <div className="divide-y divide-white/[0.06]">
            {unhealthyServices.map((service) => (
              <Link
                key={service.id}
                to="/$orgSlug/observability/services/$serviceId"
                params={{ orgSlug, serviceId: service.id }}
                className="block px-5 py-5 transition-colors hover:bg-white/[0.02] sm:px-6"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <HugeiconsIcon
                      icon={Activity03Icon}
                      size={15}
                      strokeWidth={1.7}
                      className="text-zinc-600"
                    />
                    <div>
                      <p className="text-[12px] font-medium text-zinc-300">
                        {service.name}
                      </p>
                      <p className="mt-1 text-[10px] text-zinc-700">
                        Error rate {service.errorRate}% · p95 {service.p95}ms
                      </p>
                    </div>
                  </div>
                  <HealthPill health={service.health} />
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </ObservabilityPage>
  );
}
