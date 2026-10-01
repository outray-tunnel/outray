import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { statusPageUrl } from "../src/lib/config";
import { addIncidentsToHistory, aggregateMonitorEvidence, aggregateStates, buildDailyHistory, normalizeRequestHost, publishedIncidentStage, safeLogoUrl, slugFromStatusHost, type PublicIncident } from "../src/lib/status-data";
import { isSameOrigin, makeUnsubscribeToken, safeClientIp, verifyUnsubscribeToken } from "../src/lib/security";

test("public incident stage uses only the latest published update", () => {
  const incident: PublicIncident = { id: "one", title: "Issue", sourceType: "uptime_manual", status: "open", startedAt: new Date("2026-09-30T10:00:00Z"), resolvedAt: null, components: [], latestNote: null, latestNoteAt: null, updates: [
    { id: "older", note: "Investigating", body: null, status: "investigating", publishedAt: new Date("2026-09-30T10:01:00Z") },
    { id: "later", note: "Monitoring", body: null, status: "monitoring", publishedAt: new Date("2026-09-30T10:05:00Z") },
  ] };
  assert.equal(publishedIncidentStage(incident), "monitoring");
  assert.equal(publishedIncidentStage({ ...incident, updates: [] }), "down");
  assert.equal(publishedIncidentStage({ ...incident, updates: [], status: "resolved" }), "recovered");
  assert.equal(publishedIncidentStage({ ...incident, sourceType: "uptime_monitor" }), "down");
  assert.equal(publishedIncidentStage({ ...incident, sourceType: "uptime_monitor", status: "resolved" }), "recovered");
});

const now = Date.parse("2026-09-29T10:00:00.000Z");
const fresh = new Date(now - 30_000);
const stale = new Date(now - 181_000);
const monitor = (state: string, last_checked_at: Date | null = fresh) => ({
  component_id: "component-1", monitor_id: randomUUID(), state,
  last_checked_at, enabled: true, deleted_at: null,
});

test("monitor rollup never calls stale or missing evidence operational", () => {
  assert.equal(aggregateMonitorEvidence([monitor("up", stale)], now), "unknown");
  assert.equal(aggregateMonitorEvidence([monitor("up"), monitor("unknown")], now), "unknown");
  assert.equal(aggregateMonitorEvidence([monitor("up"), monitor("up")], now), "operational");
});

test("monitor rollup distinguishes outage and partial degradation", () => {
  assert.equal(aggregateMonitorEvidence([monitor("down"), monitor("down")], now), "outage");
  assert.equal(aggregateMonitorEvidence([monitor("up"), monitor("down")], now), "degraded");
  assert.equal(aggregateMonitorEvidence([monitor("down"), monitor("up", stale)], now), "degraded");
});

test("group and page rollups preserve unknown", () => {
  assert.equal(aggregateStates([]), "unknown");
  assert.equal(aggregateStates(["operational", "unknown"]), "unknown");
  assert.equal(aggregateStates(["outage", "outage"]), "outage");
  assert.equal(aggregateStates(["operational", "outage"]), "degraded");
});

test("90-day check history keeps missing days unknown and classifies observed days", () => {
  const rows = new Map([
    ["2026-07-02", { checks: 10, successes: 10, reported_monitors: 1 }],
    ["2026-09-28", { checks: 10, successes: 8, reported_monitors: 1 }],
    ["2026-09-29", { checks: 10, successes: 0, reported_monitors: 1 }],
  ]);
  const history = buildDailyHistory(rows, Date.parse("2026-09-29T00:00:00Z"), 1);
  assert.equal(history.length, 90);
  assert.deepEqual(history[0], { date: "2026-07-02", state: "operational", checks: 10, successes: 10, detectedFailureMinutes: 0, reportedMonitors: 1, expectedMonitors: 1 });
  assert.deepEqual(history[1], { date: "2026-07-03", state: "unknown", checks: 0, successes: 0, detectedFailureMinutes: 0, reportedMonitors: 0, expectedMonitors: 1 });
  assert.deepEqual(history[88], { date: "2026-09-28", state: "degraded", checks: 10, successes: 8, detectedFailureMinutes: 2, reportedMonitors: 1, expectedMonitors: 1 });
  assert.deepEqual(history[89], { date: "2026-09-29", state: "outage", checks: 10, successes: 0, detectedFailureMinutes: 10, reportedMonitors: 1, expectedMonitors: 1 });
});

test("component downtime estimate uses the most affected monitor, not summed failures", () => {
  const rows = new Map([["2026-09-29", {
    checks: 20, successes: 15, reported_monitors: 2, max_failed_checks: 3,
  }]]);
  const day = buildDailyHistory(rows, Date.parse("2026-09-29T00:00:00Z"), 2)[89];
  assert.equal(day?.state, "degraded");
  assert.equal(day?.detectedFailureMinutes, 3);
});

test("a day with missing monitor coverage stays unknown", () => {
  const rows = new Map([["2026-09-29", { checks: 10, successes: 10, reported_monitors: 1 }]]);
  const history = buildDailyHistory(rows, Date.parse("2026-09-29T00:00:00Z"), 2);
  assert.equal(history[89]?.state, "unknown");
});

test("component history includes public monitor and published manual incident durations", () => {
  const history = buildDailyHistory(new Map(), Date.parse("2026-09-29T00:00:00Z"), 0);
  const decorated = addIncidentsToHistory(history, [
    { id: "monitor-1", title: "API down", source_type: "uptime_monitor",
      started_at: new Date("2026-09-28T23:52:00Z"), resolved_at: new Date("2026-09-29T00:10:00Z") },
    { id: "manual-1", title: "Degraded performance", source_type: "uptime_manual",
      started_at: new Date("2026-09-29T00:05:00Z"), resolved_at: new Date("2026-09-29T00:15:00Z") },
  ], Date.parse("2026-09-29T10:00:00Z"));
  assert.equal(decorated[87]?.incidents.length, 0);
  assert.equal(decorated[88]?.incidentMinutes, 8);
  assert.equal(decorated[89]?.incidentMinutes, 15); // Overlap is counted only once.
  assert.equal(decorated[89]?.incidentKind, "downtime");
  assert.deepEqual(decorated[89]?.incidents.map((item) => item.id), ["monitor-1", "manual-1"]);
  assert.equal(decorated[89]?.state, "degraded");
});

test("unsubscribe token is signed and expires", () => {
  process.env.UPTIME_UNSUBSCRIBE_SECRET = "test-secret-only";
  const valid = makeUnsubscribeToken("subscriber-1", "page-1", Date.now() + 60_000);
  assert.deepEqual(verifyUnsubscribeToken(valid), { subscriberId: "subscriber-1", pageId: "page-1" });
  assert.equal(verifyUnsubscribeToken(valid + "a"), null);
  assert.equal(verifyUnsubscribeToken(makeUnsubscribeToken("subscriber-1", "page-1", Date.now() - 1)), null);
});

test("subscription POST origin must match the served status host", () => {
  const same = new Request("http://127.0.0.1:4323/api/subscribe", {
    method: "POST", headers: { host: "status.outray.app", origin: "https://status.outray.app" },
  });
  const cross = new Request("http://127.0.0.1:4323/api/subscribe", {
    method: "POST", headers: { host: "status.outray.app", origin: "https://attacker.example" },
  });
  assert.equal(isSameOrigin(same), true);
  assert.equal(isSameOrigin(cross), false);
});

test("signup rate limit key ignores untrusted forwarded-for", () => {
  const before = process.env.STATUS_EDGE_SECRET;
  process.env.STATUS_EDGE_SECRET = "private-edge-secret";
  try {
    const request = new Request("https://status.outray.app/api/subscribe", {
      headers: {
        "x-outray-edge-secret": "private-edge-secret",
        "x-outray-client-ip": "203.0.113.4",
        "x-forwarded-for": "10.0.0.1",
      },
    });
    assert.equal(safeClientIp(request, "127.0.0.1"), "203.0.113.4");
  } finally {
    if (before === undefined) delete process.env.STATUS_EDGE_SECRET;
    else process.env.STATUS_EDGE_SECRET = before;
  }
});

test("public host parsing rejects host-header authority tricks", () => {
  assert.equal(normalizeRequestHost(new Request("https://status.outray.app/foo", {
    headers: { host: "Status.Outray.App:443" },
  })), "status.outray.app");
  assert.equal(normalizeRequestHost(new Request("https://status.outray.app/foo", {
    headers: { host: "status.outray.app@evil.example" },
  })), null);
});

test("canonical status pages use a single page-slug subdomain", () => {
  const base = { publicUrl: new URL("https://status.outray.app"), canonicalHost: "status.outray.app" };
  assert.equal(statusPageUrl("acme", base).toString(), "https://acme.status.outray.app/");
  assert.equal(slugFromStatusHost("acme.status.outray.app", base.canonicalHost), "acme");
  assert.equal(slugFromStatusHost("status.outray.app", base.canonicalHost), null);
  assert.equal(slugFromStatusHost("a.b.status.outray.app", base.canonicalHost), null);
  assert.equal(slugFromStatusHost("acme.status.outray.app.evil.example", base.canonicalHost), null);
  assert.equal(slugFromStatusHost("-bad.status.outray.app", base.canonicalHost), null);
  assert.throws(() => statusPageUrl("a.b", base), /Invalid status page slug/);
});

test("subscription POST origin must match a status page subdomain", () => {
  const same = new Request("http://127.0.0.1:4323/api/subscribe", {
    method: "POST", headers: { host: "acme.status.outray.app", origin: "https://acme.status.outray.app" },
  });
  const otherPage = new Request("http://127.0.0.1:4323/api/subscribe", {
    method: "POST", headers: { host: "acme.status.outray.app", origin: "https://other.status.outray.app" },
  });
  assert.equal(isSameOrigin(same), true);
  assert.equal(isSameOrigin(otherPage), false);
});

test("status logos accept validated PNG/WebP data URLs but not SVG", () => {
  const pngBytes = Buffer.from("89504e470d0a1a0a0000000049454e44ae426082", "hex");
  const png = `data:image/png;base64,${pngBytes.toString("base64")}`;
  assert.equal(safeLogoUrl(png), png);
  assert.equal(safeLogoUrl("data:image/svg+xml;base64,PHN2Zy8+"), null);
  assert.equal(safeLogoUrl("data:image/png;base64,PHN2Zy8+"), null);
});
