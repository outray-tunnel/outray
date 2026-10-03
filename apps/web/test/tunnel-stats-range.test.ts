import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTunnelStatsRange,
  tunnelStatsRangeConfig,
  tunnelStatsWindow,
} from "../src/lib/tunnel-stats-range";

test("tunnel overview accepts only its four supported ranges", () => {
  assert.equal(parseTunnelStatsRange(null), "24h");
  for (const range of ["1h", "24h", "7d", "30d"] as const) {
    assert.equal(parseTunnelStatsRange(range), range);
  }
  for (const invalid of ["", "1d", "30m", "all", "__proto__", "24H"]) {
    assert.equal(parseTunnelStatsRange(invalid), null, invalid);
  }
});

test("all tunnel stat windows use one captured rolling boundary and expected bucket", () => {
  const now = new Date("2026-10-03T14:35:42.123Z");
  const expectations = [
    ["1h", 60 * 60 * 1000, "1 minute"],
    ["24h", 24 * 60 * 60 * 1000, "1 hour"],
    ["7d", 7 * 24 * 60 * 60 * 1000, "1 day"],
    ["30d", 30 * 24 * 60 * 60 * 1000, "1 day"],
  ] as const;

  for (const [range, length, bucket] of expectations) {
    const window = tunnelStatsWindow(range, now);
    assert.equal(window.end.toISOString(), now.toISOString());
    assert.equal(window.end.getTime() - window.start.getTime(), length);
    assert.equal(window.bucket, bucket);
    assert.equal(tunnelStatsRangeConfig[range].milliseconds, length);
  }

  // Callers cannot change the captured boundary by mutating their Date later.
  const window = tunnelStatsWindow("24h", now);
  now.setUTCFullYear(2030);
  assert.equal(window.end.toISOString(), "2026-10-03T14:35:42.123Z");
});
