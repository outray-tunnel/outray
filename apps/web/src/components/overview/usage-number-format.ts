import type { Format } from "@number-flow/react";
import type { UsageMetricKey } from "./usage-bars";

export interface UsageNumberConfig {
  value: number;
  suffix: string;
  format: Format;
}

const countFormat: Format = { maximumFractionDigits: 0 };
const bytesFormat: Format = {
  useGrouping: false,
  maximumFractionDigits: 20,
};
const scaledBytesFormat: Format = {
  useGrouping: false,
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
};
const byteUnits = [
  { minimum: 1_073_741_824, suffix: " GB" },
  { minimum: 1_048_576, suffix: " MB" },
  { minimum: 1_024, suffix: " KB" },
];

export function getUsageNumberConfig(
  value: number,
  metric: UsageMetricKey,
): UsageNumberConfig {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (metric !== "bandwidth") {
    return { value: safeValue, suffix: "", format: countFormat };
  }

  const unit = byteUnits.find(({ minimum }) => safeValue >= minimum);
  if (!unit) {
    return { value: safeValue, suffix: " B", format: bytesFormat };
  }

  return {
    // Keep the existing byte formatter's toFixed(1) rounding convention.
    value: Number((safeValue / unit.minimum).toFixed(1)),
    suffix: unit.suffix,
    format: scaledBytesFormat,
  };
}

export function formatUsageNumber(value: number, metric: UsageMetricKey): string {
  const config = getUsageNumberConfig(value, metric);
  return `${new Intl.NumberFormat("en-US", config.format).format(config.value)}${config.suffix}`;
}
