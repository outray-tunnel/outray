import NumberFlow from "@number-flow/react";
import { useState } from "react";
import { getUsageNumberConfig, type UsageNumberConfig } from "./usage-number-format";

export interface UsageNumberProps {
  value: number | null;
  metric: string;
  numberConfig?: (value: number) => UsageNumberConfig;
  missingLabel?: string;
}

export function UsageNumber({ value, metric, numberConfig, missingLabel = "—" }: UsageNumberProps) {
  const hasValue = value !== null;
  const config = numberConfig && hasValue
    ? numberConfig(value)
    : getUsageNumberConfig(value ?? 0, metric);
  const [transition, setTransition] = useState({
    value: config.value,
    metric,
    suffix: config.suffix,
    hasValue,
    animated: true,
  });

  if (
    transition.value !== config.value ||
    transition.metric !== metric ||
    transition.suffix !== config.suffix ||
    transition.hasValue !== hasValue
  ) {
    setTransition({
      value: config.value,
      metric,
      suffix: config.suffix,
      hasValue,
      // Values expressed in different units should not roll into one another.
      animated:
        transition.metric === metric && transition.suffix === config.suffix &&
        transition.hasValue === hasValue,
    });
  }

  if (!hasValue) return <span>{missingLabel}</span>;

  return (
    <NumberFlow
      value={config.value}
      suffix={config.suffix}
      format={config.format}
      locales="en-US"
      className="tabular-nums"
      style={{
        fontSize: "inherit",
        fontWeight: "inherit",
        lineHeight: 0.85,
        letterSpacing: "inherit",
      }}
      animated={transition.animated}
      isolate
      willChange
      respectMotionPreference
    />
  );
}
