import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import { UptimeOverviewContent, type UptimeOverviewContentProps } from "../src/components/uptime/overview-content";
import { overviewMonitorRows, uptimeOverviewSummary } from "../src/components/uptime/overview-data";
import { UptimeCheckbox, StateBadge } from "../src/components/uptime/uptime-ui";
import type { UptimeIncident, UptimeMonitor } from "../src/components/uptime/uptime-client";

Object.assign(globalThis, { React });
const monitor = (id: string, overrides: Partial<UptimeMonitor> = {}): UptimeMonitor => ({
  id, name: id, url: "https://api.example.test/health", method: "GET", expectedStatus: null, responseText: null,
  failureThreshold: 3, incidentPublishing: "manual", publishAfterMinutes: 5, enabled: true, state: "up",
  lastCheckedAt: "2026-10-07T08:00:00Z", createdAt: "2026-10-01T08:00:00Z", ...overrides,
});
const incident = (id: string, overrides: Partial<UptimeIncident> = {}): UptimeIncident => ({
  id, title: id, status: "open", sourceType: "uptime_monitor", uptimePublicationState: "published", startedAt: "2026-10-07T08:00:00Z", ...overrides,
});
function render(overrides: Partial<UptimeOverviewContentProps> = {}) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: ["/outray-tunnel/uptime"] }) });
  const props: UptimeOverviewContentProps = {
    orgSlug: "outray-tunnel",
    monitors: { data: { monitors: [monitor("Public API")], limit: 10, canManage: true }, loading: false, error: null },
    incidents: { data: { incidents: [incident("API errors")], nextCursor: null, canManage: true }, loading: false, error: null },
    page: { data: { page: { id: "page", name: "OutRay Status", slug: "outray", description: null, logoUrl: null, accentColor: "#8367c7", published: true }, groups: [], standaloneComponents: [], canManage: true }, loading: false, error: null },
    onRefresh: () => {}, ...overrides,
  };
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: React.createElement(UptimeOverviewContent, props) }));
}
const text = (html: string) => html.replace(/<[^>]*>/g, "");

test("summary separates paused and unknown monitors from healthy evidence", () => {
  const data = uptimeOverviewSummary([monitor("up"), monitor("down", { state: "down" }), monitor("waiting", { lastCheckedAt: null }), monitor("paused", { enabled: false, state: "down" })], []);
  assert.deepEqual(data, { total: 4, enabled: 3, paused: 1, up: 1, down: 1, unknown: 1, detected: 0, active: 0, health: "down" });
  assert.equal(uptimeOverviewSummary([], []).health, "empty");
  assert.equal(uptimeOverviewSummary([monitor("off", { enabled: false })], []).health, "paused");
  assert.equal(uptimeOverviewSummary([monitor("waiting", { lastCheckedAt: null })], []).health, "unknown");
});

test("private drafts, ignored detections, and recovered issues do not become active public incidents", () => {
  const data = uptimeOverviewSummary([], [
    incident("published"), incident("detected", { uptimePublicationState: "detected" }),
    incident("draft", { sourceType: "uptime_manual", uptimePublicationState: null, updates: [] }),
    incident("ignored", { uptimePublicationState: "ignored" }),
    incident("recovered", { uptimePublicationState: "detected", status: "resolved" }),
  ]);
  assert.equal(data.active, 1);
  assert.equal(data.detected, 1);
});

test("monitor preview prioritizes attention, stays bounded, and leaves the resource array unchanged", () => {
  const records = [monitor("up"), monitor("off", { enabled: false }), monitor("unknown", { state: "unknown" }), monitor("down", { state: "down" }), monitor("up2"), monitor("up3")];
  assert.deepEqual(overviewMonitorRows(records).map(({ id }) => id), ["down", "unknown", "up", "up2", "up3"]);
  assert.deepEqual(records.map(({ id }) => id), ["up", "off", "unknown", "down", "up2", "up3"]);
});

test("Overview uses compact service summaries and working product detail links", () => {
  const html = render();
  assert.match(html, /text-\[20px\] font-normal/);
  assert.match(html, /All monitored services are up/);
  assert.match(html, /href="\/outray-tunnel\/uptime\/monitors\/Public%20API"/);
  assert.match(html, /href="\/outray-tunnel\/uptime\/incidents\/API%20errors"/);
  assert.match(html, /href="\/outray-tunnel\/uptime\/notifications"/);
  assert.doesNotMatch(html, /<a[^>]*>[\s\S]*?<button/);
  assert.doesNotMatch(text(html), /confirmed by two failures|Know when a service goes down/);
});

test("initial loading matches the layout without invented healthy or empty states", () => {
  const loading = { data: null, loading: true, error: null };
  const html = render({ monitors: loading, incidents: loading, page: loading });
  assert.match(html, /Loading service health/);
  assert.match(html, /Loading monitors/);
  assert.match(html, /Loading recent incidents/);
  assert.match(html, /motion-reduce:animate-none/);
  assert.doesNotMatch(html, /All monitored services are up|No incidents recorded|Start with a public endpoint|Add monitor/);
});

test("independent resource errors retain the working sections and offer retries", () => {
  const html = render({ page: { data: null, loading: false, error: "Status settings unavailable" } });
  assert.match(html, /Status settings unavailable/);
  assert.match(html, /Try again/);
  assert.match(html, /Public API/);
  assert.match(html, /API errors/);
  assert.doesNotMatch(html, /Loading monitors|Loading recent incidents/);
});

test("background refresh preserves content; failed refresh does not replace rows with skeletons", () => {
  const response = { monitors: [monitor("Public API")], limit: 10, canManage: true };
  const refreshing = render({ monitors: { data: response, loading: true, error: null } });
  assert.match(refreshing, /Refreshing Uptime overview/);
  assert.match(refreshing, /Public API/);
  assert.doesNotMatch(refreshing, /Loading service health|Loading monitors/);
  const failed = render({ monitors: { data: response, loading: false, error: "Failed" } });
  assert.match(failed, /Showing the last available data/);
  assert.match(failed, /Public API/);
  assert.match(failed, /Retry/);
});

test("empty and read-only experiences explain next steps without management controls", () => {
  const empty = render({ monitors: { data: { monitors: [], limit: 10, canManage: true }, loading: false, error: null }, incidents: { data: { incidents: [], nextCursor: null, canManage: true }, loading: false, error: null } });
  assert.match(empty, /Start with a public endpoint/);
  assert.match(empty, /Create first monitor/);
  assert.match(empty, /No incidents recorded/);
  const readOnly = render({ monitors: { data: { monitors: [], limit: 10, canManage: false }, loading: false, error: null }, page: { data: { page: null, groups: [], standaloneComponents: [], canManage: false }, loading: false, error: null } });
  assert.doesNotMatch(readOnly, /Add monitor|Create first monitor|Set up a status page/);
  assert.match(readOnly, /View status page/);
});

test("reusable state chips normalize invalid values and designed checkboxes remain real inputs", () => {
  for (const state of ["unrecognized", "constructor", "toString"]) {
    const invalid = renderToStaticMarkup(React.createElement(StateBadge, { state }));
    assert.match(invalid, />Unknown/);
    assert.match(invalid, /rounded-md/);
  }
  const checkbox = renderToStaticMarkup(React.createElement(UptimeCheckbox, { checked: true, disabled: true, "aria-label": "Select recipient", onChange: () => {} }));
  assert.match(checkbox, /type="checkbox"/);
  assert.match(checkbox, /checked/);
  assert.match(checkbox, /disabled/);
  assert.match(checkbox, /aria-label="Select recipient"/);
  assert.match(checkbox, /aria-hidden="true"/);
});
