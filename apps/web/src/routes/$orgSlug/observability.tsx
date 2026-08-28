import { createFileRoute } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Activity03Icon,
  Analytics03Icon,
  Clock01Icon,
  LogsIcon,
  WorkflowSquare06Icon,
} from "@hugeicons-pro/core-stroke-rounded";

export const Route = createFileRoute("/$orgSlug/observability")({
  head: () => ({
    meta: [{ title: "Observability - OutRay" }],
  }),
  component: ObservabilityView,
});

const summary = [
  { label: "Events ingested", value: "0", detail: "Last 24 hours" },
  { label: "Error rate", value: "0.00%", detail: "No incidents" },
  { label: "P95 latency", value: "—", detail: "Waiting for data" },
  { label: "Active sources", value: "0", detail: "Connect a service" },
];

const signals = [
  {
    name: "Metrics",
    description: "Service health, latency, throughput, and custom measurements.",
    icon: Activity03Icon,
  },
  {
    name: "Logs",
    description: "Search structured events across every connected environment.",
    icon: LogsIcon,
  },
  {
    name: "Traces",
    description: "Follow requests across services and find slow dependencies.",
    icon: WorkflowSquare06Icon,
  },
];

function ObservabilityView() {
  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <header className="flex flex-col gap-5 border-b border-white/[0.07] pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-4 flex items-center gap-2 text-accent">
            <HugeiconsIcon
              icon={Analytics03Icon}
              size={17}
              strokeWidth={1.7}
              aria-hidden="true"
            />
            <span className="text-[10px] font-medium uppercase tracking-[0.12em]">
              Preview
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-white">
            Observability
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
            One place to understand application health, investigate failures,
            and follow every request from edge to origin.
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs text-zinc-600">
          <HugeiconsIcon
            icon={Clock01Icon}
            size={14}
            strokeWidth={1.7}
            aria-hidden="true"
          />
          Live ingestion is coming soon
        </p>
      </header>

      <section
        className="grid border-y border-white/[0.07] sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-white/[0.07]"
        aria-label="Observability summary"
      >
        {summary.map((item) => (
          <div key={item.label} className="px-1 py-5 lg:px-6 first:pl-1">
            <p className="text-[11px] text-zinc-600">{item.label}</p>
            <p className="mt-2 text-2xl font-medium tracking-[-0.04em] text-zinc-200">
              {item.value}
            </p>
            <p className="mt-1 text-[11px] text-zinc-700">{item.detail}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-5">
          <h2 className="text-sm font-medium text-zinc-200">Telemetry signals</h2>
          <p className="mt-1 text-xs text-zinc-600">
            The first set of signals planned for the Observability preview.
          </p>
        </div>
        <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
          {signals.map((signal) => (
            <div
              key={signal.name}
              className="flex items-start gap-4 py-5"
            >
              <span className="mt-0.5 text-zinc-500">
                <HugeiconsIcon
                  icon={signal.icon}
                  size={17}
                  strokeWidth={1.7}
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-zinc-300">
                  {signal.name}
                </h3>
                <p className="mt-1 text-xs leading-5 text-zinc-600">
                  {signal.description}
                </p>
              </div>
              <span className="rounded-full bg-white/[0.04] px-2 py-1 text-[9px] uppercase tracking-[0.09em] text-zinc-700">
                Soon
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
