import { useId } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import SecurityLockIcon from "@outray/icons/stroke/SecurityLockIcon";
import { CopyButton } from "../../components/arc/copy-button/copy-button";
import styles from "./tunnel-hero.module.css";

const command = "npx outray 3000";
const rings = Array.from({ length: 12 }, (_, index) => ({
  cx: 235 + index * 28,
  cy: 284 - index * 4,
  rx: 24 + index * 8,
  ry: 34 + index * 16,
}));

function Arrow() {
  return <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={1.5} aria-hidden="true" />;
}

function TunnelConnection() {
  const id = useId();
  return (
    <figure className={styles.connection} aria-label="Example public address connected through OutRay to localhost port 3000">
      <svg className={styles.portal} viewBox="0 0 820 650" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`${id}-wire`} x1="200" y1="300" x2="720" y2="240" gradientUnits="userSpaceOnUse">
            <stop stopColor="#d8d2e6" stopOpacity="0.1" />
            <stop offset="0.65" stopColor="#d8d2e6" stopOpacity="0.4" />
            <stop offset="1" stopColor="var(--accent-light)" stopOpacity="0.68" />
          </linearGradient>
          <radialGradient id={`${id}-glow`}>
            <stop stopColor="var(--accent)" stopOpacity="0.24" />
            <stop offset="0.65" stopColor="var(--accent-deep)" stopOpacity="0.08" />
            <stop offset="1" stopColor="var(--accent-deep)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-route`} x1="150" y1="280" x2="745" y2="150" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--accent-light)" stopOpacity="0" />
            <stop offset="0.4" stopColor="var(--accent-light)" />
            <stop offset="1" stopColor="var(--accent-light)" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <ellipse cx="545" cy="255" rx="280" ry="280" fill={`url(#${id}-glow)`} />
        <g fill="none" stroke={`url(#${id}-wire)`} strokeWidth="0.8">
          {rings.map((ring, index) => <ellipse key={index} {...ring} />)}
          <path d="M237 250C335 209 436 118 543 74M249 259C366 231 530 169 625 139M259 284C394 286 557 272 657 240M249 308C365 340 528 342 625 340M237 318C331 367 440 409 543 426M213 260C286 202 358 111 407 79M211 307C285 347 358 411 407 420" />
        </g>
        <ellipse cx="543" cy="240" rx="112" ry="210" fill="none" stroke="var(--accent-light)" strokeOpacity="0.7" strokeWidth="1.25" />
        <ellipse cx="543" cy="240" rx="108" ry="206" fill="none" stroke="var(--accent-light)" strokeOpacity="0.11" strokeWidth="5" />
        <path d="M126 296H236C365 296 381 242 520 242S649 148 745 148" fill="none" stroke={`url(#${id}-route)`} strokeWidth="1.3" />
        <path className={styles.packet} d="M126 296H236C365 296 381 242 520 242S649 148 745 148" fill="none" stroke="#f0f0f0" strokeWidth="2.5" strokeLinecap="round" />
        <g fill="var(--accent-light)">
          <circle cx="236" cy="296" r="3" />
          <circle cx="745" cy="148" r="3" />
        </g>
      </svg>

      <div className={`${styles.endpoint} ${styles.localEndpoint}`}>
        <span className={styles.endpointLabel}>YOUR MACHINE</span>
        <code>localhost<span>:3000</span></code>
      </div>
      <div className={`${styles.endpoint} ${styles.publicEndpoint}`}>
        <span className={styles.endpointLabel}>PUBLIC ADDRESS</span>
        <code>demo<span>.outray.app</span></code>
        <span className={styles.secureLabel}><HugeiconsIcon icon={SecurityLockIcon} size={12} strokeWidth={1.5} aria-hidden="true" />HTTPS, ready to share</span>
      </div>
    </figure>
  );
}

export function TunnelHero() {
  return (
    <section className={styles.hero} aria-labelledby="product-title">
      <div className={styles.copy}>
        <h1 className={styles.headline} id="product-title"><span>Localhost,</span> <span>meet the world.</span></h1>
        <p className={styles.lead}>A public address for the app on your machine. Share your work, catch real webhooks, and test from anywhere—without a deployment.</p>
        <div className={styles.actions}>
          <a className={`button button-primary ${styles.primary}`} href="/signup" data-track="cta" data-track-label="tunnels-get-started">Start tunneling<Arrow /></a>
        </div>
      </div>
      <TunnelConnection />
      <div className={styles.quickStart}>
        <div className={styles.command}><span aria-hidden="true">$</span><code>{command}</code><CopyButton value={command} iconOnly variant="plain" label="Copy tunnel command" className={styles.copyButton} /></div>
        <a className={styles.docsLink} href="/docs/tunnels" data-track="cta" data-track-label="tunnels-documentation">Learn more<Arrow /></a>
      </div>
    </section>
  );
}
