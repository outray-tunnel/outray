import { useId, useRef, useState, type KeyboardEvent } from "react";
import NumberFlow from "@number-flow/react";
import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import DatabaseIcon from "@outray/icons/stroke/DatabaseIcon";
import Globe02Icon from "@outray/icons/stroke/Globe02Icon";
import Tick02Icon from "@outray/icons/stroke/Tick02Icon";
import styles from "./ObservabilityHero.module.css";

export const OBSERVABILITY_HERO_SPANS = [
  { service: "checkout-api", operation: "POST /api/checkout", duration: 342, offset: 0, color: "#b691ff", root: true, title: "Server request", detail: "POST /api/checkout", icon: Globe02Icon },
  { service: "PostgreSQL", operation: "SELECT products", duration: 84, offset: 10, color: "#22d3ee", root: false, title: "Database query", detail: "SELECT products WHERE id = $1", icon: DatabaseIcon },
  { service: "inventory-api", operation: "GET /inventory", duration: 123, offset: 106, color: "#b691ff", root: false, title: "Inventory request", detail: "GET /inventory", icon: Globe02Icon },
  { service: "payments-api", operation: "POST /payments", duration: 108, offset: 232, color: "#fbbf24", root: false, title: "Payment request", detail: "POST /payments", icon: Globe02Icon },
] as const;

export function heroSpanIndexFromKey(current: number, key: string): number | null {
  if (key === "ArrowDown" || key === "ArrowRight") return (current + 1) % OBSERVABILITY_HERO_SPANS.length;
  if (key === "ArrowUp" || key === "ArrowLeft") return (current + OBSERVABILITY_HERO_SPANS.length - 1) % OBSERVABILITY_HERO_SPANS.length;
  if (key === "Home") return 0;
  if (key === "End") return OBSERVABILITY_HERO_SPANS.length - 1;
  return null;
}

function Arrow() {
  return <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={1.6} aria-hidden="true" />;
}

export function ObservabilityHeroTrace() {
  const id = useId();
  const [selected, setSelected] = useState(1);
  const [hovered, setHovered] = useState<number | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const active = hovered ?? selected;
  const context = OBSERVABILITY_HERO_SPANS[active];

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = heroSpanIndexFromKey(index, event.key);
    if (next === null) return;
    event.preventDefault();
    setHovered(null);
    setSelected(next);
    buttons.current[next]?.focus();
  }

  return (
    <figure className={styles.waterfall} aria-label="A 342 millisecond checkout request connected to database, inventory, and payment spans">
      <div className={styles.traceCard}>
        <div className={styles.cardHeading}>
          <span className={styles.service}><span className={styles.serviceIcon} aria-hidden="true"><HugeiconsIcon icon={Globe02Icon} size={17} strokeWidth={1.5} /></span>checkout-api</span>
          <span className={styles.status}><HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={1.8} aria-hidden="true" />200 OK</span>
        </div>

        <div className={styles.requestHeading}>
          <div className={styles.requestName}><span>POST</span><code>/api/checkout</code></div>
          <p className={styles.duration}>342<span>ms</span></p>
        </div>

        <div className={styles.timeline}>
          <div className={styles.axis} aria-hidden="true"><span /><div><span>0 ms</span><span>171 ms</span><span>342 ms</span></div></div>
          <ol className={styles.spanList} aria-label="Request trace spans">
            {OBSERVABILITY_HERO_SPANS.map((span, index) => (
              <li key={span.service}>
                <button type="button" className={`${styles.spanRow} ${span.root ? styles.rootSpan : ""}`}
                  id={`${id}-span-${index}`} aria-label={`Inspect ${span.service} span, ${span.duration} milliseconds`}
                  aria-pressed={selected === index} aria-controls={`${id}-span-detail`}
                  data-active={active === index} tabIndex={selected === index ? 0 : -1}
                  ref={(element) => { buttons.current[index] = element; }}
                  onPointerEnter={() => setHovered(index)} onPointerLeave={() => setHovered(null)}
                  onFocus={() => { setHovered(null); setSelected(index); }} onClick={() => setSelected(index)}
                  onKeyDown={(event) => handleKey(event, index)}
                >
                <span className={styles.spanLabel}>
                  <span className={styles.spanService}>{!span.root ? <span className={styles.branch} aria-hidden="true" /> : null}{span.service}</span>
                  <span className={styles.spanOperation}>{span.operation}<span>{span.duration} ms</span></span>
                </span>
                <span className={styles.spanTrack} aria-hidden="true">
                  <span className={styles.spanBar} style={{ left: `${span.offset / 342 * 100}%`, width: `${span.duration / 342 * 100}%`, backgroundColor: span.color, animationDelay: `${index * 160}ms` }}>
                    {span.root ? <span className={styles.traceSweep} /> : null}
                  </span>
                </span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.traceFooter}><span><i aria-hidden="true" />4 spans, one story.</span><span className={styles.traceLabel}>Trace waterfall</span></div>
      </div>

      <div className={styles.contextCard} id={`${id}-span-detail`} role="region" aria-label="Selected hero span details">
        <span className={styles.contextIcon} style={{ color: context.color }} aria-hidden="true"><HugeiconsIcon icon={context.icon} size={19} strokeWidth={1.5} /></span>
        <div><span className={styles.contextTitle}>{context.title}</span><code>{context.detail}</code></div>
        <span className={styles.contextDuration}><NumberFlow value={context.duration} suffix=" ms" locales="en-US" respectMotionPreference isolate /></span>
      </div>
    </figure>
  );
}

export function ObservabilityHero() {
  return (
    <section className="relative isolate grid min-h-[min(830px,calc(100svh-var(--header-height)))] grid-cols-[minmax(0,.94fr)_minmax(0,1.06fr)] items-center gap-x-[clamp(25px,3vw,52px)] py-[94px_108px] min-[1600px]:min-h-[860px] max-[1100px]:min-h-[720px] max-[1100px]:py-[78px_84px] max-[820px]:min-h-0 max-[820px]:grid-cols-1 max-[820px]:gap-y-12 max-[820px]:py-[65px_72px] max-[540px]:gap-y-10 max-[540px]:py-[49px_54px]" aria-labelledby="product-title">
      <div className="relative z-[2] min-w-0 max-[820px]:text-center">
        <h1 className="text-[clamp(56px,5.3vw,80px)] leading-[1.04] font-[530] tracking-[-.055em] text-[#f5f5f5] max-[1100px]:text-[clamp(49px,5.2vw,66px)] max-[820px]:text-[clamp(51px,8.5vw,74px)] max-[540px]:text-[clamp(39px,9.5vw,51px)] max-[540px]:leading-[1.08] [&>span]:block" id="product-title"><span>Know what</span><span>happened.</span><span className="text-[#b79af1]">And why.</span></h1>
        <p className="mt-7 max-w-[440px] text-[17px] leading-[1.8] text-[#aaa] max-[1100px]:text-[15px] max-[820px]:mx-auto max-[820px]:max-w-[480px] max-[820px]:text-base max-[540px]:mt-6 max-[540px]:max-w-[350px] max-[540px]:text-sm">Requests, traces, logs, and metrics. Connected, so you can stop guessing.</p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 max-[820px]:justify-center max-[540px]:mt-7 max-[540px]:gap-x-5">
          <Link className="inline-flex min-h-[49px] items-center justify-center gap-2 rounded-[11px] bg-white px-[21px] py-[13px] text-sm font-semibold text-black transition-colors hover:bg-[#e8e8e8] focus-visible:outline-2 focus-visible:outline-offset-[5px] focus-visible:outline-[#b691ff] motion-reduce:transition-none max-[540px]:min-h-[46px] max-[540px]:px-[17px] max-[540px]:py-3 max-[540px]:text-[13px]" to="/signup" data-track="cta" data-track-label="observability-get-started">Start observing<Arrow /></Link>
          <Link className="inline-flex min-h-11 items-center gap-2.5 rounded-[5px] text-sm text-[#b9b9b9] transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[5px] focus-visible:outline-[#b691ff] motion-reduce:transition-none max-[540px]:text-[13px] [&>svg]:transition-transform [&>svg]:duration-150 hover:[&>svg]:translate-x-[3px] motion-reduce:[&>svg]:transition-none motion-reduce:hover:[&>svg]:translate-x-0" to="/docs/$" params={{ _splat: "observability" }} data-track="cta" data-track-label="observability-documentation">Read the docs<Arrow /></Link>
        </div>
      </div>
      <ObservabilityHeroTrace />
    </section>
  );
}
