import NumberFlow from "@number-flow/react";
import { useState } from "react";
import type { UsageMetricKey } from "./usage-bars";
import { getUsageNumberConfig } from "./usage-number-format";

export interface UsageNumberProps {
  value: number;
  metric: UsageMetricKey;
}

export function UsageNumber({ value, metric }: UsageNumberProps) {
  const config = getUsageNumberConfig(value, metric);
  const [transition, setTransition] = useState({
    value: config.value,
    metric,
    suffix: config.suffix,
    animated: true,
  });

  if (
    transition.value !== config.value ||
    transition.metric !== metric ||
    transition.suffix !== config.suffix
  ) {
    setTransition({
      value: config.value,
      metric,
      suffix: config.suffix,
      // Values expressed in different units should not roll into one another.
      animated:
        transition.metric === metric && transition.suffix === config.suffix,
    });
  }

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
