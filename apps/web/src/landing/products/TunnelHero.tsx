import { useId } from "react";
import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import SecurityLockIcon from "@outray/icons/stroke/SecurityLockIcon";
import { CopyButton } from "../../components/arc/copy-button/copy-button";

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
    <figure className="relative z-[1] ml-[-35px] h-[540px] w-[calc(100%+95px)] overflow-clip max-[1100px]:ml-0 max-[1100px]:h-[480px] max-[1100px]:w-[calc(100%+40px)] max-[820px]:row-start-3 max-[820px]:mx-auto max-[820px]:mt-6 max-[820px]:h-[570px] max-[820px]:w-[min(660px,100%)] max-[540px]:mt-[18px] max-[540px]:h-[415px]" aria-label="Public address connected through OutRay to localhost port 3000">
      <svg className="pointer-events-none absolute -top-2.5 -right-10 h-[650px] w-[820px] max-w-none max-[1100px]:-top-3 max-[1100px]:right-[-115px] max-[1100px]:h-[555px] max-[1100px]:w-[700px] max-[820px]:top-0 max-[820px]:right-[-25px] max-[820px]:h-[578px] max-[820px]:w-[730px] max-[540px]:top-[-24px] max-[540px]:right-[-45px] max-[540px]:h-[404px] max-[540px]:w-[510px]" viewBox="0 0 820 650" aria-hidden="true" focusable="false">
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
        <path className="animate-[transit_3.8s_ease-out_forwards] [stroke-dasharray:12_900] [stroke-dashoffset:912] motion-reduce:animate-none motion-reduce:opacity-0" d="M126 296H236C365 296 381 242 520 242S649 148 745 148" fill="none" stroke="#f0f0f0" strokeWidth="2.5" strokeLinecap="round" />
        <g fill="var(--accent-light)">
          <circle cx="236" cy="296" r="3" />
          <circle cx="745" cy="148" r="3" />
        </g>
      </svg>

      <div className="absolute top-[270px] left-5 z-[2] grid gap-2.5 max-[1100px]:top-[260px] max-[1100px]:left-2.5 max-[820px]:top-[251px] max-[820px]:left-0 max-[540px]:top-[153px]">
        <span className="font-mono text-[9px] tracking-[0.16em] text-[#afa7bf] max-[540px]:text-[7px]">YOUR MACHINE</span>
        <code className="font-mono text-base text-[#e6e6e6] max-[1100px]:text-[13px] max-[540px]:text-[11px] [&>span]:text-[#aaa]">localhost<span>:3000</span></code>
      </div>
      <div className="absolute top-[117px] right-[15px] z-[2] grid gap-2.5 max-[1100px]:top-[94px] max-[1100px]:right-0 max-[820px]:top-[108px] max-[820px]:right-3.5 max-[540px]:top-14 max-[540px]:right-0">
        <span className="font-mono text-[9px] tracking-[0.16em] text-[#afa7bf] max-[540px]:text-[7px]">PUBLIC ADDRESS</span>
        <code className="font-mono text-base text-[#e6e6e6] max-[1100px]:text-[13px] max-[540px]:text-[11px] [&>span]:text-[#aaa]">demo<span>.outray.app</span></code>
        <span className="flex items-center gap-[5px] text-[10px] text-[#b7afc5] max-[540px]:text-[9px]"><HugeiconsIcon icon={SecurityLockIcon} size={12} strokeWidth={1.5} aria-hidden="true" />HTTPS, ready to share</span>
      </div>
    </figure>
  );
}

export function TunnelHero() {
  return (
    <section className="relative isolate grid min-h-[min(850px,calc(100svh-var(--header-height)))] grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] items-center gap-y-4 py-[84px_72px] [--accent:#9747ff] [--accent-deep:#5b21b6] [--accent-light:#b66dff] [--foreground:#f3f3f3] [--surface-muted:#242424] [--text-secondary:#b1adb8] min-[1600px]:min-h-[860px] max-[1100px]:min-h-[740px] max-[1100px]:grid-cols-2 max-[1100px]:py-[60px] max-[820px]:min-h-0 max-[820px]:grid-cols-1 max-[820px]:gap-y-0 max-[820px]:py-[65px_55px] max-[540px]:pt-[49px] max-[540px]:pb-[38px]" aria-labelledby="product-title">
      <div className="relative z-[2] py-6 max-[820px]:py-0 max-[820px]:text-center">
        <h1 className="max-w-none text-[clamp(54px,5.5vw,80px)] leading-[1.04] font-[530] tracking-[-0.055em] text-[#f1f1f1] max-[1100px]:text-[clamp(50px,5.45vw,67px)] max-[820px]:text-[clamp(48px,8.8vw,72px)] max-[540px]:text-[clamp(39px,9.2vw,50px)] max-[540px]:leading-[1.08] [&>span]:block [&>span]:whitespace-nowrap" id="product-title"><span>Localhost,</span> <span>meet the world.</span></h1>
        <p className="mt-7 max-w-[455px] text-[17px] leading-[1.8] text-[#b2afb8] max-[1100px]:max-w-[390px] max-[1100px]:text-[15px] max-[820px]:mx-auto max-[820px]:mt-6 max-[820px]:max-w-[470px] max-[820px]:text-base max-[540px]:max-w-[350px] max-[540px]:text-sm">A public address for the app on your machine. Share your work, catch real webhooks, and test from anywhere—without a deployment.</p>
        <div className="mt-[31px] flex flex-wrap items-center gap-6 max-[820px]:justify-center max-[540px]:mt-[25px] max-[540px]:gap-[19px]">
          <Link className="inline-flex min-h-[49px] items-center justify-center gap-2 rounded-[11px] bg-white px-[21px] py-[13px] text-sm font-semibold text-black transition-colors hover:bg-[#e8e8e8] focus-visible:outline-2 focus-visible:outline-offset-[5px] focus-visible:outline-[var(--accent-light)] motion-reduce:transition-none max-[540px]:min-h-[46px] max-[540px]:px-[17px] max-[540px]:py-3 max-[540px]:text-[13px]" to="/signup" data-track="cta" data-track-label="tunnels-get-started">Start tunneling<Arrow /></Link>
        </div>
      </div>
      <TunnelConnection />
      <div className="relative z-[2] col-span-full grid w-[min(360px,100%)] justify-self-center justify-items-center gap-2 max-[820px]:row-start-2 max-[820px]:mt-8 max-[540px]:w-[min(330px,100%)]">
        <div className="flex min-h-[52px] w-full items-center gap-[13px] rounded-[11px] border border-[#3b393f] bg-[#111] py-[5px] pr-1.5 pl-[17px] [&>code]:min-w-0 [&>code]:flex-1 [&>code]:font-mono [&>code]:text-[13px] [&>code]:text-[#f0edf5] [&>span]:font-mono [&>span]:text-sm [&>span]:text-[#b66dff]"><span aria-hidden="true">$</span><code>{command}</code><CopyButton value={command} iconOnly variant="plain" label="Copy tunnel command" className="h-[38px] min-h-[38px] w-[38px] shrink-0 rounded-[7px] p-0 text-[#aaa] focus-visible:outline-2 focus-visible:outline-offset-[5px] focus-visible:outline-[var(--accent-light)]" /></div>
        <Link className="inline-flex min-h-11 items-center gap-2.5 rounded-[5px] text-sm text-[#ccc] transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[5px] focus-visible:outline-[var(--accent-light)] motion-reduce:transition-none max-[540px]:text-[13px] [&>svg]:transition-transform [&>svg]:duration-150 hover:[&>svg]:translate-x-[3px] motion-reduce:[&>svg]:transition-none motion-reduce:hover:[&>svg]:translate-x-0" to="/docs/$" params={{ _splat: "tunnels" }} data-track="cta" data-track-label="tunnels-documentation">Learn more<Arrow /></Link>
      </div>
    </section>
  );
}
