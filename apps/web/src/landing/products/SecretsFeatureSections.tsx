import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import Clock01Icon from "@outray/icons/stroke/Clock01Icon";
import File01Icon from "@outray/icons/stroke/File01Icon";
import Layers01Icon from "@outray/icons/stroke/Layers01Icon";
import SecurityLockIcon from "@outray/icons/stroke/SecurityLockIcon";
import Shield01Icon from "@outray/icons/stroke/Shield01Icon";
import Tick02Icon from "@outray/icons/stroke/Tick02Icon";
import ViewIcon from "@outray/icons/stroke/ViewIcon";
import ViewOffIcon from "@outray/icons/stroke/ViewOffIcon";
import styles from "./SecretsFeatureSections.module.css";

export const SECRET_HISTORY_VERSIONS = [
  { version: 3, current: true, action: "Updated", actor: "Akin", date: "Oct 15, 09:32", description: "Connection settings updated", color: "#b785ff" },
  { version: 2, current: false, action: "Imported", actor: "Deploy workflow", date: "Oct 14, 16:08", description: "Imported from environment file", color: "#22d3ee" },
  { version: 1, current: false, action: "Created", actor: "Akin", date: "Oct 12, 11:20", description: "Secret added to Production", color: "#fbbf24" },
] as const;

export const SECRET_AUDIT_EVENTS = [
  { actor: "Akin", action: "Updated", target: "DATABASE_URL", time: "09:32", dateTime: "2026-10-15T09:32:00", machine: false },
  { actor: "Production deploy", action: "Read", target: "6 secrets", time: "09:28", dateTime: "2026-10-15T09:28:00", machine: true },
  { actor: "Akin", action: "Revealed", target: "WEBHOOK_SECRET", time: "09:14", dateTime: "2026-10-15T09:14:00", machine: false },
] as const;

const sharedValues = [
  { key: "API_BASE_URL", value: "https://api.example.com" },
  { key: "SERVICE_NAME", value: "checkout-api" },
  { key: "NODE_ENV", value: "production" },
] as const;

function Arrow() {
  return <HugeiconsIcon icon={ArrowRight01Icon} size={17} strokeWidth={1.6} aria-hidden="true" />;
}

export function secretHistoryIndexFromKey(current: number, key: string): number | null {
  if (key === "ArrowDown" || key === "ArrowRight") return (current + 1) % SECRET_HISTORY_VERSIONS.length;
  if (key === "ArrowUp" || key === "ArrowLeft") return (current + SECRET_HISTORY_VERSIONS.length - 1) % SECRET_HISTORY_VERSIONS.length;
  if (key === "Home") return 0;
  if (key === "End") return SECRET_HISTORY_VERSIONS.length - 1;
  return null;
}

export function SecretShareVisual() {
  const [revealed, setRevealed] = useState(false);
  const [remaining, setRemaining] = useState(3);
  const [revoked, setRevoked] = useState(false);
  const unavailable = revoked || remaining === 0;
  const status = revoked ? "Revoked" : remaining === 0 ? "Limit reached" : "Active";

  function toggleReveal() {
    if (revealed) {
      setRevealed(false);
    } else if (!unavailable) {
      setRemaining((count) => Math.max(0, count - 1));
      setRevealed(true);
    }
  }

  function createAnother() {
    setRevealed(false);
    setRemaining(3);
    setRevoked(false);
  }

  return <div className={styles.shareVisual}>
    <div className={styles.shareTopline}><span className={styles.shareIcon} aria-hidden="true"><HugeiconsIcon icon={SecurityLockIcon} size={23} strokeWidth={1.5} /></span><span className={styles.shareState} data-revoked={revoked}><i aria-hidden="true" />{status}</span></div>
    <div className={styles.shareTitle}><h3>A private handoff.</h3><p>3 selected values from checkout</p></div>
    <div className={styles.shareLink} aria-label="Encrypted viewing link"><HugeiconsIcon icon={Shield01Icon} size={15} strokeWidth={1.6} aria-hidden="true" /><span>Private viewing link</span><span className={styles.encryptedPill}>Encrypted</span></div>
    <dl className={styles.sharedValues} aria-label="Shared snapshot values">
      {sharedValues.map((entry) => <div key={entry.key}><dt>{entry.key}</dt><dd data-revealed={revealed}>{revealed ? entry.value : "••••••••••••"}</dd></div>)}
    </dl>
    <div className={styles.shareLimits}><span><HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={1.6} aria-hidden="true" />Expires in 1 day</span><span><HugeiconsIcon icon={ViewIcon} size={14} strokeWidth={1.6} aria-hidden="true" />{remaining} reveals left</span></div>
    <div className={styles.shareActions}>
      <button className={styles.revealButton} type="button" onClick={toggleReveal} disabled={!revealed && unavailable} aria-pressed={revealed}><HugeiconsIcon icon={revealed ? ViewOffIcon : ViewIcon} size={16} strokeWidth={1.6} aria-hidden="true" />{revealed ? "Hide values" : revoked ? "Link revoked" : remaining === 0 ? "Reveal limit reached" : "Reveal snapshot"}</button>
      {unavailable ? <button className={styles.subtleButton} type="button" onClick={createAnother}>Create another link<Arrow /></button> : <button className={styles.subtleButton} type="button" onClick={() => setRevoked(true)}>Revoke link</button>}
    </div>
    <p className={styles.shareStatus} role="status">{revoked ? "Future reveals are blocked. Values already revealed are not erased." : revealed ? "Snapshot revealed. Your live vault is unchanged." : "An encrypted snapshot. Not a live connection to your vault."}</p>
  </div>;
}

export function SecretHistoryVisual() {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const version = SECRET_HISTORY_VERSIONS[selected];

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = secretHistoryIndexFromKey(index, event.key);
    if (next === null) return;
    event.preventDefault();
    setSelected(next);
    buttons.current[next]?.focus();
  }

  return <div className={styles.historyVisual}>
    <div className={styles.historyHeader}><span className={styles.historyIcon} aria-hidden="true"><HugeiconsIcon icon={Layers01Icon} size={22} strokeWidth={1.5} /></span><div><code>DATABASE_URL</code><span>checkout / Production</span></div></div>
    <ol className={styles.historyTimeline} aria-label="Secret version history">
      {SECRET_HISTORY_VERSIONS.map((entry, index) => <li key={entry.version}><button
        className={styles.versionButton}
        type="button"
        aria-label={`Inspect version ${entry.version}${entry.current ? ", current" : ""}`}
        aria-pressed={selected === index}
        aria-controls={`${id}-version-detail`}
        tabIndex={selected === index ? 0 : -1}
        ref={(element) => { buttons.current[index] = element; }}
        onClick={() => setSelected(index)}
        onFocus={() => setSelected(index)}
        onKeyDown={(event) => handleKey(event, index)}
      ><span className={styles.versionMarker} style={{ color: entry.color }} aria-hidden="true">{selected === index ? <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={1.7} /> : <i />}</span><span className={styles.versionLabel}><strong>Version {entry.version}</strong><span>{entry.description}</span></span>{entry.current ? <span className={styles.currentPill}>Current</span> : <span className={styles.versionDate}>{entry.date.split(",")[0]}</span>}</button></li>)}
    </ol>
    <div className={styles.versionDetail} id={`${id}-version-detail`} role="region" aria-label="Selected secret version">
      <div className={styles.versionDetailHeading}><span>Version {version.version}</span><span>{version.action}</span></div>
      <div className={styles.maskedValue}><HugeiconsIcon icon={SecurityLockIcon} size={14} strokeWidth={1.6} aria-hidden="true" /><code>••••••••••••••••••••••••</code><span>Value hidden</span></div>
      <dl className={styles.versionMetadata}><div><dt>Changed by</dt><dd>{version.actor}</dd></div><div><dt>Recorded</dt><dd>{version.date}</dd></div></dl>
    </div>
  </div>;
}

function SecretsShareSection() {
  return <section className={styles.section} aria-labelledby="secrets-share-title">
    <div className={styles.sectionCopy}><h2 id="secrets-share-title">Share a secret.<br />Not a seat.</h2><p className={styles.lead}>Share selected secrets without inviting someone to your organization.</p><ul className={styles.shareBenefits}><li><span className={styles.purpleIcon}><HugeiconsIcon icon={SecurityLockIcon} size={18} strokeWidth={1.6} aria-hidden="true" /></span>Encrypted snapshots, not your live vault.</li><li><span className={styles.cyanIcon}><HugeiconsIcon icon={Clock01Icon} size={18} strokeWidth={1.6} aria-hidden="true" /></span>Set an expiry and a reveal limit.</li><li><span className={styles.amberIcon}><HugeiconsIcon icon={Shield01Icon} size={18} strokeWidth={1.6} aria-hidden="true" /></span>Revoke access to future reveals.</li></ul><Link className={styles.textLink} to="/docs/$" params={{ _splat: "secrets/shares" }}>Explore secret sharing<Arrow /></Link></div>
    <SecretShareVisual />
  </section>;
}

function SecretsHistorySection() {
  return <section className={`${styles.section} ${styles.historySection}`} aria-labelledby="secrets-history-title">
    <div className={`${styles.sectionCopy} ${styles.historyCopy}`}><h2 id="secrets-history-title">A way back.<br />Built into every change.</h2><p className={styles.lead}>See who changed a secret and when. Restore an earlier value without losing the history.</p><div className={styles.restoreCue}><span className={styles.purpleIcon}><HugeiconsIcon icon={Layers01Icon} size={20} strokeWidth={1.6} aria-hidden="true" /></span><div><h3>Restore individual secret versions.</h3><p>Previous versions stay in your history.</p></div></div><Link className={styles.textLink} to="/docs/$" params={{ _splat: "secrets/snapshots-and-history" }}>Explore version history<Arrow /></Link></div>
    <SecretHistoryVisual />
    <div className={styles.teamCards}>
      <article className={styles.teamCard} aria-labelledby="secrets-token-title"><span className={styles.cyanIcon}><HugeiconsIcon icon={Shield01Icon} size={20} strokeWidth={1.6} aria-hidden="true" /></span><h3 id="secrets-token-title">Access, without all-access.</h3><p>Give each runner the permissions it needs, scoped to a vault or environment.</p><SecretMachineTokenVisual /><Link className={styles.textLink} to="/docs/$" params={{ _splat: "secrets/access-and-tokens" }}>Explore machine tokens<Arrow /></Link></article>
      <article className={styles.teamCard} aria-labelledby="secrets-audit-title"><span className={styles.amberIcon}><HugeiconsIcon icon={File01Icon} size={20} strokeWidth={1.6} aria-hidden="true" /></span><h3 id="secrets-audit-title">Know who touched what.<br />And when.</h3><p>Follow recorded actions, with their actor, target, and time. Not the secret value.</p><SecretAuditVisual /><Link className={styles.textLink} to="/docs/$" params={{ _splat: "secrets/trash-and-audit" }}>Explore the audit trail<Arrow /></Link></article>
    </div>
  </section>;
}

export function SecretMachineTokenVisual() {
  return <div className={styles.tokenVisual} role="group" aria-label="Scoped machine token">
    <div className={styles.tokenHeader}><div><span className={styles.tokenMarker} aria-hidden="true"><HugeiconsIcon icon={Shield01Icon} size={16} strokeWidth={1.6} /></span><strong>Production deploy</strong></div><span className={styles.tokenActive}><i aria-hidden="true" />Active</span></div>
    <div className={styles.tokenPermission}><code>secrets:read</code><span>Read only</span></div>
    <dl className={styles.tokenMetadata}><div><dt>Vault</dt><dd>checkout</dd></div><div><dt>Environment</dt><dd>Production</dd></div><div><dt>Expires in</dt><dd>30 days</dd></div></dl>
    <div className={styles.tokenBoundary}><HugeiconsIcon icon={SecurityLockIcon} size={13} strokeWidth={1.6} aria-hidden="true" /><span>No write or delete permissions</span></div>
  </div>;
}

export function SecretAuditVisual() {
  return <div className={styles.auditVisual} role="group" aria-label="Recorded secret actions">
    <div className={styles.auditDate}><span>October 15</span><span>Production</span></div>
    <ol className={styles.auditEvents}>{SECRET_AUDIT_EVENTS.map((event) => <li key={`${event.time}-${event.action}`}><span className={styles.actorAvatar} data-machine={event.machine} aria-hidden="true">{event.machine ? <HugeiconsIcon icon={Shield01Icon} size={13} strokeWidth={1.6} /> : "A"}</span><div><span className={styles.auditActor}>{event.actor}</span><span className={styles.auditAction}>{event.action} <code>{event.target}</code></span></div><time dateTime={event.dateTime}>{event.time}</time></li>)}</ol>
  </div>;
}

function SecretsGetStartedSection() {
  return <section className={styles.startSection} aria-labelledby="secrets-start-title"><h2 id="secrets-start-title">Delete your .env file today.</h2><p>Create a vault, add your first environment, and run your app with the right secrets.</p><div className={styles.startActions}><Link className={styles.primaryButton} to="/signup" data-track="cta" data-track-label="secrets-bottom-get-started">Get started<Arrow /></Link><Link className={styles.textLink} to="/docs/$" params={{ _splat: "secrets" }} data-track="cta" data-track-label="secrets-bottom-documentation">Read the docs<Arrow /></Link></div></section>;
}

export function SecretsFeatureSections() {
  return <><SecretsShareSection /><SecretsHistorySection /><SecretsGetStartedSection /></>;
}
