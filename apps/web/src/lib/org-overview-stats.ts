function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10_000) / 100;
}

export type OrgOverviewAggregateRow = {
  http_requests: unknown;
  previous_http_requests: unknown;
  protocol_events: unknown;
  previous_protocol_events: unknown;
  http_errors: unknown;
  previous_http_errors: unknown;
  http_bytes: unknown;
  previous_http_bytes: unknown;
  protocol_bytes: unknown;
  previous_protocol_bytes: unknown;
};

export type OrgOverviewChartRow = {
  time: string | Date;
  http_requests: unknown;
  protocol_events: unknown;
  errors: unknown;
  http_bytes: unknown;
  protocol_bytes: unknown;
};

export function mapOrgOverviewStats(
  aggregate: OrgOverviewAggregateRow | undefined,
  rows: OrgOverviewChartRow[],
  activeTunnels: number,
) {
  const httpRequests = finiteNumber(aggregate?.http_requests);
  const protocolEvents = finiteNumber(aggregate?.protocol_events);
  const previousHttpRequests = finiteNumber(aggregate?.previous_http_requests);
  const previousProtocolEvents = finiteNumber(aggregate?.previous_protocol_events);
  const errors = finiteNumber(aggregate?.http_errors);
  const previousErrors = finiteNumber(aggregate?.previous_http_errors);
  const totalRequests = httpRequests + protocolEvents;
  const previousRequests = previousHttpRequests + previousProtocolEvents;
  const totalDataTransfer =
    finiteNumber(aggregate?.http_bytes) + finiteNumber(aggregate?.protocol_bytes);
  const previousDataTransfer =
    finiteNumber(aggregate?.previous_http_bytes) +
    finiteNumber(aggregate?.previous_protocol_bytes);
  const errorRate = httpRequests > 0 ? (errors / httpRequests) * 100 : 0;
  const previousErrorRate =
    previousHttpRequests > 0 ? (previousErrors / previousHttpRequests) * 100 : 0;

  return {
    // These two legacy fields include all HTTP requests and TCP/UDP events.
    totalRequests,
    requestsChange: percentChange(totalRequests, previousRequests),
    httpRequests,
    protocolEvents,
    errors,
    errorRate,
    // A rate delta is measured in percentage points, not relative percent.
    errorRateChange: Math.round((errorRate - previousErrorRate) * 100) / 100,
    activeTunnels,
    // Historical org-scoped tunnel counts are not stored, so no trend is known.
    activeTunnelsChange: null,
    totalDataTransfer,
    dataTransferChange: percentChange(
      totalDataTransfer,
      previousDataTransfer,
    ),
    chartData: rows.map((row) => {
      const httpRequests = finiteNumber(row.http_requests);
      const protocolEvents = finiteNumber(row.protocol_events);
      const errors = finiteNumber(row.errors);
      return {
        time: new Date(row.time).toISOString(),
        requests: httpRequests + protocolEvents,
        httpRequests,
        protocolEvents,
        errors,
        errorRate: httpRequests > 0 ? (errors / httpRequests) * 100 : 0,
        bandwidth: finiteNumber(row.http_bytes) + finiteNumber(row.protocol_bytes),
      };
    }),
  };
}
