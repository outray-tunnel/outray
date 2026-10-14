import { useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import NumberFlow from "@number-flow/react";
import styles from "./ObservabilitySignalCharts.module.css";

export const METRIC_DURATION_SAMPLES = [
  { time: "10:00", duration: 198 },
  { time: "10:05", duration: 227 },
  { time: "10:10", duration: 214 },
  { time: "10:15", duration: 286 },
  { time: "10:20", duration: 318 },
  { time: "10:25", duration: 274 },
  { time: "10:30", duration: 365 },
  { time: "10:35", duration: 336 },
  { time: "10:40", duration: 402 },
  { time: "10:45", duration: 381 },
  { time: "10:50", duration: 309 },
  { time: "10:55", duration: 342 },
] as const;

export const SIGNAL_TRACE_SPANS = [
  { service: "checkout-api", operation: "POST /api/checkout", offset: 0, duration: 342, color: "#f5b85b" },
  { service: "postgres", operation: "SELECT products", offset: 10, duration: 84, color: "#63d9ec" },
  { service: "payments-api", operation: "POST /payments", offset: 232, duration: 108, color: "#b785ff" },
] as const;

const defaultDuration = 342;
const numberFormat = { useGrouping: false, maximumFractionDigits: 0 } as const;
const numberTiming = { duration: 430, easing: "cubic-bezier(.22, 1, .36, 1)" };

export function signalChartIndexFromKey(current: number, key: string, count: number): number | null {
  if (count < 1) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current + count - 1) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

function useChartInteraction(count: number) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [tabStop, setTabStop] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function focus(index: number) {
    setHovered(null);
    setTabStop(index);
    setFocused(index);
    buttons.current[index]?.focus();
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = signalChartIndexFromKey(index, event.key, count);
    if (next === null) return;
    event.preventDefault();
    focus(next);
  }

  function handleEnter(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (event.pointerType !== "touch") setHovered(index);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null);
  }

  return {
    active: hovered ?? focused,
    tabStop,
    buttons,
    focus,
    handleKey,
    handleEnter,
    handleBlur,
    leave: () => setHovered(null),
    focused: (index: number) => { setHovered(null); setTabStop(index); setFocused(index); },
  };
}

function DurationNumber({ value }: { value: number }) {
  return <NumberFlow
    value={value}
    suffix=" ms"
    locales="en-US"
    format={numberFormat}
    transformTiming={numberTiming}
    spinTiming={numberTiming}
    className={styles.duration}
    isolate
    willChange
    respectMotionPreference
  />;
}

export function MetricChart() {
  const interaction = useChartInteraction(METRIC_DURATION_SAMPLES.length);
  const sample = interaction.active === null ? null : METRIC_DURATION_SAMPLES[interaction.active];

  return <div className={styles.metricChart}>
    <div className={styles.metricHeading}><span>{sample ? `${sample.time} · duration` : "Request duration"}</span><DurationNumber value={sample?.duration ?? defaultDuration} /></div>
    <div
      className={styles.metricColumns}
      role="group"
      aria-label="Request duration over time"
      onPointerLeave={interaction.leave}
      onBlur={interaction.handleBlur}
    >
      {METRIC_DURATION_SAMPLES.map((point, index) => <button
        type="button"
        className={styles.metricTarget}
        aria-label={`Request at ${point.time}, ${point.duration} milliseconds`}
        aria-pressed={interaction.active === index}
        data-active={interaction.active === index}
        tabIndex={interaction.tabStop === index ? 0 : -1}
        ref={(element) => { interaction.buttons.current[index] = element; }}
        onPointerEnter={(event) => interaction.handleEnter(event, index)}
        onFocus={() => interaction.focused(index)}
        onClick={() => interaction.focus(index)}
        onKeyDown={(event) => interaction.handleKey(event, index)}
        key={point.time}
      ><span className={styles.metricBar} style={{ height: `${point.duration / 430 * 100}%`, animationDelay: `${index * 28}ms` }} aria-hidden="true" /></button>)}
    </div>
  </div>;
}

export function SignalTraceChart() {
  const interaction = useChartInteraction(SIGNAL_TRACE_SPANS.length);
  const selected = interaction.active ?? 0;
  const span = SIGNAL_TRACE_SPANS[selected];

  return <div className={styles.traceChart}>
    <div className={styles.traceHeading}><code>{span.service}</code><DurationNumber value={span.duration} /></div>
    <div
      className={styles.traceRows}
      role="group"
      aria-label="Trace service durations"
      onPointerLeave={interaction.leave}
      onBlur={interaction.handleBlur}
    >
      {SIGNAL_TRACE_SPANS.map((point, index) => <button
        type="button"
        className={styles.traceTarget}
        aria-label={`${point.service}, ${point.operation}, ${point.duration} milliseconds, starting at ${point.offset} milliseconds`}
        aria-pressed={selected === index}
        data-active={selected === index}
        tabIndex={interaction.tabStop === index ? 0 : -1}
        ref={(element) => { interaction.buttons.current[index] = element; }}
        onPointerEnter={(event) => interaction.handleEnter(event, index)}
        onFocus={() => interaction.focused(index)}
        onClick={() => interaction.focus(index)}
        onKeyDown={(event) => interaction.handleKey(event, index)}
        key={point.service}
      >
        <code>{point.service}</code>
        <span className={styles.traceTrack} aria-hidden="true"><span className={styles.traceBar} style={{ width: `${point.duration / defaultDuration * 100}%`, marginLeft: `${point.offset / defaultDuration * 100}%`, backgroundColor: point.color, animationDelay: `${index * 65}ms` }} /></span>
      </button>)}
    </div>
  </div>;
}
