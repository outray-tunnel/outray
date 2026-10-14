import { useId, useRef, useState, type KeyboardEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Activity03Icon from "@outray/icons/stroke/Activity03Icon";
import File01Icon from "@outray/icons/stroke/File01Icon";
import Layers01Icon from "@outray/icons/stroke/Layers01Icon";
import styles from "./observability-sections.module.css";

export const OBSERVABILITY_STORY_TRACE_ID = "7f3a9c2d6b4e48a8b5f001b9d312ce20";
export const OBSERVABILITY_STORY_DURATION = 342;
export const OBSERVABILITY_STORY_SPANS = [
  { operation: "POST /api/checkout", service: "checkout-api", offset: 0, duration: 342, color: "#b785ff", kind: "server" },
  { operation: "SELECT products", service: "postgres", offset: 10, duration: 84, color: "#63d9ec", kind: "database" },
  { operation: "GET /inventory", service: "inventory-api", offset: 106, duration: 123, color: "#80aaff", kind: "client" },
  { operation: "POST /payments", service: "payments-api", offset: 232, duration: 108, color: "#f5b85b", kind: "client" },
] as const;

const tabs = [
  { id: "requests", label: "Requests", icon: Activity03Icon },
  { id: "trace", label: "Trace", icon: Layers01Icon },
  { id: "logs", label: "Logs", icon: File01Icon },
] as const;

const logs = [
  { offset: "+0 ms", level: "info", message: "Checkout started", detail: "cart_id=cart_4c91", color: "#63d9ec" },
  { offset: "+94 ms", level: "debug", message: "Cart loaded", detail: "items=3 total=129.00", color: "#b785ff" },
  { offset: "+229 ms", level: "info", message: "Inventory reserved", detail: "items=3 available=true", color: "#63d9ec" },
  { offset: "+340 ms", level: "info", message: "Payment authorized", detail: "currency=USD status=authorized", color: "#63d9ec" },
  { offset: "+342 ms", level: "info", message: "Checkout completed", detail: "status=200 duration_ms=342", color: "#63d9ec" },
] as const;

/** Automatic activation keeps the selected panel and keyboard focus together. */
export function observabilityStoryIndexFromKey(current: number, key: string): number | null {
  if (key === "ArrowRight") return (current + 1) % tabs.length;
  if (key === "ArrowLeft") return (current + tabs.length - 1) % tabs.length;
  if (key === "Home") return 0;
  if (key === "End") return tabs.length - 1;
  return null;
}

/** Vertical roving focus follows the trace from its server span to its dependencies. */
export function observabilityTraceIndexFromKey(current: number, key: string): number | null {
  if (key === "ArrowDown") return (current + 1) % OBSERVABILITY_STORY_SPANS.length;
  if (key === "ArrowUp") return (current + OBSERVABILITY_STORY_SPANS.length - 1) % OBSERVABILITY_STORY_SPANS.length;
  if (key === "Home") return 0;
  if (key === "End") return OBSERVABILITY_STORY_SPANS.length - 1;
  return null;
}

function RequestPanel() {
  return <div className={styles.requestPanel}>
    <div className={styles.requestDetails}>
      <div className={styles.panelTitle}><span className={styles.successDot} />Completed successfully</div>
      <dl className={styles.requestFacts}>
        <div><dt>Method</dt><dd className={styles.purple}>POST</dd></div>
        <div><dt>Path</dt><dd>/api/checkout</dd></div>
        <div><dt>Status</dt><dd className={styles.green}>200 OK</dd></div>
        <div><dt>Duration</dt><dd>342 ms</dd></div>
        <div><dt>Service</dt><dd>checkout-api</dd></div>
        <div><dt>Environment</dt><dd>production</dd></div>
      </dl>
      <div className={styles.relatedSignals} aria-label="Related telemetry">
        <span><HugeiconsIcon icon={Layers01Icon} size={15} strokeWidth={1.6} aria-hidden="true" />4 spans</span>
        <span><HugeiconsIcon icon={File01Icon} size={15} strokeWidth={1.6} aria-hidden="true" />5 logs</span>
      </div>
    </div>
    <div className={styles.payloadPanel}>
      <div className={styles.payloadHeading}><span>Request body</span><span className={styles.redactedBadge}>Sensitive fields redacted</span></div>
      <pre className={styles.requestCode} tabIndex={0} aria-label="Redacted checkout request body"><code>{"{\n"}<span className={styles.codeKey}>{'  "cart_id"'}</span>{": "}<span className={styles.codeString}>{'"cart_4c91"'}</span>{",\n"}<span className={styles.codeKey}>{'  "items"'}</span>{": "}<span className={styles.codeNumber}>3</span>{",\n"}<span className={styles.codeKey}>{'  "email"'}</span>{": "}<span className={styles.codeRedacted}>{'"[REDACTED]"'}</span>{",\n"}<span className={styles.codeKey}>{'  "payment_token"'}</span>{": "}<span className={styles.codeRedacted}>{'"[REDACTED]"'}</span>{"\n}"}</code></pre>
      <div className={styles.responseSummary}><span>Response</span><code>{'{ "order_id": "ord_8b21", "status": "confirmed" }'}</code></div>
    </div>
  </div>;
}

function TracePanel() {
  const id = useId();
  const [selectedSpan, setSelectedSpan] = useState(2);
  const [previewSpan, setPreviewSpan] = useState<number | null>(null);
  const spanButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const activeSpanIndex = previewSpan ?? selectedSpan;
  const activeSpan = OBSERVABILITY_STORY_SPANS[activeSpanIndex];

  function selectSpan(index: number) {
    setSelectedSpan(index);
    setPreviewSpan(null);
  }

  function handleSpanKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = observabilityTraceIndexFromKey(index, event.key);
    if (next === null) return;
    event.preventDefault();
    selectSpan(next);
    spanButtons.current[next]?.focus();
  }

  return <div className={styles.tracePanel}>
    <div className={styles.traceHeading}><div><h3>Where the time went.</h3><p>From the handler to the calls it made.</p></div><span className={styles.traceDuration}>342<span> ms</span></span></div>
    <div className={styles.waterfall}>
      <div className={styles.waterfallAxis} aria-hidden="true"><span>0 ms</span><span>114</span><span>228</span><span>342 ms</span></div>
      <ol className={styles.spanList} aria-label="Checkout trace spans" onMouseLeave={() => setPreviewSpan(null)}>
        {OBSERVABILITY_STORY_SPANS.map((span, index) => <li className={styles.spanRow} key={span.operation}>
          <button
            type="button"
            className={styles.spanButton}
            aria-pressed={selectedSpan === index}
            aria-controls={`${id}-insight`}
            data-active={activeSpanIndex === index}
            tabIndex={selectedSpan === index ? 0 : -1}
            ref={(element) => { spanButtons.current[index] = element; }}
            onClick={() => selectSpan(index)}
            onFocus={() => selectSpan(index)}
            onMouseEnter={() => setPreviewSpan(index)}
            onKeyDown={(event) => handleSpanKey(event, index)}
          >
            <span className={styles.spanLabel}><span className={styles.spanDot} style={{ backgroundColor: span.color }} aria-hidden="true" /><span><code>{span.operation}</code><span>{span.service}</span></span></span>
            <span className={styles.spanTrack} aria-hidden="true"><span className={styles.spanBar} style={{ marginLeft: `${span.offset / OBSERVABILITY_STORY_DURATION * 100}%`, width: `${span.duration / OBSERVABILITY_STORY_DURATION * 100}%`, backgroundColor: span.color, animationDelay: `${index * 100}ms` }} /></span>
            <span className={styles.spanDuration}>{span.duration} ms<span className={styles.srOnly}>, starting at {span.offset} ms</span></span>
          </button>
        </li>)}
      </ol>
    </div>
    <div className={styles.traceInsight} id={`${id}-insight`}><span className={styles.insightMarker} style={{ backgroundColor: activeSpan.color }} aria-hidden="true" /><div><p><strong>{activeSpan.duration} ms in {activeSpan.service}.</strong> See each dependency in the context of the whole request.</p><p className={styles.insightDetails}><code>{activeSpan.operation}</code><span>Starts at {activeSpan.offset} ms</span></p></div></div>
  </div>;
}

function LogsPanel() {
  return <div className={styles.logsPanel}>
    <div className={styles.logHeading}><h3>The logs that belong here.</h3><span>checkout-api</span></div>
    <ol className={styles.logList} aria-label="Logs correlated with the checkout request">
      {logs.map((log) => <li className={styles.logRow} key={log.message}>
        <time>{log.offset}</time>
        <span className={styles.logLevel} style={{ color: log.color }}>{log.level}</span>
        <div><p>{log.message}</p><code>{log.detail}</code></div>
      </li>)}
    </ol>
    <div className={styles.logContext}><span className={styles.purple}>trace_id</span><code>{OBSERVABILITY_STORY_TRACE_ID}</code></div>
  </div>;
}

export function ObservabilityRequestStory() {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = observabilityStoryIndexFromKey(index, event.key);
    if (next === null) return;
    event.preventDefault();
    setSelected(next);
    buttons.current[next]?.focus();
  }

  return <section className={styles.storySection} aria-labelledby="observability-story-title">
    <div className={styles.centerHeading}>
      <h2 className={styles.sectionTitle} id="observability-story-title">One request.<br className={styles.mobileBreak} /> The whole picture.</h2>
      <p className={styles.sectionLead}>Follow the request, its dependencies, and its logs. Without losing the thread.</p>
    </div>
    <div className={styles.console}>
      <div className={styles.consoleToolbar}>
        <div className={styles.storyTabs} role="tablist" aria-label="Explore request telemetry">
          {tabs.map((tab, index) => <button
            type="button"
            role="tab"
            id={`${id}-tab-${tab.id}`}
            aria-controls={`${id}-panel-${tab.id}`}
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            ref={(element) => { buttons.current[index] = element; }}
            className={styles.storyTab}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => handleKey(event, index)}
            key={tab.id}
          ><HugeiconsIcon icon={tab.icon} size={17} strokeWidth={1.6} aria-hidden="true" />{tab.label}</button>)}
        </div>
        <span className={styles.consoleService}><span className={styles.successDot} />checkout-api</span>
      </div>
      <div className={styles.requestContext}>
        <div className={styles.requestPath}><span>POST</span><code>/api/checkout</code></div>
        <div className={styles.contextFacts}><span className={styles.green}>200 OK</span><span>342 ms</span><span>production</span></div>
      </div>
      <div className={styles.storyPanels}>
        {tabs.map((tab, index) => <div
          id={`${id}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${tab.id}`}
          hidden={selected !== index}
          tabIndex={0}
          className={styles.storyPanel}
          key={tab.id}
        >{index === 0 ? <RequestPanel /> : index === 1 ? <TracePanel /> : <LogsPanel />}</div>)}
      </div>
      <div className={styles.consoleFooter}><span>One trace connects it all.</span><code>{OBSERVABILITY_STORY_TRACE_ID.slice(0, 8)}…</code></div>
    </div>
  </section>;
}
