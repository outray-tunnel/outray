import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Alert02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  MoreHorizontalIcon,
  Notification02Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import {
  ObservabilityHeader,
  ObservabilityPage,
  Panel,
} from "@/components/observability/observability-ui";
import { monitors, services } from "@/components/observability/mock-data";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";

export const Route = createFileRoute("/$orgSlug/observability/monitors")({
  head: () => ({ meta: [{ title: "Monitors - OutRay Observability" }] }),
  component: MonitorsView,
});

function MonitorsView() {
  const [isCreating, setIsCreating] = useState(false);
  const firing = monitors.filter((monitor) => monitor.state === "firing").length;

  return (
    <ObservabilityPage>
      <ObservabilityHeader
        title="Monitors"
        description="Define reliability thresholds, track incidents, and route notifications to the right responders."
        action={
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-[11px] font-medium text-black hover:bg-zinc-200"
          >
            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.9} />
            New monitor
          </button>
        }
      />

      <section className="grid overflow-hidden rounded-xl border border-white/[0.07] sm:grid-cols-3 sm:divide-x sm:divide-white/[0.07]">
        {[
          ["Firing", String(firing), "Needs attention", "text-rose-400"],
          ["Healthy", String(monitors.length - firing), "Within threshold", "text-emerald-400"],
          ["Mean time to resolve", "18m", "Last 30 days", "text-zinc-200"],
        ].map(([label, value, detail, color]) => (
          <div key={label} className="px-5 py-5 sm:px-6">
            <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-700">{label}</p>
            <p className={`mt-2 text-2xl font-semibold tracking-[-0.04em] ${color}`}>{value}</p>
            <p className="mt-1 text-[10px] text-zinc-700">{detail}</p>
          </div>
        ))}
      </section>

      <Panel title="All monitors" description={`${monitors.length} active monitor rules`}>
        <div className="hidden grid-cols-[minmax(0,1fr)_160px_180px_110px_32px] gap-4 border-b border-white/[0.07] px-5 py-3 text-[9px] uppercase tracking-[0.08em] text-zinc-700 sm:px-6 lg:grid">
          <span>Monitor</span><span>Service</span><span>Condition</span><span>State</span><span />
        </div>
        <div className="divide-y divide-white/[0.06]">
          {monitors.map((monitor) => (
            <div key={monitor.name} className="grid gap-3 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_160px_180px_110px_32px] lg:items-center lg:gap-4">
              <div className="flex min-w-0 items-center gap-3.5">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${monitor.state === "firing" ? "bg-rose-400/[0.08] text-rose-400" : "bg-emerald-400/[0.07] text-emerald-400"}`}>
                  <HugeiconsIcon icon={monitor.state === "firing" ? Alert02Icon : CheckmarkCircle02Icon} size={16} strokeWidth={1.8} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-zinc-300">{monitor.name}</p>
                  <p className="mt-1 text-[10px] text-zinc-700">Changed {monitor.changed}</p>
                </div>
              </div>
              <span className="text-[10px] text-zinc-500">{monitor.service}</span>
              <code className="truncate text-[9px] text-zinc-600">{monitor.query}</code>
              <span className={`flex items-center gap-2 text-[10px] capitalize ${monitor.state === "firing" ? "text-rose-400" : "text-emerald-400"}`}>
                <span className="size-1.5 rounded-full bg-current" />
                {monitor.state}
              </span>
              <button type="button" className="flex size-8 items-center justify-center rounded-lg text-zinc-700 hover:bg-white/[0.05] hover:text-zinc-300" aria-label={`Actions for ${monitor.name}`}>
                <HugeiconsIcon icon={MoreHorizontalIcon} size={15} strokeWidth={1.7} />
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-7 lg:grid-cols-2">
        <Panel title="Incident timeline" description="Recent monitor state changes">
          <div className="divide-y divide-white/[0.06]">
            {[
              ["Checkout error rate entered firing", "12 min ago", "rose"],
              ["Payment worker latency entered firing", "28 min ago", "rose"],
              ["API availability recovered", "4 days ago", "emerald"],
              ["Identity saturation recovered", "9 days ago", "emerald"],
            ].map(([label, time, tone]) => (
              <div key={label} className="flex items-center gap-4 px-5 py-4 sm:px-6">
                <span className={`size-2 shrink-0 rounded-full ${tone === "rose" ? "bg-rose-400" : "bg-emerald-400"}`} />
                <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-400">{label}</span>
                <span className="text-[9px] text-zinc-700">{time}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Notification routes" description="Where alerts are delivered">
          <div className="space-y-3 p-5 sm:p-6">
            <NotificationRoute name="Production incidents" destination="#incidents" detail="Slack · Immediate" />
            <NotificationRoute name="Critical escalation" destination="on-call@outray.app" detail="Email · After 10 minutes" />
            <NotificationRoute name="Weekly reliability digest" destination="engineering@outray.app" detail="Email · Mondays" />
          </div>
        </Panel>
      </div>

      <CreateMonitorModal isOpen={isCreating} onClose={() => setIsCreating(false)} />
    </ObservabilityPage>
  );
}
function NotificationRoute({ name, destination, detail }: { name: string; destination: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] px-4 py-3.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.035] text-zinc-600">
        <HugeiconsIcon icon={Notification02Icon} size={14} strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] text-zinc-300">{name}</p>
        <p className="mt-1 truncate text-[9px] text-zinc-700">{detail}</p>
      </div>
      <span className="text-[9px] text-zinc-600">{destination}</span>
    </div>
  );
}

function CreateMonitorModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [service, setService] = useState(services[0]?.id ?? "");
  const [signal, setSignal] = useState("error-rate");
  const [condition, setCondition] = useState("above");
  const [duration, setDuration] = useState("5m");

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" appearance="flat">
      <header className="flex items-start justify-between gap-5 border-b border-white/[0.07] px-5 py-5 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.025em] text-white">Create monitor</h2>
          <p className="mt-1 text-[11px] text-zinc-600">Alert when a service metric crosses a threshold.</p>
        </div>
        <button type="button" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-zinc-700 hover:bg-white/[0.05] hover:text-zinc-300" aria-label="Close create monitor">
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.7} />
        </button>
      </header>
      <div className="space-y-5 px-5 py-6 sm:px-6">
        <label className="block">
          <span className="text-[10px] font-medium text-zinc-600">Monitor name</span>
          <input placeholder="e.g. Checkout latency" className="mt-2 h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-xs text-zinc-300 outline-none placeholder:text-zinc-800 focus:border-white/[0.16]" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="text-[10px] font-medium text-zinc-600">Service</span>
            <Select
              value={service}
              onChange={setService}
              ariaLabel="Monitor service"
              options={services.map((item) => ({ value: item.id, label: item.name }))}
              className="mt-2"
            />
          </div>
          <div>
            <span className="text-[10px] font-medium text-zinc-600">Signal</span>
            <Select
              value={signal}
              onChange={setSignal}
              ariaLabel="Monitor signal"
              options={[
                { value: "error-rate", label: "Error rate" },
                { value: "p95-latency", label: "P95 latency" },
                { value: "availability", label: "Availability" },
                { value: "throughput", label: "Throughput" },
              ]}
              className="mt-2"
            />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_100px_1fr] items-end gap-3">
          <div>
            <span className="text-[10px] font-medium text-zinc-600">Condition</span>
            <Select
              value={condition}
              onChange={setCondition}
              ariaLabel="Monitor condition"
              options={[
                { value: "above", label: "Above" },
                { value: "below", label: "Below" },
              ]}
              className="mt-2"
            />
          </div>
          <label>
            <span className="text-[10px] font-medium text-zinc-600">Value</span>
            <input defaultValue="2" className="mt-2 h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-xs text-zinc-300 outline-none" />
          </label>
          <div>
            <span className="text-[10px] font-medium text-zinc-600">For</span>
            <Select
              value={duration}
              onChange={setDuration}
              ariaLabel="Monitor duration"
              options={[
                { value: "5m", label: "5 minutes" },
                { value: "10m", label: "10 minutes" },
                { value: "15m", label: "15 minutes" },
              ]}
              className="mt-2"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] px-4 py-3 text-[10px] text-zinc-600">
          <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={1.7} />
          Evaluation runs every 30 seconds using incoming telemetry.
        </div>
      </div>
      <footer className="flex justify-end gap-2 border-t border-white/[0.07] px-5 py-4 sm:px-6">
        <button type="button" onClick={onClose} className="h-9 rounded-lg px-4 text-[11px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200">Cancel</button>
        <button type="button" onClick={onClose} className="h-9 rounded-lg bg-white px-4 text-[11px] font-medium text-black hover:bg-zinc-200">Create monitor</button>
      </footer>
    </Modal>
  );
}
