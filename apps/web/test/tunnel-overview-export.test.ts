import assert from "node:assert/strict";
import test from "node:test";
import { createTunnelOverviewCsv } from "../src/components/tunnel-details/tunnel-overview-export";

test("exports every visible metric as raw values in the selected range", () => {
  const csv = createTunnelOverviewCsv({
    range: "24h",
    metrics: [
      { chartKey: "requests", label: "Requests" },
      { chartKey: "bandwidth", label: "Bandwidth (bytes)" },
      { chartKey: "errorRate", label: "Error rate (%)" },
    ],
    chartData: [
      {
        time: "2026-10-03T12:00:00.000Z",
        requests: 20,
        bandwidth: 2_048,
        errorRate: 12.5,
      },
      { time: "2026-10-03T13:00:00.000Z", requests: 0, bandwidth: 0 },
    ],
  });

  assert.equal(
    csv,
    '"Range","Timestamp","Requests","Bandwidth (bytes)","Error rate (%)"\r\n' +
      '"24h","2026-10-03T12:00:00.000Z",20,2048,12.5\r\n' +
      '"24h","2026-10-03T13:00:00.000Z",0,0,\r\n',
  );
});

test("escapes quotes, commas, newlines and spreadsheet formulas", () => {
  const csv = createTunnelOverviewCsv({
    range: "7d",
    metrics: [{ chartKey: "requests", label: '=HYPERLINK("https://example.com", "Open")' }],
    chartData: [{ time: 'Oct 3,\n"Noon"', requests: 1 }],
  });

  assert.equal(
    csv,
    '"Range","Timestamp","\'=HYPERLINK(""https://example.com"", ""Open"")"\r\n' +
      '"7d","Oct 3,\n""Noon""",1\r\n',
  );
});

test("an empty period exports headings without inventing activity", () => {
  assert.equal(
    createTunnelOverviewCsv({
      range: "1h",
      metrics: [{ chartKey: "connections", label: "Connections" }],
      chartData: [],
    }),
    '"Range","Timestamp","Connections"\r\n',
  );
});

test("rejects an invalid range even when called from untyped code", () => {
  assert.throws(
    () =>
      createTunnelOverviewCsv({
        range: "90d" as "24h",
        metrics: [],
        chartData: [],
      }),
    /Invalid tunnel overview range/,
  );
});
