import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import CommandLineIcon from "@outray/icons/stroke/CommandLineIcon";
import Key01Icon from "@outray/icons/stroke/Key01Icon";
import LockKeyIcon from "@outray/icons/stroke/LockKeyIcon";
import RefreshIcon from "@outray/icons/stroke/RefreshIcon";
import Shield01Icon from "@outray/icons/stroke/Shield01Icon";
import Tick02Icon from "@outray/icons/stroke/Tick02Icon";
import { CopyButton } from "../../components/arc/copy-button/copy-button";
import styles from "./SecretsEnvironmentSection.module.css";

export const SECRET_ENVIRONMENTS = [
  { slug: "development", label: "Development", description: "Your local loop", color: "#6ecff6", command: "npm run dev", protected: false, watch: true },
  { slug: "staging", label: "Staging", description: "Your next release", color: "#b79af4", command: "npm start", protected: false, watch: false },
  { slug: "production", label: "Production", description: "Your live application", color: "#f5bd64", command: "npm start", protected: true, watch: false },
] as const;

export const SECRET_ENVIRONMENT_KEYS = ["DATABASE_URL", "REDIS_URL", "SESSION_SECRET", "STRIPE_SECRET_KEY", "OBSERVABILITY_TOKEN", "WEBHOOK_SECRET"] as const;

export function secretsEnvironmentIndexFromKey(current: number, key: string): number | null {
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % SECRET_ENVIRONMENTS.length;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current + SECRET_ENVIRONMENTS.length - 1) % SECRET_ENVIRONMENTS.length;
  if (key === "Home") return 0;
  if (key === "End") return SECRET_ENVIRONMENTS.length - 1;
  return null;
}

export function secretsCommandForEnvironment(index: number): string {
  const environment = SECRET_ENVIRONMENTS[index];
  const lines = [
    `outray secrets run${environment.watch ? " --watch" : ""}`,
    "  --org acme",
    "  --vault checkout",
    `  --env ${environment.slug}`,
    ...(environment.protected ? ["  --confirm-production"] : []),
    `  -- ${environment.command}`,
  ];
  return lines.join(" \\\n");
}

export function SecretsEnvironmentSection() {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const environment = SECRET_ENVIRONMENTS[selected];

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = secretsEnvironmentIndexFromKey(index, event.key);
    if (next === null) return;
    event.preventDefault();
    setSelected(next);
    buttons.current[next]?.focus();
  }

  return <section className={styles.section} aria-labelledby="secrets-environments-title">
    <div className={styles.heading}><h2 id="secrets-environments-title">Secrets change.<br />Your workflow keeps moving.</h2><p>One vault. Separate environments. Straight to your app.</p></div>

    <div className={styles.environmentTabs} role="tablist" aria-label="Choose a secrets environment">
      {SECRET_ENVIRONMENTS.map((item, index) => <button type="button" role="tab" key={item.slug}
        id={`${id}-tab-${item.slug}`} aria-controls={`${id}-panel`} aria-selected={selected === index}
        tabIndex={selected === index ? 0 : -1} className={styles.environmentTab}
        style={{ "--environment-color": item.color } as CSSProperties}
        ref={(element) => { buttons.current[index] = element; }}
        onClick={() => setSelected(index)} onKeyDown={(event) => handleKey(event, index)}
        title={item.description}
      ><span className={styles.environmentSymbol} aria-hidden="true">{item.protected ? <HugeiconsIcon icon={LockKeyIcon} size={15} strokeWidth={1.5} /> : <i />}</span><span>{item.label}</span></button>)}
    </div>

    <div className={styles.environmentGrid} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${environment.slug}`} style={{ "--environment-color": environment.color } as CSSProperties}>
      <div className={styles.vault} key={`vault-${environment.slug}`}>
        <div className={styles.vaultHeading}><span className={styles.vaultIcon} aria-hidden="true"><HugeiconsIcon icon={Key01Icon} size={22} strokeWidth={1.5} /></span><div><h3>checkout</h3><span>Environment vault</span></div><span className={styles.encrypted}><HugeiconsIcon icon={Shield01Icon} size={13} strokeWidth={1.5} aria-hidden="true" />Encrypted</span></div>
        <div className={styles.vaultContext}><span><i aria-hidden="true" />{environment.label}</span><span>{SECRET_ENVIRONMENT_KEYS.length} secrets</span></div>
        <ul className={styles.keys} aria-label={`${environment.label} secret keys`}>
          {SECRET_ENVIRONMENT_KEYS.map((key, index) => <li key={key} style={{ "--row": index } as CSSProperties}><HugeiconsIcon icon={Key01Icon} size={13} strokeWidth={1.5} aria-hidden="true" /><code>{key}</code><span className={styles.mask} aria-label="Value hidden">••••••••••••</span></li>)}
        </ul>
        <div className={styles.vaultFooter}><span className={environment.protected ? styles.protected : ""}><HugeiconsIcon icon={LockKeyIcon} size={13} strokeWidth={1.5} aria-hidden="true" />{environment.protected ? "Production confirmation required" : "Values hidden by default"}</span><span className={styles.vaultSignature} aria-hidden="true">•••</span></div>
      </div>

      <div className={styles.handoff} key={`handoff-${environment.slug}`} aria-hidden="true"><span className={styles.flowTrack}><i /></span><span className={styles.handoffIcon}><HugeiconsIcon icon={LockKeyIcon} size={16} strokeWidth={1.5} /></span><span className={styles.flowTrack}><i /></span></div>

      <div className={styles.runtime}>
        <div className={styles.runtimeCopy}><h3>{environment.watch ? "Update a secret. Stay in flow." : environment.protected ? "Production. On your terms." : "Ready for your next release."}</h3><p>{environment.watch ? "Watch mode polls for changes and restarts your app with fresh values." : environment.protected ? "Run with Production values, with an explicit confirmation." : "Run your existing command with Staging values. No dotenv file."}</p></div>
        <div className={styles.terminal} key={`terminal-${environment.slug}`}>
          <div className={styles.terminalHeading}><span className={styles.windowDots} aria-hidden="true"><i /><i /><i /></span><span>~/checkout</span><CopyButton value={secretsCommandForEnvironment(selected)} label={`Copy ${environment.label} run command`} className={styles.copyButton} /></div>
          <pre className={styles.command} tabIndex={0} aria-label={`${environment.label} runtime injection command`}><code><span className={styles.prompt} aria-hidden="true">$ </span><span className={styles.commandName}>outray secrets run{environment.watch ? " --watch" : ""}</span>{" \\\n  "}<span className={styles.flag}>--org</span>{" acme \\\n  "}<span className={styles.flag}>--vault</span>{" checkout \\\n  "}<span className={styles.flag}>--env</span>{" "}<span className={styles.commandEnvironment}>{environment.slug}</span>{environment.protected ? <span className={styles.confirmation}>{" \\\n  --confirm-production"}</span> : null}{" \\\n  -- "}<span className={styles.childCommand}>{environment.command}</span></code></pre>
          <div className={styles.terminalReceipt}><HugeiconsIcon icon={Tick02Icon} size={13} strokeWidth={1.8} aria-hidden="true" /><span>{SECRET_ENVIRONMENT_KEYS.length} values delivered to the child process</span><span className={styles.receiptKeys} aria-hidden="true">{SECRET_ENVIRONMENT_KEYS.map((key, index) => <i key={key} style={{ "--row": index } as CSSProperties} />)}</span></div>
        </div>
        <div className={styles.process} key={`process-${environment.slug}`}>
          <span className={styles.processIcon} aria-hidden="true"><HugeiconsIcon icon={CommandLineIcon} size={21} strokeWidth={1.5} /></span>
          <div><span>Your application</span><code>{environment.command}</code></div>
          <span className={styles.processEnvironment}>{environment.watch ? <><span className={styles.watchIcon} aria-hidden="true"><HugeiconsIcon icon={RefreshIcon} size={12} strokeWidth={1.6} /></span>Watching for changes</> : <><HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={1.8} aria-hidden="true" />Injected at startup</>}</span>
        </div>
        <Link className={styles.docsLink} to="/docs/$" params={{ _splat: "secrets/cli" }}>Explore CLI workflows<HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.6} aria-hidden="true" /></Link>
      </div>
    </div>
  </section>;
}
