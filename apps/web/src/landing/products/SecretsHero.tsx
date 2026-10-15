import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import styles from "./SecretsHero.module.css";

function Arrow() {
  return <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={1.6} aria-hidden="true" />;
}

export function SecretsHero() {
  return <section className={styles.hero} aria-labelledby="product-title">
    <div className={styles.copy}>
      <h1 className={styles.title} id="product-title"><span>Your app needs <span className={styles.accent}>secrets.</span></span>{" "}<span>Your codebase doesn’t.</span></h1>
      <p className={styles.lead}>Keep credentials out of repos, group chats, and shell history. Give every environment its own source of truth.</p>
      <div className={styles.actions}><Link className={styles.primaryButton} to="/signup" data-track="cta" data-track-label="secrets-get-started">Get started<Arrow /></Link><Link className={styles.textLink} to="/docs/$" params={{ _splat: "secrets" }} data-track="cta" data-track-label="secrets-documentation">Read the docs<Arrow /></Link></div>
    </div>
  </section>;
}
