import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { type UptimeIncidentListResponse, type UptimeMonitor, type UptimePageResponse, useUptimeResource } from "@/components/uptime/uptime-client";
import { UptimeOverviewContent } from "@/components/uptime/overview-content";
import { useUptimeRefresh } from "@/components/uptime/use-uptime-refresh";

export const Route = createFileRoute("/$orgSlug/uptime/")({
  head: () => ({ meta: [{ title: "Uptime - OutRay" }] }),
  component: UptimeOverview,
});

function UptimeOverview() {
  const { orgSlug } = Route.useParams();
  return <OverviewSession key={orgSlug} orgSlug={orgSlug} />;
}

function OverviewSession({ orgSlug }: { orgSlug: string }) {
  const monitors = useUptimeResource<{ monitors: UptimeMonitor[]; limit: number; canManage?: boolean }>(orgSlug, "/monitors");
  const incidents = useUptimeResource<UptimeIncidentListResponse>(orgSlug, "/incidents");
  const page = useUptimeResource<UptimePageResponse>(orgSlug, "/page");
  const { reload: reloadMonitors } = monitors, { reload: reloadIncidents } = incidents, { reload: reloadPage } = page;
  const refresh = useCallback(() => { reloadMonitors(); reloadIncidents(); reloadPage(); }, [reloadMonitors, reloadIncidents, reloadPage]);
  useUptimeRefresh(refresh);
  return <UptimeOverviewContent orgSlug={orgSlug} monitors={monitors} incidents={incidents} page={page} onRefresh={refresh} />;
}
