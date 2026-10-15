import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import Clock01Icon from "@outray/icons/stroke/Clock01Icon";
import styles from "./UptimeHero.module.css";

export function UptimeHero() {
  return <section className={styles.hero} aria-labelledby="product-title">
    <div className={styles.copy}>
      <h1 id="product-title">Catch downtime.<br />Keep their <span>trust.</span></h1>
      <p className={styles.lead}>Know when your endpoints stop answering. Keep your team informed and your users in the loop.</p>
      <div className={styles.actions}><Link className={styles.primaryButton} to="/signup" data-track="cta" data-track-label="uptime-get-started">Get started<HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={1.6} aria-hidden="true" /></Link><Link className={styles.textLink} to="/docs/$" params={{ _splat: "uptime" }} data-track="cta" data-track-label="uptime-documentation">Read the docs<HugeiconsIcon icon={ArrowRight01Icon} size={17} strokeWidth={1.6} aria-hidden="true" /></Link></div>
      <p className={styles.setupNote}><HugeiconsIcon icon={Clock01Icon} size={13} strokeWidth={1.5} aria-hidden="true" />One-minute checks. No SDK required.</p>
    </div>
  </section>;
}
