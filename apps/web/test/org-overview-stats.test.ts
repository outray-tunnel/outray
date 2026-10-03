import assert from "node:assert/strict";
import test from "node:test";
import { mapOrgOverviewStats } from "../src/lib/org-overview-stats";

test("organization overview totals and buckets include both HTTP and protocol traffic", () => {
  const stats = mapOrgOverviewStats(
    {
      http_requests: "100",
      previous_http_requests: "50",
      protocol_events: "20",
      previous_protocol_events: "10",
      http_errors: "5",
      previous_http_errors: "1",
      http_bytes: "1000",
      previous_http_bytes: "500",
      protocol_bytes: "250",
      previous_protocol_bytes: "125",
    },
    [
      {
        time: "2026-10-03T12:00:00.000Z",
        http_requests: "10",
        protocol_events: "2",
        errors: "1",
        http_bytes: "100",
        protocol_bytes: "25",
      },
      {
        time: "2026-10-03T13:00:00.000Z",
        http_requests: "0",
        protocol_events: "0",
        errors: "0",
        http_bytes: "0",
        protocol_bytes: "0",
      },
    ],
    3,
  );

  assert.equal(stats.totalRequests, 120);
  assert.equal(stats.requestsChange, 100);
  assert.equal(stats.httpRequests, 100);
  assert.equal(stats.protocolEvents, 20);
  assert.equal(stats.errors, 5);
  assert.equal(stats.errorRate, 5);
  assert.equal(stats.errorRateChange, 3);
  assert.equal(stats.totalDataTransfer, 1250);
  assert.equal(stats.dataTransferChange, 100);
  assert.equal(stats.activeTunnels, 3);
  assert.equal(stats.activeTunnelsChange, null);
  assert.deepEqual(stats.chartData[0], {
    time: "2026-10-03T12:00:00.000Z",
    requests: 12,
    httpRequests: 10,
    protocolEvents: 2,
    errors: 1,
    errorRate: 10,
    bandwidth: 125,
  });
  assert.equal(stats.chartData[1]?.errorRate, 0);
});

test("organization overview does not fabricate change or errors without checks", () => {
  const stats = mapOrgOverviewStats(undefined, [], 0);
  assert.equal(stats.totalRequests, 0);
  assert.equal(stats.requestsChange, 0);
  assert.equal(stats.errorRate, 0);
  assert.equal(stats.errorRateChange, 0);
  assert.equal(stats.totalDataTransfer, 0);
  assert.equal(stats.dataTransferChange, 0);
  assert.equal(stats.activeTunnelsChange, null);
  assert.deepEqual(stats.chartData, []);
});

test("organization overview reports first-activity deltas without infinity", () => {
  const stats = mapOrgOverviewStats(
    {
      http_requests: "1",
      previous_http_requests: "0",
      protocol_events: "0",
      previous_protocol_events: "0",
      http_errors: "1",
      previous_http_errors: "0",
      http_bytes: "5",
      previous_http_bytes: "0",
      protocol_bytes: "0",
      previous_protocol_bytes: "0",
    },
    [],
    0,
  );
  assert.equal(stats.requestsChange, 100);
  assert.equal(stats.errorRate, 100);
  assert.equal(stats.errorRateChange, 100);
  assert.equal(stats.dataTransferChange, 100);
});
