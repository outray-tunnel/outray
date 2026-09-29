import { createFileRoute, Link } from "@tanstack/react-router";
import { formatTime, type UptimeIncident, type UptimeMonitor, type UptimePage, useUptimeResource } from "@/components/uptime/uptime-client";
import { primaryButton, secondaryButton, StateBadge, UptimeError, UptimePageHeading, UptimePanel } from "@/components/uptime/uptime-ui";

export const Route = createFileRoute("/$orgSlug/uptime/")({
  head: () => ({ meta: [{ title: "Uptime - OutRay" }] }),
  component: UptimeOverview,
});

function UptimeOverview() {
  const { orgSlug } = Route.useParams();
  const monitors = useUptimeResource<{ monitors: UptimeMonitor[]; limit: number }>(orgSlug, "/monitors");
  const incidents = useUptimeResource<{ incidents: UptimeIncident[] }>(orgSlug, "/incidents");
  const page = useUptimeResource<{ page: UptimePage | null }>(orgSlug, "/page");
  const rows = monitors.data?.monitors ?? [];
  const down = rows.filter((monitor) => monitor.state === "down").length;
  const unknown = rows.filter((monitor) => monitor.state === "unknown" || !monitor.lastCheckedAt).length;
  const active = incidents.data?.incidents.filter((incident) => !incident.resolvedAt && incident.status !== "resolved").length ?? 0;

  return <div className="mx-auto max-w-[1320px]">
    <UptimePageHeading eyebrow="Uptime" title="Know when a service goes down." description="One-minute public endpoint checks, team alerts, and a status page built from the components your customers recognize." action={<Link className={primaryButton} to="/$orgSlug/uptime/monitors" params={{ orgSlug }}>Add monitor</Link>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Monitors", value: rows.length.toString(), detail: `of ${monitors.data?.limit ?? 10} available` },
        { label: "Down", value: down.toString(), detail: "confirmed by two failures" },
        { label: "Unknown", value: unknown.toString(), detail: "awaiting fresh checks" },
        { label: "Open incidents", value: active.toString(), detail: "automatic and manual" },
      ].map((item) => <UptimePanel key={item.label} className="p-5">
        <p className="text-[11px] uppercase tracking-[0.13em] text-zinc-500">{item.label}</p>
        <p className="mt-4 text-[28px] font-semibold tracking-tight text-zinc-100">{item.value}</p>
        <p className="mt-1 text-xs text-zinc-600">{item.detail}</p>
      </UptimePanel>)}
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
      <UptimePanel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><h2 className="text-sm font-semibold text-zinc-200">Monitors</h2><Link to="/$orgSlug/uptime/monitors" params={{ orgSlug }} className="text-xs text-zinc-400 hover:text-white">View all →</Link></div>
        {monitors.error && <div className="p-5"><UptimeError message={monitors.error} /></div>}
        {monitors.loading && <p className="p-5 text-sm text-zinc-500">Loading monitors…</p>}
        {!monitors.loading && !monitors.error && rows.length === 0 && <div className="p-5"><p className="text-sm text-zinc-400">No monitors yet. Add a public URL to start collecting check history.</p><Link className={`${secondaryButton} mt-5`} to="/$orgSlug/uptime/monitors" params={{ orgSlug }}>Create first monitor</Link></div>}
        {rows.slice(0, 5).map((monitor) => <Link key={monitor.id} to="/$orgSlug/uptime/monitors/$monitorId" params={{ orgSlug, monitorId: monitor.id }} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 last:border-0 hover:bg-white/[0.025]"><span className="min-w-0"><span className="block truncate text-sm font-medium text-zinc-200">{monitor.name}</span><span className="mt-1 block max-w-[400px] truncate font-mono text-xs text-zinc-600">{monitor.url}</span></span><StateBadge state={monitor.state} /></Link>)}
      </UptimePanel>
      <div className="space-y-5">
        <UptimePanel className="p-5"><p className="text-xs uppercase tracking-[0.13em] text-zinc-500">Public status page</p><h2 className="mt-4 text-lg font-semibold text-zinc-100">{page.data?.page?.name || "Not configured"}</h2><p className="mt-2 text-xs leading-5 text-zinc-500">{page.data?.page ? page.data.page.published ? "Published for your customers" : "Draft — not visible publicly" : "Organize monitors into customer-facing components."}</p><Link className={`${secondaryButton} mt-5`} to="/$orgSlug/uptime/status-page" params={{ orgSlug }}>{page.data?.page ? "Manage page" : "Create page"}</Link></UptimePanel>
        <UptimePanel className="p-5"><p className="text-xs uppercase tracking-[0.13em] text-zinc-500">Latest incident</p>{incidents.data?.incidents[0] ? <><p className="mt-4 text-sm font-medium text-zinc-200">{incidents.data.incidents[0].title}</p><p className="mt-2 text-xs text-zinc-500">{formatTime(incidents.data.incidents[0].startedAt || incidents.data.incidents[0].createdAt)}</p></> : <p className="mt-4 text-sm text-zinc-500">No incidents recorded.</p>}<Link className="mt-5 inline-block text-xs text-zinc-300 hover:text-white" to="/$orgSlug/uptime/incidents" params={{ orgSlug }}>View incidents →</Link></UptimePanel>
      </div>
    </div>
  </div>;
}
