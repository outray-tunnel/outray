import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import { GitHubIcon } from "../GitHubIcon";
import { TunnelDeveloperExperience } from "./TunnelDeveloperExperience";
import { TunnelNetworkDiagram } from "./TunnelNetworkDiagram";
import { TunnelDomainSection, TunnelLocalSection, TunnelProtocolsSection } from "./TunnelAddressSections";
import styles from "./tunnel-sections.module.css";

function Arrow() {
  return <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={1.5} aria-hidden="true" />;
}

const openSourceDetails = [
  { number: "01", title: "Inspect every layer", description: "Follow a request through the CLI, tunnel server, and console. The platform source is available under AGPL-3.0." },
  { number: "02", title: "Make it better, together", description: "Report an issue, share an idea, or contribute a fix. Build the tools you want to use." },
  { number: "03", title: "Run it on your terms", description: "Self-host the platform on your own infrastructure, with your own configuration and instance-owned limits." },
];

function TunnelOpenSourceSection() {
  return (
    <section className={`${styles.section} ${styles.openSource}`} aria-labelledby="tunnel-open-source-title">
      <div className={styles.sourceIntro}>
        <h2 className={styles.title} id="tunnel-open-source-title">Built in the open.<br /><span>Yours to run.</span></h2>
        <p className={styles.description}>Your development workflow shouldn’t be a mystery. Read the code, get involved, or bring OutRay onto your own infrastructure.</p>
        <div className={styles.sourceLinks}>
          <a className="button button-secondary" href="https://github.com/outray-tunnel/outray" target="_blank" rel="noreferrer" data-track="cta" data-track-label="tunnels-source"><GitHubIcon />Explore the source<Arrow /></a>
          <a className="pd-text-link" href="https://discord.gg/DncjGcCHDg" target="_blank" rel="noreferrer">Join the community<Arrow /></a>
        </div>
        <p className={styles.license}>AGPL-3.0 platform · MIT framework SDKs</p>
      </div>
      <ol className={styles.sourceDetails}>
        {openSourceDetails.map((detail) => <li key={detail.number}><span aria-hidden="true">{detail.number}</span><div><h3>{detail.title}</h3><p>{detail.description}</p></div></li>)}
      </ol>
    </section>
  );
}

function TunnelGetStartedSection() {
  return (
    <section className={styles.cta} aria-labelledby="tunnel-start-title">
      <h2 className={styles.title} id="tunnel-start-title">Keep building locally.<br /><span>Let the world in.</span></h2>
      <p className={styles.description}>A webhook, a teammate, a phone on your network.<br />Give your app a way to be reached.</p>
      <div className={styles.ctaActions}><a className="button button-primary" href="/signup" data-track="cta" data-track-label="tunnels-bottom-get-started">Get started<Arrow /></a><a className="pd-text-link" href="/docs/tunnels">Read the docs<Arrow /></a></div>
    </section>
  );
}

export function TunnelFeatureSections() {
  return <>
    <TunnelDeveloperExperience />
    <TunnelNetworkDiagram />
    <TunnelDomainSection />
    <TunnelLocalSection />
    <TunnelProtocolsSection />
    <TunnelOpenSourceSection />
    <TunnelGetStartedSection />
  </>;
}
