import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import { TunnelDeveloperExperience } from "./TunnelDeveloperExperience";
import { TunnelNetworkDiagram } from "./TunnelNetworkDiagram";
import { TunnelDomainSection, TunnelLocalSection, TunnelProtocolsSection } from "./TunnelAddressSections";

function Arrow() {
  return <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={1.5} aria-hidden="true" />;
}

function TunnelGetStartedSection() {
  return (
    <section className="relative isolate overflow-hidden px-6 pt-[110px] pb-[90px] text-center max-[620px]:px-0 max-[620px]:pt-[74px] max-[620px]:pb-11" aria-labelledby="tunnel-start-title">
      <h2 className="text-[clamp(36px,4.3vw,60px)] leading-[1.13] font-medium tracking-[-0.045em] text-[#eee] max-[620px]:text-[clamp(32px,8vw,44px)] [&>span]:text-[#eee]" id="tunnel-start-title">Keep building locally.<br /><span>Let the world in.</span></h2>
      <p className="mx-auto mt-[22px] max-w-[560px] text-[15px] leading-[1.8] text-pretty text-[#b3b3b6] max-[620px]:text-sm">A webhook, a teammate, a phone on your network.<br />Give your app a way to be reached.</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3.5"><Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[9px] bg-white px-5 py-[11px] text-[13px] font-semibold text-black transition-colors hover:bg-[#e8e8e8] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70" to="/signup" data-track="cta" data-track-label="tunnels-bottom-get-started">Get started<Arrow /></Link><Link className="inline-flex min-h-10 items-center gap-2 text-xs text-[#bebebe] transition-colors hover:text-[#f2f2f2] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70" to="/docs/$" params={{ _splat: "tunnels" }}>Read the docs<Arrow /></Link></div>
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
    <TunnelGetStartedSection />
  </>;
}
