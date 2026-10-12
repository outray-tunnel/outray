import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import { GitHubIcon } from "../GitHubIcon";
import { TunnelDeveloperExperience } from "./TunnelDeveloperExperience";
import { TunnelNetworkDiagram } from "./TunnelNetworkDiagram";
import { TunnelDomainSection, TunnelLocalSection, TunnelProtocolsSection } from "./TunnelAddressSections";

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
    <section className="grid grid-cols-2 items-start gap-[100px] border-t border-[#202020] py-[100px] max-[900px]:gap-[45px] max-[900px]:py-[78px] max-[620px]:grid-cols-1 max-[620px]:gap-10 max-[620px]:py-[62px]" aria-labelledby="tunnel-open-source-title">
      <div>
        <h2 className="text-[clamp(32px,3.5vw,48px)] leading-[1.13] font-medium tracking-[-0.045em] text-[#eee] max-[620px]:text-[32px] [&>span]:text-[#eee]" id="tunnel-open-source-title">Built in the open.<br /><span>Yours to run.</span></h2>
        <p className="mt-[22px] max-w-[460px] text-[15px] leading-[1.8] text-pretty text-[#b3b3b6] max-[620px]:text-sm">Your development workflow shouldn’t be a mystery. Read the code, get involved, or bring OutRay onto your own infrastructure.</p>
        <div className="mt-[30px] flex flex-wrap items-center gap-x-[22px] gap-y-3.5 max-[900px]:gap-x-3.5 max-[900px]:gap-y-2">
          <a className="inline-flex min-h-11 items-center justify-center gap-2.5 rounded-[9px] border border-white/15 bg-[#151515] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:border-white/25 hover:bg-[#1d1d1d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70 [&>svg]:size-4 [&>svg]:shrink-0" href="https://github.com/outray-tunnel/outray" target="_blank" rel="noreferrer" data-track="cta" data-track-label="tunnels-source"><GitHubIcon />Explore the source<Arrow /></a>
          <a className="inline-flex min-h-10 items-center gap-2 text-xs text-[#bebebe] transition-colors hover:text-[#f2f2f2] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70" href="https://discord.gg/DncjGcCHDg" target="_blank" rel="noreferrer">Join the community<Arrow /></a>
        </div>
        <p className="mt-5 font-mono text-[10px] leading-[1.7] text-[#929292]">AGPL-3.0 platform · MIT framework SDKs</p>
      </div>
      <ol className="m-0 grid list-none gap-[31px] pt-1 max-[620px]:gap-6">
        {openSourceDetails.map((detail) => <li className="grid grid-cols-[30px_minmax(0,1fr)] gap-[15px] border-b border-[#252525] pb-[31px] last:border-0 last:pb-0 max-[620px]:pb-6" key={detail.number}><span className="pt-0.5 font-mono text-[11px] text-[#929292]" aria-hidden="true">{detail.number}</span><div><h3 className="text-lg font-medium tracking-[-0.025em] text-[#f2f2f2] max-[620px]:text-[17px]">{detail.title}</h3><p className="mt-2.5 max-w-[405px] text-[13px] leading-[1.8] text-[#b3b3b6]">{detail.description}</p></div></li>)}
      </ol>
    </section>
  );
}

function TunnelGetStartedSection() {
  return (
    <section className="relative isolate overflow-hidden border-t border-[#252525] px-6 pt-[110px] pb-[90px] text-center max-[620px]:px-0 max-[620px]:pt-[74px] max-[620px]:pb-11" aria-labelledby="tunnel-start-title">
      <h2 className="text-[clamp(36px,4.3vw,60px)] leading-[1.13] font-medium tracking-[-0.045em] text-[#eee] max-[620px]:text-[clamp(32px,8vw,44px)] [&>span]:text-[#eee]" id="tunnel-start-title">Keep building locally.<br /><span>Let the world in.</span></h2>
      <p className="mx-auto mt-[22px] max-w-[560px] text-[15px] leading-[1.8] text-pretty text-[#b3b3b6] max-[620px]:text-sm">A webhook, a teammate, a phone on your network.<br />Give your app a way to be reached.</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3.5"><a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[9px] bg-white px-5 py-[11px] text-[13px] font-semibold text-black transition-colors hover:bg-[#e8e8e8] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70" href="/signup" data-track="cta" data-track-label="tunnels-bottom-get-started">Get started<Arrow /></a><a className="inline-flex min-h-10 items-center gap-2 text-xs text-[#bebebe] transition-colors hover:text-[#f2f2f2] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70" href="/docs/tunnels">Read the docs<Arrow /></a></div>
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
