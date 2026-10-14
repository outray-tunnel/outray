import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import Activity03Icon from "@outray/icons/stroke/Activity03Icon";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import File01Icon from "@outray/icons/stroke/File01Icon";
import Layers01Icon from "@outray/icons/stroke/Layers01Icon";
import Shield01Icon from "@outray/icons/stroke/Shield01Icon";
import Tick02Icon from "@outray/icons/stroke/Tick02Icon";
import { MetricChart, SignalTraceChart } from "./ObservabilitySignalCharts";
import styles from "./observability-sections.module.css";

const signalCards = [
  { title: "Logs", description: "The right logs, attached to the request that produced them.", icon: File01Icon, color: "#63d9ec", kind: "logs" },
  { title: "Metrics", description: "Spot changes in traffic, errors, and latency. Measure your own operations.", icon: Activity03Icon, color: "#b785ff", kind: "metrics" },
  { title: "Traces", description: "Follow the work across your app and its dependencies.", icon: Layers01Icon, color: "#f5b85b", kind: "traces" },
] as const;

const privacyBenefits = [
  { title: "Sensitive fields stay hidden", description: "Default redaction for credentials and sensitive fields." },
  { title: "Payloads are your choice", description: "Opt in to capture, with bounded sizes." },
  { title: "Rules that fit your app", description: "Choose the fields and headers your app needs redacted." },
] as const;

function Arrow() {
  return <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={1.5} aria-hidden="true" />;
}

function SignalVisual({ kind }: { kind: (typeof signalCards)[number]["kind"] }) {
  if (kind === "logs") return <div className={styles.logVisual} aria-hidden="true">
    <div><span>info</span><code>order.created</code><i /></div>
    <div><span>debug</span><code>inventory.reserved</code><i /></div>
    <div><span>info</span><code>payment.authorized</code><i /></div>
  </div>;
  if (kind === "metrics") return <MetricChart />;
  return <SignalTraceChart />;
}

function ObservabilitySignalsSection() {
  return <section className={styles.featureSection} aria-labelledby="observability-signals-title">
    <div className={styles.centerHeading}><h2 className={styles.sectionTitle} id="observability-signals-title">Every signal. In context.</h2><p className={styles.sectionLead}>Different ways to look. One place to understand.</p></div>
    <div className={styles.signalGrid}>
      {signalCards.map((card) => <article className={styles.signalCard} key={card.kind}>
        <span className={styles.signalIcon} style={{ color: card.color, backgroundColor: `${card.color}0d`, borderColor: `${card.color}33` }} aria-hidden="true"><HugeiconsIcon icon={card.icon} size={25} strokeWidth={1.5} /></span>
        <h3>{card.title}</h3><p>{card.description}</p><SignalVisual kind={card.kind} />
      </article>)}
    </div>
  </section>;
}

function ObservabilityCaptureSection() {
  return <section className={`${styles.featureSection} ${styles.captureSection}`} aria-labelledby="observability-capture-title">
    <div className={styles.captureCopy}><h2 className={styles.sectionTitle} id="observability-capture-title">Capture what matters.<br />Keep control.</h2><p className={styles.sectionLead}>Useful context doesn’t have to mean exposing everything.</p>
      <ul className={styles.privacyBenefits}>{privacyBenefits.map((benefit) => <li key={benefit.title}><span className={styles.privacyCheck} aria-hidden="true"><HugeiconsIcon icon={Tick02Icon} size={18} strokeWidth={1.7} /></span><div><h3>{benefit.title}</h3><p>{benefit.description}</p></div></li>)}</ul>
    </div>
    <div className={styles.captureVisual}>
      <div className={styles.captureToolbar}><div><HugeiconsIcon icon={Shield01Icon} size={19} strokeWidth={1.6} aria-hidden="true" /><span>Capture securely</span></div><span className={styles.capturePill}>Redacted</span></div>
      <pre className={styles.captureCode} tabIndex={0} aria-label="Checkout payload with redacted credentials and personal fields"><code>{"{\n"}<span className={styles.codeKey}>{'  "order_id"'}</span>{": "}<span className={styles.codeString}>{'"ord_8b21"'}</span>{",\n"}<span className={styles.codeKey}>{'  "amount"'}</span>{": "}<span className={styles.codeNumber}>129</span>{",\n"}<span className={styles.codeKey}>{'  "currency"'}</span>{": "}<span className={styles.codeString}>{'"USD"'}</span>{",\n"}<span className={styles.codeKey}>{'  "email"'}</span>{": "}<span className={styles.codeRedacted}>{'"[REDACTED]"'}</span>{",\n"}<span className={styles.codeKey}>{'  "password"'}</span>{": "}<span className={styles.codeRedacted}>{'"[REDACTED]"'}</span>{",\n"}<span className={styles.codeKey}>{'  "authorization"'}</span>{": "}<span className={styles.codeRedacted}>{'"[REDACTED]"'}</span>{"\n}"}</code></pre>
      <div className={styles.captureTags}><span>Credential redaction</span><span>Your custom rules</span></div>
    </div>
  </section>;
}

function ObservabilityGetStartedSection() {
  return <section className={styles.startSection} aria-labelledby="observability-start-title"><h2 id="observability-start-title">Less guessing.<br />More understanding.</h2><p>Connect a service. See what’s really happening.</p><div className={styles.startActions}><Link className={styles.primaryButton} to="/signup" data-track="cta" data-track-label="observability-bottom-get-started">Get started<Arrow /></Link><Link className={styles.textLink} to="/docs/$" params={{ _splat: "observability" }} data-track="cta" data-track-label="observability-bottom-documentation">Read the docs<Arrow /></Link></div></section>;
}

export function ObservabilityFeatureSections() {
  return <><ObservabilitySignalsSection /><ObservabilityCaptureSection /><ObservabilityGetStartedSection /></>;
}
