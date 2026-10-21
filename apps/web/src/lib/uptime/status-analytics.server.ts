import { findStatusPage, notFound, requireUptimeRead } from "./api";
import { getOrganizationLimits } from "../organization-entitlements.server";
import { queryTinybird } from "../tinybird";
import analyticsPolicy, { type StatusAnalyticsRange, type StatusAnalyticsReport, type StatusAnalyticsRow } from "../../../../../shared/status-analytics";

const { STATUS_ANALYTICS_RANGES, statusAnalyticsWindow } = analyticsPolicy;

export async function getStatusAnalytics(request: Request, orgSlug: string) {
  const access = await requireUptimeRead(request, orgSlug);
  if ("error" in access) return access.error;
  const limits = await getOrganizationLimits(access.organization.id);
  if (!limits.statusAnalytics) return Response.json({ error: "Status page analytics is available on paid plans.", code: "paid_plan_required" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  const page = await findStatusPage(access.organization.id, request);
  if (!page) return notFound("Status page");
  const range = new URL(request.url).searchParams.get("range") || "7d";
  if (!Object.hasOwn(STATUS_ANALYTICS_RANGES, range)) return Response.json({ error: "Invalid analytics range" }, { status: 400 });
  const retentionDays = Math.min(limits.retentionDays, 90);
  const { start, end, bucketSeconds } = statusAnalyticsWindow(range as StatusAnalyticsRange, retentionDays);
  try {
    const rows = await queryTinybird<StatusAnalyticsRow>("status_page_analytics", {
      organization_id: access.organization.id, page_id: page.id,
      start_ms: start, end_ms: end, bucket_seconds: bucketSeconds, retention_days: retentionDays,
    }, { cache: "no-store" });
    const summary = rows.find((row) => row.kind === "summary");
    if (!summary || rows.some((row) => typeof row.label !== "string" ||
        !Number.isFinite(Number(row.views)) || !Number.isFinite(Number(row.visitors)))) {
      throw new Error("Malformed status analytics report");
    }
    const count = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
    const buckets = new Map(rows.filter((row) => row.kind === "time").map((row) => [Number(row.label), row]));
    const series: StatusAnalyticsReport["series"] = [];
    for (let time = Math.floor(start / (bucketSeconds * 1000)) * bucketSeconds; time < end / 1000; time += bucketSeconds) {
      const bucket = buckets.get(time);
      series.push({ time: new Date(time * 1000).toISOString(), views: count(bucket?.views), visitors: count(bucket?.visitors) });
    }
    const breakdown = (kind: StatusAnalyticsRow["kind"]) => rows.filter((row) => row.kind === kind)
      .map((row) => ({ label: row.label, views: count(row.views) })).sort((a, b) => b.views - a.views || a.label.localeCompare(b.label));
    const report: StatusAnalyticsReport = {
      available: true, range: range as StatusAnalyticsRange, retentionDays,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      views: count(summary?.views), visitors: count(summary?.visitors), series,
      referrers: breakdown("referrer"), countries: breakdown("country"), pages: breakdown("page"),
    };
    return Response.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    console.error("Status page analytics query failed");
    return Response.json({ error: "Analytics is temporarily unavailable. Please try again." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
