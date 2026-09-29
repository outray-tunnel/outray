import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveComponentState, rollupStatus } from "../src/lib/uptime/state";
import { UPTIME_LIMITS, validateMonitorInput } from "../src/lib/uptime/validation";

const monitor = { name: "API", url: "https://api.example.com/health" };

test("Uptime beta allowance and safe defaults", () => {
  assert.equal(UPTIME_LIMITS.monitors, 10);
  assert.equal(UPTIME_LIMITS.intervalSeconds, 60);
  assert.equal(UPTIME_LIMITS.checkHistoryDays, 30);
  const result = validateMonitorInput(monitor);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.method, "GET");
    assert.equal(result.data.expectedStatus, null);
    assert.equal(result.data.responseText, null);
  }
});

test("monitor validation refuses local targets and unsafe headers", () => {
  for (const url of [
    "http://localhost:3000", "http://127.0.0.1", "http://[::1]/",
    "http://metadata.internal/latest", "file:///etc/passwd",
    "https://user:pass@example.com/",
    "https://api.example.com:8443/health", "http://api.example.com:8080/health",
    "https://api.example.test/health", "https://api.example.invalid/health",
  ]) {
    const result = validateMonitorInput({ ...monitor, url });
    assert.equal(result.success, false, url);
  }
  for (const headers of [
    { Host: "internal" }, { "X-Forwarded-For": "127.0.0.1" },
    { Authorization: "Bearer token\r\nHost: evil" },
    { Cookie: "session=secret" },
    { "X-Forwarded-Prefix": "/admin" }, { Expect: "100-continue" },
    { "X-Original-URL": "/admin" },
  ]) {
    const result = validateMonitorInput({ ...monitor, headers });
    assert.equal(result.success, false);
  }
  assert.equal(validateMonitorInput({ ...monitor, method: "HEAD", responseText: "ready" }).success, false);
  assert.equal(validateMonitorInput({ ...monitor, headers: { Authorization: "Bearer token" } }).success, true);
});

test("component and page rollup never call stale evidence operational", () => {
  const now = new Date("2026-09-29T10:00:00.000Z").getTime();
  const up = { state: "up", lastCheckedAt: new Date(now - 60_000), enabled: true, deletedAt: null };
  const down = { ...up, state: "down" };
  const stale = { ...up, lastCheckedAt: new Date(now - 181_000) };
  assert.equal(deriveComponentState("unknown", [up, up], now), "operational");
  assert.equal(deriveComponentState("unknown", [down, down], now), "outage");
  assert.equal(deriveComponentState("unknown", [up, down], now), "degraded");
  assert.equal(deriveComponentState("unknown", [up, stale], now), "unknown");
  assert.equal(deriveComponentState("unknown", [down, stale], now), "degraded");
  assert.equal(deriveComponentState("unknown", [], now), "unknown");
  assert.equal(rollupStatus(["operational", "unknown"]), "unknown");
  assert.equal(rollupStatus(["operational", "outage"]), "degraded");
  assert.equal(rollupStatus(["outage", "outage"]), "outage");
});
