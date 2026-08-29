import { createFileRoute, Link } from "@tanstack/react-router";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Activity03Icon,
  Alert02Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  CloudIcon,
  CodeIcon,
  CpuIcon,
  ServerStack01Icon,
  WorkflowSquare06Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import {
  HealthPill,
  ObservabilityPage,
  Panel,
  TimeRangeControl,
  TrendChart,
} from "@/components/observability/observability-ui";
import {
  latencyTrend,
  logs,
  monitors,
  services,
  traces,
  trafficTrend,
  type LogLevel,
  type ObservabilityService,
} from "@/components/observability/mock-data";

export const Route = createFileRoute(
  "/$orgSlug/observability/services_/$serviceId",
)({
  head: () => ({ meta: [{ title: "Service - OutRay Observability" }] }),
  component: ServiceView,
});

const logLevelStyles: Record<LogLevel, string> = {
  debug: "text-zinc-600",
  info: "text-cyan-400",
  warn: "text-amber-400",
  error: "text-rose-400",
};

function ServiceView() {
  const { orgSlug, serviceId } = Route.useParams();
  const service = services.find((item) => item.id === serviceId);

  if (!service) {
    return <ServiceNotFound orgSlug={orgSlug} />;
  }

  const scale = service.requestsPerMinute / 1842;
  const requestValues = trafficTrend.map((value) =>
    Math.round(value * scale * 28),
  );
  const serviceLogs = logs.filter((event) => event.service === service.id);
  const serviceTraces = traces.filter(
    (trace) =>
      trace.rootService === service.id ||
      trace.spans.some((span) => span.service === service.id),
  );
  const relatedMonitors = monitors.filter(
    (monitor) => monitor.service === service.id,
  );
  const dependencies = getDependencies(service.id);

  return (
    <ObservabilityPage>
      <header className="border-b border-white/[0.07] pb-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Link
              to="/$orgSlug/observability/services"
              params={{ orgSlug }}
              className="mb-5 inline-flex items-center gap-2 text-[10px] text-zinc-700 transition-colors hover:text-zinc-300"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.7} />
              All services
            </Link>
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.045] text-zinc-400 ring-1 ring-white/[0.07]">
                <HugeiconsIcon
                  icon={ServerStack01Icon}
                  size={19}
                  strokeWidth={1.7}
                />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="truncate text-2xl font-semibold tracking-[-0.035em] text-white">
                    {service.name}
                  </h1>
                  <HealthPill health={service.health} />
                </div>
                <p className="mt-2 text-xs text-zinc-600">
                  {service.environment} · {service.region} · {service.runtime} · {service.version}
                </p>
              </div>
            </div>
          </div>
          <TimeRangeControl />
        </div>
      </header>

      <section className="grid overflow-hidden rounded-xl border border-white/[0.07] sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-white/[0.07]">
        <ServiceMetric
          icon={Activity03Icon}
          label="Throughput"
          value={`${service.requestsPerMinute.toLocaleString()} rpm`}
          detail="12.4% from previous period"
          tone="violet"
        />
        <ServiceMetric
          icon={Alert02Icon}
          label="Error rate"
          value={`${service.errorRate}%`}
          detail={service.errorRate > 2 ? "Above 2% threshold" : "Within normal range"}
          tone={service.errorRate > 2 ? "rose" : "emerald"}
        />
        <ServiceMetric
          icon={Clock01Icon}
          label="P95 latency"
          value={`${service.p95}ms`}
          detail={`P50 ${Math.round(service.p95 * 0.34)}ms`}
          tone={service.p95 > 700 ? "amber" : "violet"}
        />
        <ServiceMetric
          icon={CheckmarkCircle02Icon}
          label="Availability"
          value={service.health === "critical" ? "98.82%" : service.health === "degraded" ? "99.71%" : "99.98%"}
          detail="30-day rolling SLO"
          tone={service.health === "healthy" ? "emerald" : "amber"}
        />
      </section>

      <div className="grid gap-7 lg:grid-cols-3">
        <Panel
          title="Request volume"
          description="Requests per minute for this service"
          action={<span className="text-[10px] text-zinc-700">Updated now</span>}
          className="lg:col-span-2"
        >
          <TrendChart values={requestValues} />
        </Panel>

        <Panel title="Service details" description="Current runtime context">
          <div className="space-y-5 p-5 sm:p-6">
            <ServiceDetail icon={CodeIcon} label="Runtime" value={service.runtime} />
            <ServiceDetail icon={CloudIcon} label="Region" value={service.region} />
            <ServiceDetail icon={CpuIcon} label="Version" value={service.version} />
            <ServiceDetail icon={ServerStack01Icon} label="Last deploy" value={service.deploy} />
            <div className="border-t border-white/[0.06] pt-5">
              <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-700">
                Resource attributes
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[service.environment, service.region, service.runtime.split(" ")[0].toLowerCase()].map((attribute) => (
                  <span key={attribute} className="rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-1 font-mono text-[9px] text-zinc-600">
                    {attribute}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-7 lg:grid-cols-2">
        <Panel
          title="Dependencies"
          description="Services observed in connected traces"
        >
          <div className="divide-y divide-white/[0.06]">
            {dependencies.map((dependency) => {
              const internalService = services.find(
                (item) => item.id === dependency.name,
              );
              const content = (
                <>
                  <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.035] text-zinc-600">
                    <HugeiconsIcon icon={WorkflowSquare06Icon} size={14} strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-zinc-300">{dependency.name}</p>
                    <p className="mt-1 text-[9px] text-zinc-700">{dependency.type} · {dependency.calls.toLocaleString()} calls</p>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-600">{dependency.latency}ms</span>
                  {internalService && <HugeiconsIcon icon={ArrowRight01Icon} size={13} strokeWidth={1.7} className="text-zinc-800" />}
                </>
              );

              return internalService ? (
                <Link
                  key={dependency.name}
                  to="/$orgSlug/observability/services/$serviceId"
                  params={{ orgSlug, serviceId: internalService.id }}
                  className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-white/[0.02] sm:px-6"
                >
                  {content}
                </Link>
              ) : (
                <div key={dependency.name} className="flex items-center gap-3 px-5 py-4 sm:px-6">
                  {content}
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Latency profile" description="Percentile trend for this service">
          <div className="space-y-5 p-5 sm:p-6">
            {[
              ["P50", Math.round(service.p95 * 0.34), "bg-emerald-400/65"],
              ["P75", Math.round(service.p95 * 0.58), "bg-cyan-400/65"],
              ["P90", Math.round(service.p95 * 0.82), "bg-violet-400/65"],
              ["P95", service.p95, service.p95 > 700 ? "bg-amber-400/70" : "bg-violet-400/70"],
              ["P99", Math.round(service.p95 * 1.72), "bg-rose-400/65"],
            ].map(([label, value, color]) => (
              <div key={label} className="grid grid-cols-[34px_minmax(0,1fr)_65px] items-center gap-3">
                <span className="text-[9px] text-zinc-700">{label}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, (Number(value) / (service.p95 * 1.72)) * 100)}%` }} />
                </div>
                <span className="text-right font-mono text-[9px] text-zinc-500">{value}ms</span>
              </div>
            ))}
            <div className="border-t border-white/[0.06] pt-5">
              <TrendChart
                values={latencyTrend.map((value) => Math.round(value * (service.p95 / 486)))}
                tone={service.p95 > 700 ? "amber" : "violet"}
                labels={["-60m", "-50m", "-40m", "-30m", "-20m", "-10m", "Now"]}
              />
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Recent traces"
        description={`${serviceTraces.length} traces touching this service`}
        action={
          <Link to="/$orgSlug/observability/traces" params={{ orgSlug }} className="text-[10px] text-zinc-600 transition-colors hover:text-zinc-300">
            View all
          </Link>
        }
      >
        <div className="hidden grid-cols-[minmax(0,1fr)_150px_100px_90px_24px] gap-4 border-b border-white/[0.06] px-5 py-3 text-[9px] uppercase tracking-[0.08em] text-zinc-700 sm:px-6 lg:grid">
          <span>Trace</span><span>Root service</span><span>Started</span><span>Duration</span><span />
        </div>
        <div className="divide-y divide-white/[0.055]">
          {serviceTraces.map((trace) => (
            <Link
              key={trace.id}
              to="/$orgSlug/observability/traces"
              params={{ orgSlug }}
              className="grid gap-3 px-5 py-4 transition-colors hover:bg-white/[0.02] sm:px-6 lg:grid-cols-[minmax(0,1fr)_150px_100px_90px_24px] lg:items-center lg:gap-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className={`size-1.5 shrink-0 rounded-full ${trace.status === "error" ? "bg-rose-400" : "bg-emerald-400"}`} />
                <div className="min-w-0">
                  <p className="truncate font-mono text-[10px] text-zinc-300">{trace.name}</p>
                  <p className="mt-1 truncate font-mono text-[9px] text-zinc-800">{trace.id}</p>
                </div>
              </div>
              <span className="text-[10px] text-zinc-500">{trace.rootService}</span>
              <span className="font-mono text-[9px] text-zinc-700">{trace.startedAt}</span>
              <span className={`font-mono text-[10px] ${trace.duration > 1000 ? "text-amber-400" : "text-zinc-500"}`}>{formatDuration(trace.duration)}</span>
              <HugeiconsIcon icon={ArrowRight01Icon} size={13} strokeWidth={1.7} className="hidden text-zinc-800 lg:block" />
            </Link>
          ))}
        </div>
      </Panel>

      <div className="grid gap-7 lg:grid-cols-3">
        <Panel
          title="Recent logs"
          description={`Latest events from ${service.name}`}
          className="lg:col-span-2"
          action={
            <Link to="/$orgSlug/observability/logs" params={{ orgSlug }} className="text-[10px] text-zinc-600 transition-colors hover:text-zinc-300">
              Explore logs
            </Link>
          }
        >
          <div className="divide-y divide-white/[0.055] font-mono">
            {serviceLogs.map((event) => (
              <Link
                key={event.id}
                to="/$orgSlug/observability/logs"
                params={{ orgSlug }}
                className="grid gap-2 px-5 py-4 transition-colors hover:bg-white/[0.02] sm:grid-cols-[82px_62px_minmax(0,1fr)] sm:items-center sm:px-6"
              >
                <span className="text-[9px] text-zinc-700">{event.timestamp}</span>
                <span className={`text-[9px] uppercase ${logLevelStyles[event.level]}`}>{event.level}</span>
                <span className="truncate text-[10px] text-zinc-300">{event.message}</span>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel title="Monitors" description="Rules scoped to this service">
          {relatedMonitors.length ? (
            <div className="divide-y divide-white/[0.06]">
              {relatedMonitors.map((monitor) => (
                <Link
                  key={monitor.name}
                  to="/$orgSlug/observability/monitors"
                  params={{ orgSlug }}
                  className="block px-5 py-5 transition-colors hover:bg-white/[0.02] sm:px-6"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-medium text-zinc-300">{monitor.name}</p>
                    <span className={`size-1.5 rounded-full ${monitor.state === "firing" ? "bg-rose-400" : "bg-emerald-400"}`} />
                  </div>
                  <p className="mt-2 font-mono text-[9px] text-zinc-700">{monitor.query}</p>
                  <p className="mt-2 text-[9px] text-zinc-800">Changed {monitor.changed}</p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center sm:px-6">
              <p className="text-[11px] text-zinc-500">No service monitors</p>
              <Link to="/$orgSlug/observability/monitors" params={{ orgSlug }} className="mt-2 inline-block text-[10px] text-violet-400">Create a monitor</Link>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Deployments" description="Recent versions correlated with telemetry changes">
        <div className="divide-y divide-white/[0.055]">
          {getDeployments(service).map((deployment, index) => (
            <div key={deployment.version} className="grid gap-3 px-5 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_150px_120px_90px] md:items-center">
              <div className="flex items-center gap-3">
                <span className={`size-1.5 rounded-full ${index === 0 ? "bg-emerald-400" : "bg-zinc-700"}`} />
                <div>
                  <p className="font-mono text-[10px] text-zinc-300">{deployment.version}</p>
                  <p className="mt-1 text-[9px] text-zinc-700">{deployment.commit}</p>
                </div>
              </div>
              <span className="text-[10px] text-zinc-600">{deployment.author}</span>
              <span className="text-[10px] text-zinc-700">{deployment.when}</span>
              <span className={`text-[9px] ${deployment.impact === "Stable" ? "text-emerald-400" : "text-amber-400"}`}>{deployment.impact}</span>
            </div>
          ))}
        </div>
      </Panel>
    </ObservabilityPage>
  );
}

function ServiceMetric({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: IconSvgElement;
  label: string;
  value: string;
  detail: string;
  tone: "violet" | "emerald" | "amber" | "rose";
}) {
  const toneStyles = {
    violet: "bg-violet-400/[0.08] text-violet-300",
    emerald: "bg-emerald-400/[0.08] text-emerald-300",
    amber: "bg-amber-400/[0.08] text-amber-300",
    rose: "bg-rose-400/[0.08] text-rose-300",
  };

  return (
    <div className="min-w-0 px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-700">{label}</p>
          <p className="mt-2.5 text-xl font-semibold tracking-[-0.035em] text-zinc-100">{value}</p>
        </div>
        <span className={`flex size-8 items-center justify-center rounded-lg ${toneStyles[tone]}`}>
          <HugeiconsIcon icon={icon} size={15} strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-3 text-[9px] text-zinc-700">{detail}</p>
    </div>
  );
}

function ServiceDetail({ icon, label, value }: { icon: IconSvgElement; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.035] text-zinc-600">
        <HugeiconsIcon icon={icon} size={14} strokeWidth={1.7} />
      </span>
      <div>
        <p className="text-[9px] uppercase tracking-[0.08em] text-zinc-700">{label}</p>
        <p className="mt-1 text-[11px] text-zinc-400">{value}</p>
      </div>
    </div>
  );
}

function ServiceNotFound({ orgSlug }: { orgSlug: string }) {
  return (
    <ObservabilityPage>
      <div className="flex min-h-[520px] items-center justify-center rounded-xl border border-white/[0.07]">
        <div className="max-w-sm px-6 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-white/[0.04] text-zinc-600">
            <HugeiconsIcon icon={ServerStack01Icon} size={18} strokeWidth={1.7} />
          </span>
          <h1 className="mt-5 text-lg font-semibold text-zinc-200">Service not found</h1>
          <p className="mt-2 text-xs leading-5 text-zinc-600">This service is not reporting telemetry or no longer exists.</p>
          <Link to="/$orgSlug/observability/services" params={{ orgSlug }} className="mt-5 inline-flex h-9 items-center rounded-lg bg-white px-4 text-[10px] font-medium text-black">
            Back to services
          </Link>
        </div>
      </div>
    </ObservabilityPage>
  );
}

function getDependencies(serviceId: string) {
  const connected = new Set<string>();
  traces
    .filter(
      (trace) =>
        trace.rootService === serviceId ||
        trace.spans.some((span) => span.service === serviceId),
    )
    .forEach((trace) => {
      if (trace.rootService !== serviceId) connected.add(trace.rootService);
      trace.spans.forEach((span) => {
        if (span.service !== serviceId) connected.add(span.service);
      });
    });

  if (!connected.size) {
    connected.add("postgres");
    connected.add("redis");
  }

  return Array.from(connected).slice(0, 5).map((name, index) => ({
    name,
    type: services.some((service) => service.id === name) ? "Internal service" : "External dependency",
    calls: Math.max(24, 842 - index * 137),
    latency: 28 + index * 37,
  }));
}

function getDeployments(service: ObservabilityService) {
  const majorVersion = service.version.replace("-rc.2", "");
  return [
    { version: service.version, commit: "4d8a19f · improve request handling", author: "Ayo Balogun", when: service.deploy, impact: "Stable" },
    { version: `${majorVersion}-prev.1`, commit: "908cc21 · update telemetry context", author: "Mira Okafor", when: "3 days ago", impact: "Stable" },
    { version: `${majorVersion}-prev.2`, commit: "f1842ab · tune connection pool", author: "Ayo Balogun", when: "8 days ago", impact: service.health === "healthy" ? "Stable" : "Watch" },
  ];
}

function formatDuration(duration: number) {
  return duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`;
}
