import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import NumberFlow from "@number-flow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import DatabaseIcon from "@outray/icons/stroke/DatabaseIcon";
import File01Icon from "@outray/icons/stroke/File01Icon";
import Globe02Icon from "@outray/icons/stroke/Globe02Icon";
import Layers01Icon from "@outray/icons/stroke/Layers01Icon";
import Tick02Icon from "@outray/icons/stroke/Tick02Icon";
import styles from "./ObservabilityJourney.module.css";

export const OBSERVABILITY_STORY_TRACE_ID = "7f3a9c2d6b4e48a8b5f001b9d312ce20";
export const OBSERVABILITY_STORY_DURATION = 342;
export const OBSERVABILITY_STORY_SPANS = [
  { operation: "POST /api/checkout", service: "checkout-api", offset: 0, duration: 342, color: "#b785ff", kind: "server" },
  { operation: "SELECT products", service: "postgres", offset: 10, duration: 84, color: "#22d3ee", kind: "database" },
  { operation: "GET /inventory", service: "inventory-api", offset: 106, duration: 123, color: "#80aaff", kind: "client" },
  { operation: "POST /payments", service: "payments-api", offset: 232, duration: 108, color: "#fbbf24", kind: "client" },
] as const;

const stages = [
  {
    title: "Server request", icon: Globe02Icon,
    description: "Your request, with every downstream call attached.",
    logs: [{ at: 0, level: "info", message: "Checkout started" }, { at: 342, level: "info", message: "Checkout completed" }],
    codeTitle: "Request body",
    fields: [{ key: "cart_id", value: '"cart_4c91"' }, { key: "email", value: '"[REDACTED]"' }, { key: "payment_token", value: '"[REDACTED]"' }],
  },
  {
    title: "Database query", icon: DatabaseIcon,
    description: "Three products loaded before checkout continues.",
    logs: [{ at: 94, level: "debug", message: "Cart loaded" }],
    codeTitle: "Query attributes",
    fields: [{ key: "db.system", value: '"postgresql"' }, { key: "db.operation", value: '"SELECT"' }, { key: "items", value: "3" }],
  },
  {
    title: "Inventory request", icon: Layers01Icon,
    description: "Availability checked for every item in the cart.",
    logs: [{ at: 229, level: "info", message: "Inventory reserved" }],
    codeTitle: "Response body",
    fields: [{ key: "items", value: "3" }, { key: "available", value: "true" }, { key: "status", value: '"reserved"' }],
  },
  {
    title: "Payment request", icon: Globe02Icon,
    description: "Payment authorized before the response is sent.",
    logs: [{ at: 340, level: "info", message: "Payment authorized" }],
    codeTitle: "Request body",
    fields: [{ key: "currency", value: '"USD"' }, { key: "payment_token", value: '"[REDACTED]"' }, { key: "amount", value: "129.00" }],
  },
] as const;

const connections = [
  "M 36 50 H 38 Q 41 50 41 42 V 9 Q 41 0 46 0",
  "M 36 50 H 46",
  "M 36 50 H 38 Q 41 50 41 58 V 91 Q 41 100 46 100",
];
const numberFormat = { useGrouping: false, maximumFractionDigits: 0 } as const;
const numberTiming = { duration: 430, easing: "cubic-bezier(.22, 1, .36, 1)" };

export function observabilityJourneyIndexFromKey(current: number, key: string): number | null {
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % OBSERVABILITY_STORY_SPANS.length;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current + OBSERVABILITY_STORY_SPANS.length - 1) % OBSERVABILITY_STORY_SPANS.length;
  if (key === "Home") return 0;
  if (key === "End") return OBSERVABILITY_STORY_SPANS.length - 1;
  return null;
}

export function ObservabilityRequestStory() {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const active = hovered ?? selected;
  const span = OBSERVABILITY_STORY_SPANS[active];
  const stage = stages[active];

  function selectStage(index: number) {
    setHovered(null);
    setSelected(index);
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = observabilityJourneyIndexFromKey(index, event.key);
    if (next === null) return;
    event.preventDefault();
    selectStage(next);
    buttons.current[next]?.focus();
  }

  return <section className={styles.section} aria-labelledby="observability-story-title">
    <div className={styles.heading}>
      <h2 id="observability-story-title">One request.<br />Every connection.</h2>
      <p>Not just the response.<br /> The work that made it happen.</p>
    </div>

    <div className={styles.journey}>
      <div className={styles.map}>
        <div className={styles.graph}>
          <svg className={styles.connections} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {connections.map((path, index) => <g key={path} data-active={active === 0 || active === index + 1} style={{ "--stage-color": OBSERVABILITY_STORY_SPANS[index + 1].color } as CSSProperties}>
              <path d={path} className={styles.connection} vectorEffect="non-scaling-stroke" />
              <path key={`${index}-${active}`} d={path} pathLength="1" className={styles.packet} vectorEffect="non-scaling-stroke" />
            </g>)}
          </svg>
          <ol className={styles.stages} aria-label="Checkout request journey" onMouseLeave={() => setHovered(null)}>
            {OBSERVABILITY_STORY_SPANS.map((item, index) => <li className={index === 0 ? styles.rootStage : styles.dependencyStage} key={item.service}>
              <button type="button" className={styles.stage}
                id={`${id}-stage-${index}`} aria-label={`Explore ${item.service}`}
                aria-pressed={selected === index} aria-controls={`${id}-detail`}
                data-active={active === index} tabIndex={selected === index ? 0 : -1}
                style={{ "--stage-color": item.color } as CSSProperties}
                ref={(element) => { buttons.current[index] = element; }}
                onClick={() => selectStage(index)} onFocus={() => selectStage(index)}
                onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)}
                onKeyDown={(event) => handleKey(event, index)}
              >
                <span className={styles.stageIcon} aria-hidden="true"><HugeiconsIcon icon={stages[index].icon} size={23} strokeWidth={1.5} /></span>
                <span className={styles.stageName}><strong>{item.service}</strong><code>{index === 0 ? "/api/checkout" : item.operation}</code></span>
                <span className={styles.stageTime}>{item.duration}<span> ms</span></span>
                <span className={styles.stagePort} aria-hidden="true" />
              </button>
            </li>)}
          </ol>
        </div>
        <div className={styles.mapCaption}><span><i aria-hidden="true" />4 spans. 5 logs. One shared trace.</span><code title={OBSERVABILITY_STORY_TRACE_ID}>7f3a9c2d…</code></div>
      </div>

      <div className={styles.detail} id={`${id}-detail`} role="region" aria-label="Selected request stage details" style={{ "--stage-color": span.color } as CSSProperties}>
        <div className={styles.detailHeading}>
          <div><span className={styles.kind}>{stage.title}</span><h3>{span.service}</h3></div>
          <NumberFlow className={styles.duration} value={span.duration} suffix=" ms" locales="en-US" format={numberFormat} transformTiming={numberTiming} spinTiming={numberTiming} respectMotionPreference isolate />
        </div>
        <div className={styles.operation}><code>{span.operation}</code><span><HugeiconsIcon icon={Tick02Icon} size={13} strokeWidth={1.8} aria-hidden="true" />{active === 0 ? "200 OK" : "Completed"}</span></div>
        <p className={styles.description}>{stage.description}</p>
        <div className={styles.timing} role="img" aria-label={`${span.operation}: starts at ${span.offset} ms, takes ${span.duration} ms of the 342 ms request`}>
          <div className={styles.timingTrack}><span style={{ marginLeft: `${span.offset / OBSERVABILITY_STORY_DURATION * 100}%`, width: `${span.duration / OBSERVABILITY_STORY_DURATION * 100}%` }} /></div>
          <div><span>Starts at +{span.offset} ms</span><span>342 ms total</span></div>
        </div>

        <div className={styles.evidence}>
          <div className={styles.logs}>
            <span className={styles.evidenceLabel}><HugeiconsIcon icon={File01Icon} size={14} strokeWidth={1.6} aria-hidden="true" />Correlated logs</span>
            <ol aria-label={`Logs related to ${span.operation}`}>
              {stage.logs.map((log) => <li key={log.message}><time dateTime={`PT${log.at / 1000}S`}>+{log.at} ms</time><span>{log.message}</span><span className={styles.logLevel}>{log.level}</span></li>)}
            </ol>
          </div>
          <div className={styles.payload}>
            <span className={styles.evidenceLabel}>{stage.codeTitle}</span>
            <pre aria-label={`${stage.codeTitle} for ${span.service}`} tabIndex={0}><code>{stage.fields.map((field) => <span className={styles.codeLine} key={field.key}><span className={styles.codeKey}>{`"${field.key}"`}</span>{": "}<span className={field.value.includes("REDACTED") ? styles.redacted : styles.codeValue}>{field.value}</span></span>)}</code></pre>
          </div>
        </div>
      </div>
    </div>
  </section>;
}
