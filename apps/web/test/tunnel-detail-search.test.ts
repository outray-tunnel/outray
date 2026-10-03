import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTunnelDetailSearch,
  retainSameTunnelData,
} from "../src/lib/tunnel-detail-search";

test("tunnel overview defaults to the past 24 hours", () => {
  assert.deepEqual(parseTunnelDetailSearch({}), {
    tab: "overview",
    range: "24h",
  });
});

test("tunnel overview accepts every supported range and keeps the active tab", () => {
  for (const range of ["1h", "24h", "7d", "30d"]) {
    assert.deepEqual(parseTunnelDetailSearch({ tab: "requests", range }), {
      tab: "requests",
      range,
    });
  }
});

test("invalid tab and range URL parameters fall back safely", () => {
  for (const badRange of ["all", "1d", "", 24, null, { value: "7d" }]) {
    assert.deepEqual(
      parseTunnelDetailSearch({ tab: "unknown", range: badRange }),
      { tab: "overview", range: "24h" },
    );
  }
});

test("background range changes retain data only for the same organization and tunnel", () => {
  const previous = { totalRequests: 42 };
  const key = ["tunnelStats", "acme", "tunnel-1", "24h"];
  assert.equal(retainSameTunnelData(previous, key, "acme", "tunnel-1"), previous);
  assert.equal(retainSameTunnelData(previous, key, "other-org", "tunnel-1"), undefined);
  assert.equal(retainSameTunnelData(previous, key, "acme", "tunnel-2"), undefined);
  assert.equal(retainSameTunnelData(previous, undefined, "acme", "tunnel-1"), undefined);
});
