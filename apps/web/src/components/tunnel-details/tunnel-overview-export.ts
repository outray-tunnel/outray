import { OVERVIEW_RANGES } from "./tunnel-overview-format";
import type { OverviewChartPoint, OverviewMetric } from "./tunnel-overview-ui";

export interface TunnelOverviewCsvInput {
  range: (typeof OVERVIEW_RANGES)[number];
  chartData: readonly OverviewChartPoint[];
  metrics: readonly Pick<OverviewMetric, "chartKey" | "label">[];
}

function csvText(value: string): string {
  // Quoting alone does not stop spreadsheet software from evaluating formulas.
  const safeValue =
    /^[\s\uFEFF]*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value)
      ? `'${value}`
      : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

function csvNumber(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "";
}

/** Export raw chart buckets, not abbreviated display strings such as "1.2 KB". */
export function createTunnelOverviewCsv({
  range,
  chartData,
  metrics,
}: TunnelOverviewCsvInput): string {
  if (!OVERVIEW_RANGES.includes(range)) {
    throw new Error("Invalid tunnel overview range");
  }

  const rows = [
    [
      csvText("Range"),
      csvText("Timestamp"),
      ...metrics.map((metric) => csvText(metric.label)),
    ].join(","),
    ...chartData.map((point) =>
      [
        csvText(range),
        csvText(point.time),
        ...metrics.map((metric) => csvNumber(point[metric.chartKey])),
      ].join(","),
    ),
  ];

  return `${rows.join("\r\n")}\r\n`;
}

/** Call from a user gesture so browser download restrictions are respected. */
export function downloadTunnelOverviewCsv(input: TunnelOverviewCsvInput): void {
  const csv = createTunnelOverviewCsv(input);
  const objectUrl = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `tunnel-overview-${input.range}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.hidden = true;
  document.body.append(link);

  try {
    link.click();
  } finally {
    link.remove();
    // Give the browser time to claim the object URL before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }
}
