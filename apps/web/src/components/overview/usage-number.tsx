import NumberFlow from "@number-flow/react";
import type { UsageMetricKey } from "./usage-bars";
import { getUsageNumberConfig } from "./usage-number-format";

export interface UsageNumberProps {
  value: number;
  metric: UsageMetricKey;
}

const digitTiming = {
  duration: 220,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};
const opacityTiming = { duration: 120, easing: "ease-out" };

export function UsageNumber({ value, metric }: UsageNumberProps) {
  const config = getUsageNumberConfig(value, metric);
  return (
    <NumberFlow
      value={config.value}
      suffix={config.suffix}
      format={config.format}
      locales="en-US"
      className="tabular-nums [--number-flow-mask-height:0px]"
      style={{
        fontSize: "inherit",
        fontWeight: "inherit",
        lineHeight: "inherit",
        letterSpacing: "inherit",
      }}
      transformTiming={digitTiming}
      spinTiming={digitTiming}
      opacityTiming={opacityTiming}
      trend={0}
      animated
      isolate
      respectMotionPreference
    />
  );
}
