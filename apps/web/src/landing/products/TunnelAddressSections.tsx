import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import DatabaseIcon from "@outray/icons/stroke/DatabaseIcon";
import FlashIcon from "@outray/icons/stroke/FlashIcon";
import Gamepad01Icon from "@outray/icons/stroke/Gamepad01Icon";
import Globe02Icon from "@outray/icons/stroke/Globe02Icon";
import HotspotIcon from "@outray/icons/stroke/HotspotIcon";
import Shield01Icon from "@outray/icons/stroke/Shield01Icon";
import Tick02Icon from "@outray/icons/stroke/Tick02Icon";
import { CopyButton } from "../../components/arc/copy-button/copy-button";

const sectionClass = "relative py-28 [--foreground:#f3f3f3] [--surface-muted:#242424] [--text-secondary:#a0a0a0] max-[1000px]:py-[86px] max-[760px]:py-[70px] max-[440px]:py-[58px]";
const splitSectionClass = "grid grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] items-center gap-[clamp(40px,7vw,100px)] max-[1000px]:gap-[38px] max-[760px]:grid-cols-1 max-[760px]:gap-10";
const titleClass = "text-[clamp(36px,4vw,48px)] leading-[1.08] font-[520] tracking-[-0.048em] text-balance text-[#fafafa] max-[1000px]:text-[44px] max-[760px]:text-[clamp(36px,6vw,46px)] [&>span]:text-[#fafafa]";
const leadClass = "mt-[26px] max-w-[480px] text-base leading-[1.8] text-[#b3b3b3] max-[1000px]:text-sm [&>code]:font-mono [&>code]:text-[.85em] [&>code]:text-[#e7e7e7]";
const linkClass = "mt-[25px] inline-flex min-h-11 items-center gap-2.5 rounded-sm text-[13px] text-[#eee] transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[5px] focus-visible:outline-[#b0b0b0] motion-reduce:transition-none [&>svg]:transition-transform [&>svg]:duration-150 hover:[&>svg]:translate-x-[3px] motion-reduce:[&>svg]:transition-none motion-reduce:hover:[&>svg]:translate-x-0";

function Arrow() {
  return <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.6} aria-hidden="true" />;
}

function Check() {
  return <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#a78bfa]/25 bg-[#a78bfa]/7 text-[#b695ff]" aria-hidden="true"><HugeiconsIcon icon={Tick02Icon} size={20} strokeWidth={1.8} /></span>;
}

function Command({ command, label, className = "border-[#3c3c3c] bg-[#111]" }: { command: string; label: string; className?: string }) {
  return <div className={`flex min-h-[49px] min-w-0 items-center gap-[11px] rounded-[10px] border py-[5px] pr-1.5 pl-3.5 [&>code]:min-w-0 [&>code]:flex-1 [&>code]:[overflow-wrap:anywhere] [&>code]:font-mono [&>code]:text-xs [&>code]:leading-[1.65] [&>code]:text-[#ededed] [&>span]:font-mono [&>span]:text-xs [&>span]:text-[#969696] ${className}`}><span aria-hidden="true">$</span><code>{command}</code><CopyButton value={command} label={label} iconOnly variant="plain" className="h-[34px] min-h-[34px] w-[34px] shrink-0 rounded-md p-0 text-[#a6a6a6] focus-visible:outline-2 focus-visible:outline-offset-[5px] focus-visible:outline-[#b0b0b0]" /></div>;
}

export function TunnelDomainSection() {
  return <section className={`${sectionClass} ${splitSectionClass}`} aria-labelledby="tunnel-domain-title">
    <div className="min-w-0">
      <h2 className={titleClass} id="tunnel-domain-title">Bring your<br /><span>own domain.</span></h2>
      <p className={leadClass}>Connect your own domain and get automatic HTTPS.</p>
      <ul className="mt-8 grid list-none gap-[18px] p-0 text-[15px] leading-[1.5] text-[#c2c2c2] max-[440px]:text-sm [&>li]:flex [&>li]:items-center [&>li]:gap-4">
        <li><Check />Automatic SSL/TLS certificates</li>
        <li><Check />Simple CNAME configuration</li>
        <li><Check />The same address when you reconnect</li>
      </ul>
      <Link className={linkClass} to="/docs/$" params={{ _splat: "custom-domains" }}>Connect a domain<Arrow /></Link>
    </div>
    <figure className="relative m-0 min-w-0 rounded-[18px] border border-[#414141] bg-[#111] max-[760px]:w-full max-[760px]:max-w-[580px] max-[760px]:justify-self-center" aria-label="Custom-domain DNS configuration">
      <div className="flex min-w-0 items-center gap-[15px] rounded-t-[18px] border-b border-[#353535] bg-[#191919] px-[21px] py-[17px] max-[440px]:gap-2.5 max-[440px]:p-[15px] [&>code]:min-w-0 [&>code]:[overflow-wrap:anywhere] [&>code]:font-mono [&>code]:text-[11px] [&>code]:text-[#d0d0d0] max-[440px]:[&>code]:text-[10px]"><span className="flex shrink-0 gap-[5px] [&>i]:size-1.5 [&>i]:rounded-full [&>i]:border [&>i]:border-[#606060] [&>i]:bg-[#303030]" aria-hidden="true"><i /><i /><i /></span><code>preview.example.com</code></div>
      <div className="flex items-center gap-[15px] px-[26px] pt-[29px] pb-6 max-[1000px]:px-[18px] max-[1000px]:py-6 max-[760px]:px-6 max-[760px]:py-[27px] max-[440px]:gap-3 max-[440px]:px-4 max-[440px]:py-[23px]">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#454545] bg-[#292929] text-[#c084fc] max-[440px]:size-[37px]" aria-hidden="true"><HugeiconsIcon icon={Globe02Icon} size={25} strokeWidth={1.4} /></span>
        <div><p className="m-0 text-[17px] text-[#f2f2f2] max-[440px]:text-[15px]">Your domain, connected.</p><span className="mt-[7px] block font-mono text-[10px] text-[#969696]">Public address → localhost:3000</span></div>
      </div>
      <dl className="mx-[26px] my-0 max-[1000px]:mx-[18px] max-[760px]:mx-6 max-[440px]:mx-4 [&>div]:grid [&>div]:grid-cols-[105px_minmax(0,1fr)] [&>div]:gap-3.5 [&>div]:border-t [&>div]:border-[#2b2b2b] [&>div]:py-[19px] max-[1000px]:[&>div]:grid-cols-[80px_minmax(0,1fr)] max-[1000px]:[&>div]:gap-2.5 max-[440px]:[&>div]:grid-cols-[74px_minmax(0,1fr)] [&_dt]:grid [&_dt]:content-start [&_dt]:gap-[7px] [&_dt]:text-[11px] [&_dt]:text-[#969696] [&_dt>span]:font-mono [&_dt>span]:text-[10px] [&_dt>span]:text-[#d0d0d0] [&_dd]:m-0 [&_dd]:grid [&_dd]:min-w-0 [&_dd]:gap-[7px] [&_dd>code]:[overflow-wrap:anywhere] [&_dd>code]:font-mono [&_dd>code]:text-[10px] [&_dd>code]:leading-[1.7] [&_dd>code]:text-[#e2e2e2] [&_dd>span]:text-[11px] [&_dd>span]:text-[#969696]">
        <div><dt><span>CNAME</span>Route visitors</dt><dd><code>preview.example.com</code><span>Workspace-provided target</span></dd></div>
        <div><dt><span>TXT</span>Verify ownership</dt><dd><code>_outray-challenge.preview.example.com</code><span>Your domain’s ownership token</span></dd></div>
      </dl>
      <div className="mt-3 mr-[26px] mb-6 ml-[26px] max-[1000px]:mx-[18px] max-[1000px]:mt-3 max-[1000px]:mb-6 max-[760px]:mx-6 max-[440px]:mx-4 [&_code]:text-[10px]"><Command command="outray 3000 --domain preview.example.com" label="Copy custom domain command" /></div>
    </figure>
  </section>;
}

const localFeatures = [
  { title: "mDNS Discovery", description: "Auto-discovered by all devices via Bonjour/Avahi", icon: HotspotIcon, color: "text-[#60a5fa]", surface: "border-[#60a5fa]/25 bg-[#60a5fa]/7" },
  { title: "Trusted HTTPS", description: "Automatic certificates with mkcert - no browser warnings", icon: Shield01Icon, color: "text-[#22d3ee]", surface: "border-[#22d3ee]/25 bg-[#22d3ee]/7" },
  { title: "Zero Config", description: "No port forwarding, no firewall rules, no DNS setup", icon: FlashIcon, color: "text-[#2dd4bf]", surface: "border-[#2dd4bf]/25 bg-[#2dd4bf]/7" },
] as const;

function LocalTerminal() {
  const command = "outray 3000 --local";

  return <figure className="m-0 min-w-0 overflow-hidden rounded-[18px] border border-[#303030] bg-[#0d0d0d]" aria-label="Local-network tunnel terminal">
    <div className="flex items-center gap-[7px] border-b border-[#242424] px-[21px] py-4 max-[440px]:px-[17px]" aria-hidden="true">
      <span className="size-2.5 rounded-full bg-[#f45b61]" />
      <span className="size-2.5 rounded-full bg-[#edbb3b]" />
      <span className="size-2.5 rounded-full bg-[#27c68b]" />
    </div>
    <div className="grid gap-[18px] px-[26px] py-[28px] font-mono text-[13px] leading-[1.7] max-[440px]:gap-4 max-[440px]:px-[17px] max-[440px]:py-6 max-[440px]:text-xs">
      <div className="flex min-w-0 items-center gap-[11px]">
        <span className="shrink-0 text-[#c4b5fd]" aria-hidden="true">$</span>
        <code className="min-w-0 flex-1 [overflow-wrap:anywhere] text-[#e7e7e7]">{command}</code>
        <CopyButton value={command} label="Copy local network command" iconOnly variant="plain" className="size-8 shrink-0 rounded-lg p-0 text-[#969696] focus-visible:outline-[#b0b0b0]" />
      </div>
      <p className="m-0 min-w-0 [overflow-wrap:anywhere] text-[#909090]">Tunnel: <span className="text-[#b3b3b3]">https://my-app.outray.app</span></p>
      <p className="m-0 min-w-0 [overflow-wrap:anywhere] text-[#22d3ee]">Local: <span className="text-[#67e8f9]">https://my-app.local</span></p>
    </div>
  </figure>;
}

export function TunnelLocalSection() {
  return <section className={sectionClass} aria-labelledby="tunnel-local-title">
    <div className="mx-auto max-w-[800px] text-center">
      <h2 className="text-[clamp(40px,4.8vw,60px)] leading-[1.1] font-[520] tracking-[-0.048em] text-balance text-[#fafafa] max-[440px]:text-[36px]" id="tunnel-local-title">Unlimited <span className="bg-linear-to-r from-[#60a5fa] to-[#22d3ee] bg-clip-text text-transparent">.local</span> domains</h2>
      <p className="mx-auto mt-6 max-w-[700px] text-[17px] leading-[1.8] text-[#a6a6a6] max-[760px]:text-base max-[440px]:text-sm">Test on any device in your network. Just add <code className="font-mono text-[.9em] text-[#d0d0d0]">--local</code> and your app is instantly accessible at a memorable .local domain.</p>
    </div>
    <div className="mt-[64px] grid grid-cols-[minmax(0,.92fr)_minmax(0,1.08fr)] items-center gap-[clamp(36px,6vw,84px)] max-[760px]:mt-10 max-[760px]:grid-cols-1 max-[760px]:gap-9">
      <div className="min-w-0">
        <ul className="m-0 grid list-none gap-[27px] p-0 max-[440px]:gap-6">
          {localFeatures.map((feature) => <li key={feature.title} className="flex min-w-0 items-start gap-[17px] max-[440px]:gap-3.5">
            <span className={`grid size-11 shrink-0 place-items-center rounded-[12px] border ${feature.surface} ${feature.color}`} aria-hidden="true"><HugeiconsIcon icon={feature.icon} size={22} strokeWidth={1.6} /></span>
            <div className="min-w-0 pt-0.5"><h3 className="m-0 text-[17px] leading-[1.4] font-[520] tracking-[-.015em] text-[#f5f5f5] max-[440px]:text-base">{feature.title}</h3><p className="mt-[7px] mb-0 max-w-[390px] text-[13px] leading-[1.8] text-[#969696]">{feature.description}</p></div>
          </li>)}
        </ul>
        <Link className={`${linkClass} ml-[61px] max-[440px]:ml-[58px]`} to="/docs/$" params={{ _splat: "cli-reference" }} hash="options">Explore local access<Arrow /></Link>
      </div>
      <LocalTerminal />
    </div>
  </section>;
}

const protocols = [
  {
    name: "HTTP/HTTPS", kind: "http", icon: Globe02Icon,
    description: "Secure URLs for local web servers, webhooks, and APIs.",
    command: "outray http 3000", label: "Copy HTTP tunnel command",
    iconClass: "border-[#60a5fa]/25 bg-[#60a5fa]/10 text-[#60a5fa]",
    cardClass: "hover:border-[#60a5fa]/30 hover:bg-[#0b1017] focus-within:border-[#60a5fa]/30",
    commandClass: "group-hover:border-[#60a5fa]/30 group-focus-within:border-[#60a5fa]/30",
  },
  {
    name: "TCP Tunnels", kind: "tcp", icon: DatabaseIcon,
    description: "Expose databases, SSH, RDP, and other TCP services.",
    command: "outray tcp 5432", label: "Copy TCP tunnel command",
    iconClass: "border-[#c084fc]/25 bg-[#c084fc]/10 text-[#c084fc]",
    cardClass: "hover:border-[#c084fc]/30 hover:bg-[#100b17] focus-within:border-[#c084fc]/30",
    commandClass: "group-hover:border-[#c084fc]/30 group-focus-within:border-[#c084fc]/30",
  },
  {
    name: "UDP Tunnels", kind: "udp", icon: Gamepad01Icon,
    description: "Connect game servers, streaming, and real-time apps.",
    command: "outray udp 5000", label: "Copy UDP tunnel command",
    iconClass: "border-[#fb923c]/25 bg-[#fb923c]/10 text-[#fb923c]",
    cardClass: "hover:border-[#fb923c]/30 hover:bg-[#140d07] focus-within:border-[#fb923c]/30",
    commandClass: "group-hover:border-[#fb923c]/30 group-focus-within:border-[#fb923c]/30",
  },
] as const;

export function TunnelProtocolsSection() {
  return <section className={sectionClass} aria-labelledby="tunnel-protocols-title">
    <div className="mx-auto max-w-[720px] text-center max-[760px]:text-left"><h2 className={titleClass} id="tunnel-protocols-title">Any protocol.<br /><span>One command away.</span></h2><p className={`${leadClass} mx-auto max-w-[505px] max-[760px]:mx-0`}>HTTP, TCP, and UDP. One CLI for any local service.</p></div>
    <div className="mt-[58px] grid grid-cols-3 gap-5 max-[760px]:mt-[39px] max-[760px]:grid-cols-1">
      {protocols.map((protocol) => <article className={`group flex min-w-0 flex-col items-start rounded-[24px] border border-[#232323] bg-[#080808] p-8 transition-[background-color,border-color] duration-200 motion-reduce:transition-none max-[1000px]:p-6 ${protocol.cardClass}`} key={protocol.kind} aria-labelledby={`tunnel-${protocol.kind}-title`}>
        <span className={`mb-7 grid size-12 shrink-0 place-items-center rounded-[14px] border ${protocol.iconClass}`} aria-hidden="true"><HugeiconsIcon icon={protocol.icon} size={26} strokeWidth={1.5} /></span>
        <h3 className="m-0 text-[22px] leading-[1.35] font-[550] tracking-[-.03em] text-[#f5f5f5] max-[1000px]:text-xl" id={`tunnel-${protocol.kind}-title`}>{protocol.name}</h3>
        <p className="mt-3 mb-7 flex-1 text-sm leading-[1.75] text-[#a3a3a3]">{protocol.description}</p>
        <div className="w-full"><Command command={protocol.command} label={protocol.label} className={`border-[#262626] bg-[#050505] transition-[border-color] duration-200 motion-reduce:transition-none ${protocol.commandClass}`} /></div>
      </article>)}
    </div>
  </section>;
}
