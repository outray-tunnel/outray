import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import DatabaseIcon from "@outray/icons/stroke/DatabaseIcon";
import Globe02Icon from "@outray/icons/stroke/Globe02Icon";
import Pulse02Icon from "@outray/icons/stroke/Pulse02Icon";
import Tick02Icon from "@outray/icons/stroke/Tick02Icon";
import { CopyButton } from "../../components/arc/copy-button/copy-button";

const sectionClass = "relative border-t border-[var(--line)] py-28 [--foreground:#f3f3f3] [--surface-muted:#242424] [--text-secondary:#a0a0a0] max-[1000px]:py-[86px] max-[760px]:py-[70px] max-[440px]:py-[58px]";
const splitSectionClass = "grid grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] items-center gap-[clamp(40px,7vw,100px)] max-[1000px]:gap-[38px] max-[760px]:grid-cols-1 max-[760px]:gap-10";
const titleClass = "text-[clamp(36px,4vw,48px)] leading-[1.08] font-[520] tracking-[-0.048em] text-balance text-[#fafafa] max-[1000px]:text-[44px] max-[760px]:text-[clamp(36px,6vw,46px)] [&>span]:text-[#fafafa]";
const leadClass = "mt-[26px] max-w-[480px] text-base leading-[1.8] text-[#b3b3b3] max-[1000px]:text-sm [&>code]:font-mono [&>code]:text-[.85em] [&>code]:text-[#e7e7e7]";
const linkClass = "mt-[25px] inline-flex min-h-11 items-center gap-2.5 rounded-sm text-[13px] text-[#eee] transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[5px] focus-visible:outline-[#b0b0b0] motion-reduce:transition-none [&>svg]:transition-transform [&>svg]:duration-150 hover:[&>svg]:translate-x-[3px] motion-reduce:[&>svg]:transition-none motion-reduce:hover:[&>svg]:translate-x-0";

function Arrow() {
  return <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.6} aria-hidden="true" />;
}

function Check() {
  return <HugeiconsIcon icon={Tick02Icon} size={15} strokeWidth={1.8} aria-hidden="true" />;
}

function Command({ command, label }: { command: string; label: string }) {
  return <div className="flex min-h-[49px] min-w-0 items-center gap-[11px] rounded-[10px] border border-[#3c3c3c] bg-[#111] py-[5px] pr-1.5 pl-3.5 [&>code]:min-w-0 [&>code]:flex-1 [&>code]:[overflow-wrap:anywhere] [&>code]:font-mono [&>code]:text-xs [&>code]:leading-[1.65] [&>code]:text-[#ededed] [&>span]:font-mono [&>span]:text-xs [&>span]:text-[#969696]"><span aria-hidden="true">$</span><code>{command}</code><CopyButton value={command} label={label} iconOnly variant="plain" className="h-[34px] min-h-[34px] w-[34px] shrink-0 rounded-md p-0 text-[#a6a6a6] focus-visible:outline-2 focus-visible:outline-offset-[5px] focus-visible:outline-[#b0b0b0]" /></div>;
}

export function TunnelDomainSection() {
  return <section className={`${sectionClass} ${splitSectionClass}`} aria-labelledby="tunnel-domain-title">
    <div className="min-w-0">
      <h2 className={titleClass} id="tunnel-domain-title">Bring your<br /><span>own domain.</span></h2>
      <p className={leadClass}>A familiar address for the service on your machine. Connect a hostname you own, then use it for previews, callbacks, and integrations.</p>
      <ul className="mt-[26px] grid list-none gap-3.5 p-0 text-[13px] text-[#d0d0d0] [&>li]:flex [&>li]:items-start [&>li]:gap-[11px] [&_svg]:mt-px [&_svg]:shrink-0 [&_svg]:text-[#e4e4e4]">
        <li><Check />Automatic HTTPS for verified domains</li>
        <li><Check />CNAME routing and TXT ownership verification</li>
        <li><Check />The same address when you reconnect</li>
      </ul>
      <Link className={linkClass} to="/docs/$" params={{ _splat: "custom-domains" }}>Connect a domain<Arrow /></Link>
    </div>
    <figure className="relative m-0 min-w-0 rounded-[18px] border border-[#414141] bg-[#111] max-[760px]:w-full max-[760px]:max-w-[580px] max-[760px]:justify-self-center" aria-label="Illustrative custom-domain DNS configuration">
      <div className="flex min-w-0 items-center gap-[15px] rounded-t-[18px] border-b border-[#353535] bg-[#191919] px-[21px] py-[17px] max-[440px]:gap-2.5 max-[440px]:p-[15px] [&>code]:min-w-0 [&>code]:[overflow-wrap:anywhere] [&>code]:font-mono [&>code]:text-[11px] [&>code]:text-[#d0d0d0] max-[440px]:[&>code]:text-[10px]"><span className="flex shrink-0 gap-[5px] [&>i]:size-1.5 [&>i]:rounded-full [&>i]:border [&>i]:border-[#606060] [&>i]:bg-[#303030]" aria-hidden="true"><i /><i /><i /></span><code>preview.example.com</code><span className="ml-auto font-mono text-[10px] tracking-[.1em] text-[#969696]">EXAMPLE</span></div>
      <div className="flex items-center gap-[15px] px-[26px] pt-[29px] pb-6 max-[1000px]:px-[18px] max-[1000px]:py-6 max-[760px]:px-6 max-[760px]:py-[27px] max-[440px]:gap-3 max-[440px]:px-4 max-[440px]:py-[23px]">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#454545] bg-[#292929] text-[#c084fc] max-[440px]:size-[37px]" aria-hidden="true"><HugeiconsIcon icon={Globe02Icon} size={25} strokeWidth={1.4} /></span>
        <div><p className="m-0 text-[17px] text-[#f2f2f2] max-[440px]:text-[15px]">Your domain, connected.</p><span className="mt-[7px] block font-mono text-[10px] text-[#969696]">Public address → localhost:3000</span></div>
      </div>
      <dl className="mx-[26px] my-0 max-[1000px]:mx-[18px] max-[760px]:mx-6 max-[440px]:mx-4 [&>div]:grid [&>div]:grid-cols-[105px_minmax(0,1fr)] [&>div]:gap-3.5 [&>div]:border-t [&>div]:border-[#2b2b2b] [&>div]:py-[19px] max-[1000px]:[&>div]:grid-cols-[80px_minmax(0,1fr)] max-[1000px]:[&>div]:gap-2.5 max-[440px]:[&>div]:grid-cols-[74px_minmax(0,1fr)] [&_dt]:grid [&_dt]:content-start [&_dt]:gap-[7px] [&_dt]:text-[11px] [&_dt]:text-[#969696] [&_dt>span]:font-mono [&_dt>span]:text-[10px] [&_dt>span]:text-[#d0d0d0] [&_dd]:m-0 [&_dd]:grid [&_dd]:min-w-0 [&_dd]:gap-[7px] [&_dd>code]:[overflow-wrap:anywhere] [&_dd>code]:font-mono [&_dd>code]:text-[10px] [&_dd>code]:leading-[1.7] [&_dd>code]:text-[#e2e2e2] [&_dd>span]:text-[11px] [&_dd>span]:text-[#969696]">
        <div><dt><span>CNAME</span>Route visitors</dt><dd><code>preview.example.com</code><span>Workspace-provided target</span></dd></div>
        <div><dt><span>TXT</span>Verify ownership</dt><dd><code>_outray-challenge.preview.example.com</code><span>Your domain’s ownership token</span></dd></div>
      </dl>
      <div className="mt-3 mr-[26px] mb-6 ml-[26px] max-[1000px]:mx-[18px] max-[1000px]:mt-3 max-[1000px]:mb-6 max-[760px]:mx-6 max-[440px]:mx-4 [&_code]:text-[10px]"><Command command="outray 3000 --domain preview.example.com" label="Copy custom domain command" /></div>
      <figcaption className="border-t border-[#292929] px-[26px] py-3 text-[11px] leading-[1.6] text-[#969696] max-[440px]:px-4">Illustrative configuration. Copy the exact DNS records from your workspace.</figcaption>
    </figure>
  </section>;
}

function LocalDevices() {
  return <figure className="relative m-0 h-[415px] w-full min-w-0 overflow-clip max-[1000px]:h-[370px] max-[760px]:h-[415px] max-[760px]:w-[min(550px,100%)] max-[760px]:justify-self-center max-[440px]:h-[370px]" aria-label="Illustrative laptop, tablet, and phone accessing one local application">
    <div className="absolute inset-[20px_0_42px] bg-[linear-gradient(rgb(124_124_124/.055)_1px,transparent_1px),linear-gradient(90deg,rgb(124_124_124/.055)_1px,transparent_1px)] bg-[size:30px_30px] [mask-image:radial-gradient(ellipse,#000,transparent_72%)]" aria-hidden="true" />
    <svg className="absolute inset-0 size-full" viewBox="0 0 600 390" fill="none" aria-hidden="true" focusable="false"><ellipse cx="299" cy="211" rx="217" ry="128" stroke="#303030" strokeDasharray="4 6" /><ellipse cx="299" cy="211" rx="169" ry="90" stroke="#272727" /><path d="M270 165 168 268m144-99 102 76" stroke="#8d8d8d" strokeWidth="1.2" /><circle cx="270" cy="165" r="4" fill="#b3b3b3" /><circle cx="168" cy="268" r="4" fill="#8d8d8d" /><circle cx="414" cy="245" r="4" fill="#8d8d8d" /></svg>
    <div className="absolute top-14 left-[24%] w-[54%] max-[1000px]:top-20 max-[760px]:top-14 max-[440px]:top-[38px] max-[440px]:left-[23%] max-[440px]:w-[57%]" aria-hidden="true"><div className="min-h-[154px] rounded-[12px_12px_3px_3px] border border-[#777] bg-[#202020] px-[23px] pt-[23px] pb-5 shadow-[0_15px_45px_rgb(0_0_0/.5),inset_0_0_0_5px_#161616] max-[1000px]:min-h-32 max-[1000px]:px-[18px] max-[1000px]:py-[19px] max-[760px]:min-h-[154px] max-[760px]:p-[23px] max-[440px]:min-h-32 max-[440px]:px-[15px] max-[440px]:py-5"><span className="block font-mono text-[10px] tracking-[.12em] text-[#c7c7c7]">YOUR LOCAL APP</span><span className="mt-4 block text-lg tracking-[-.03em] text-[#fafafa] max-[1000px]:text-sm max-[760px]:text-lg max-[440px]:text-[13px]">Hello, network.</span><div className="mt-[17px] grid gap-[7px] [&>i]:h-1 [&>i]:w-[74%] [&>i]:rounded-[3px] [&>i]:bg-[#b4b4b4] [&>i:nth-child(2)]:w-[85%] [&>i:nth-child(2)]:bg-[#747474] [&>i:nth-child(3)]:w-[54%] [&>i:nth-child(3)]:bg-[#505050]"><i /><i /><i /></div></div><div className="mx-[-18px] h-[11px] rounded-[2px_2px_10px_10px] border border-[#555] bg-[#212121]" /></div>
    <div className="absolute top-[204px] left-[6%] h-[131px] w-[36%] -rotate-[7deg] rounded-[13px] border border-[#4b4b4b] bg-[#111] p-2.5 shadow-[0_12px_35px_rgb(0_0_0/.3)] max-[1000px]:top-[215px] max-[1000px]:h-[105px] max-[760px]:top-[204px] max-[760px]:h-[131px] max-[440px]:top-[175px] max-[440px]:left-[3%] max-[440px]:h-[104px] max-[440px]:w-[38%] max-[440px]:p-2" aria-hidden="true"><div className="grid h-full content-start gap-[7px] rounded-md border border-[#414141] bg-[#202020] px-3 py-4 max-[440px]:px-[9px] max-[440px]:py-3 [&>span]:mb-[9px] [&>span]:block [&>span]:h-1.5 [&>span]:w-3/5 [&>span]:rounded-sm [&>span]:bg-[#ddd] [&>i]:block [&>i]:h-1 [&>i]:rounded-sm [&>i]:bg-[#868686] [&>i:last-child]:w-[70%]"><span /><i /><i /><i /></div></div>
    <div className="absolute top-[187px] right-[7%] h-[159px] w-[16%] rotate-[8deg] rounded-[17px] border border-[#5d5d5d] bg-[#111] px-[7px] py-3 shadow-[0_12px_35px_rgb(0_0_0/.3)] max-[1000px]:top-48 max-[1000px]:h-[143px] max-[760px]:top-[187px] max-[760px]:h-[159px] max-[440px]:top-[159px] max-[440px]:right-[3%] max-[440px]:h-[130px] max-[440px]:w-[19%]" aria-hidden="true"><div className="grid h-full content-start gap-[7px] rounded-md border border-[#414141] bg-[#202020] px-1.5 py-4 max-[440px]:px-1 [&>span]:mb-[9px] [&>span]:block [&>span]:h-1.5 [&>span]:w-3/5 [&>span]:rounded-sm [&>span]:bg-[#ddd] [&>i]:block [&>i]:h-1 [&>i]:rounded-sm [&>i]:bg-[#868686] [&>i:last-child]:w-[70%]"><span /><i /><i /><i /></div></div>
    <div className="absolute top-[325px] left-[43%] grid grid-cols-[7px_minmax(0,1fr)] items-center gap-2 max-[1000px]:top-[318px] max-[760px]:top-[325px] max-[440px]:top-[278px] max-[440px]:left-[37%]"><span className="size-[5px] rounded-full bg-[#b66dff]" aria-hidden="true" /><code className="font-mono text-[13px] text-[#e2e2e2] max-[1000px]:text-[10px] max-[760px]:text-[13px] max-[440px]:text-[11px] [&>span]:text-[#c4c4c4]">your-app<span>.local</span></code><small className="col-start-2 font-mono text-[10px] tracking-[.08em] text-[#969696]">ONE APP, SAME NETWORK</small></div>
    <figcaption className="absolute bottom-1 w-full px-[5px] text-center text-[11px] leading-[1.6] text-[#969696]">Illustrative devices. Use the local address printed by the CLI.</figcaption>
  </figure>;
}

export function TunnelLocalSection() {
  return <section className={`${sectionClass} ${splitSectionClass} grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]!`} aria-labelledby="tunnel-local-title">
    <LocalDevices />
    <div className="min-w-0 max-[760px]:row-start-1">
      <h2 className={titleClass} id="tunnel-local-title"><span>.local,</span><br />on every device.</h2>
      <p className={leadClass}>Your phone is part of your dev environment, too. Add <code>--local</code> to advertise your app on your local network while keeping its public tunnel.</p>
      <div className="mt-[27px] max-w-[405px]"><Command command="outray 3000 --local" label="Copy local network command" /></div>
      <p className="mt-[17px] max-w-[440px] text-xs leading-[1.8] text-[#969696]">Devices need to share a network and support mDNS, such as Bonjour or Avahi. For trusted local HTTPS, install mkcert and trust its CA on each device; otherwise certificates are self-signed.</p>
      <Link className={linkClass} to="/docs/$" params={{ _splat: "cli-reference" }} hash="options">Explore local access<Arrow /></Link>
    </div>
  </section>;
}

const protocols = [
  { name: "HTTP / HTTPS", kind: "http", use: "Web apps, APIs, webhooks", description: "Give your development server a public URL. Receive real callbacks and share a preview without deploying it.", command: "outray http 3000", label: "Copy HTTP tunnel command" },
  { name: "TCP", kind: "tcp", use: "Databases, SSH, socket services", description: "Forward a stream-based service. Connect clients using the public host and port printed by the CLI.", command: "outray tcp 5432", label: "Copy TCP tunnel command" },
  { name: "UDP", kind: "udp", use: "Games, datagrams, real-time services", description: "Forward datagrams to your local service and relay its responses. Use the assigned public endpoint.", command: "outray udp 5000", label: "Copy UDP tunnel command" },
] as const;

function ProtocolIcon({ kind }: { kind: typeof protocols[number]["kind"] }) {
  const icon = kind === "http" ? Globe02Icon : kind === "tcp" ? DatabaseIcon : Pulse02Icon;
  return <HugeiconsIcon icon={icon} size={26} strokeWidth={1.35} aria-hidden="true" />;
}

export function TunnelProtocolsSection() {
  return <section className={sectionClass} aria-labelledby="tunnel-protocols-title">
    <div className="mx-auto max-w-[720px] text-center max-[760px]:text-left"><h2 className={titleClass} id="tunnel-protocols-title">Any protocol.<br /><span>One command away.</span></h2><p className={`${leadClass} mx-auto max-w-[505px] max-[760px]:mx-0`}>An HTTP URL, a TCP stream, or a UDP endpoint. Pick the transport your service already speaks.</p></div>
    <div className="mt-[58px] grid grid-cols-3 border-y border-[#2b2b2b] max-[760px]:mt-[39px] max-[760px]:grid-cols-1">{protocols.map((protocol, index) => <article className={`flex min-w-0 flex-col items-start px-[26px] pt-[33px] pb-[30px] max-[1000px]:px-[19px] max-[760px]:px-[5px] max-[760px]:py-[27px] ${index > 0 ? "border-l border-[#2b2b2b] max-[760px]:border-t max-[760px]:border-l-0" : ""}`} key={protocol.kind}><span className="mb-[23px] grid size-11 place-items-center rounded-[11px] border border-[#4a4a4a] bg-[#1d1d1d] text-[#e0e0e0]"><ProtocolIcon kind={protocol.kind} /></span><h3 className="text-[22px] font-[520] tracking-[-.03em] text-[#f5f5f5] max-[1000px]:text-xl">{protocol.name}</h3><p className="mt-[7px] text-[11px] leading-[1.6] text-[#b0b0b0]">{protocol.use}</p><p className="my-[22px_25px] flex-1 text-[13px] leading-[1.8] text-[#b0b0b0] max-[760px]:my-[17px_20px]">{protocol.description}</p><div className="w-full max-[760px]:max-w-[410px] [&_code]:text-[11px]"><Command command={protocol.command} label={protocol.label} /></div></article>)}</div>
    <div className="mt-[18px] flex flex-wrap items-center justify-between gap-3"><p className="m-0 max-w-[600px] text-xs leading-[1.7] text-[#969696]">Raw TCP and UDP services still need their own authentication and encryption.</p><Link className={`${linkClass} mt-0`} to="/docs/$" params={{ _splat: "protocols" }}>Choose your protocol<Arrow /></Link></div>
  </section>;
}
