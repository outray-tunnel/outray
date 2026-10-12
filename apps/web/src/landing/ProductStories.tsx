import { ProductIcon } from "./ProductIcon";

const tunnelFeatures = [
  "HTTP, TCP, and UDP forwarding",
  "Custom domains with managed TLS",
  "Request inspection when you need the full exchange",
  "One command from localhost to a public URL",
];

const observabilityFeatures = [
  "Correlated traces, logs, and metrics",
  "Server-side request and dependency spans",
  "Framework-aware route names",
  "Payload capture you explicitly control",
];

const secretFeatures = [
  "Vaults organized by environment",
  "Encrypted values and version history",
  "Audit records for sensitive actions",
  "Runtime injection through the OutRay CLI",
];

const uptimeFeatures = [
  "One-minute HTTP(S) checks",
  "Observed uptime, latency, and incident history",
  "Public status pages with grouped components",
  "Team alerts and team-published subscriber updates",
];

const traceSpans = [
  { name: "POST /api/orders", duration: "412ms", bar: "after:left-0 after:w-full" },
  { name: "auth middleware", duration: "78ms", bar: "after:left-[2%] after:w-[19%]" },
  { name: "db select user", duration: "49ms", bar: "after:left-[6%] after:w-[12%]" },
  { name: "validate order", duration: "31ms", bar: "after:left-[23%] after:w-[8%]" },
  { name: "db insert order", duration: "185ms", bar: "after:left-[34%] after:w-[45%]" },
  { name: "queue publish", duration: "62ms", bar: "after:left-[81%] after:w-[15%]" },
];

const requestRows = [
  { method: "POST", path: "/api/orders", status: "201", duration: "124ms", tone: "bg-blue-500/10 text-blue-300" },
  { method: "GET", path: "/api/orders/:id", status: "200", duration: "48ms", tone: "bg-[rgb(131_103_199_/.1)] text-[#bdaae9]" },
  { method: "PATCH", path: "/api/orders/:id", status: "200", duration: "82ms", tone: "bg-amber-500/10 text-amber-300" },
];

const secretRows = [
  { key: "DATABASE_URL", updated: "just now" },
  { key: "STRIPE_SECRET_KEY", updated: "2m ago" },
  { key: "REDIS_URL", updated: "5m ago" },
  { key: "WEBHOOK_SECRET", updated: "1h ago" },
];

const focusClass = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-light";
const tabClass = `group relative flex h-20 min-w-0 items-center justify-center gap-3.5 rounded-full border border-white/[.09] bg-surface-2 px-[clamp(12px,2.2vw,28px)] text-[clamp(.93rem,1.3vw,1.05rem)] font-[620] text-[#9b9ba3] transition-colors duration-150 hover:border-white/20 hover:bg-[#19191c] hover:text-[#f5f5f6] aria-selected:rounded-[40px_40px_0_0] aria-selected:border-line-strong aria-selected:border-b-transparent aria-selected:bg-[#0a0a0b] aria-selected:text-white after:pointer-events-none after:absolute after:right-px after:bottom-[-25px] after:left-px after:hidden after:h-[27px] after:bg-[#0a0a0b] after:content-[''] aria-selected:after:block group-data-[outline-ready=true]/frame:border-transparent group-data-[outline-ready=true]/frame:bg-transparent group-data-[outline-ready=true]/frame:hover:border-transparent group-data-[outline-ready=true]/frame:hover:bg-transparent group-data-[outline-ready=true]/frame:aria-selected:after:hidden max-[860px]:gap-2.5 max-[860px]:px-3 max-[860px]:text-[.9rem] max-[620px]:h-[50px] max-[620px]:shrink-0 max-[620px]:snap-start max-[620px]:gap-2 max-[620px]:rounded-full max-[620px]:px-4 max-[620px]:text-[.82rem] max-[620px]:aria-selected:h-[50px] max-[620px]:aria-selected:rounded-full max-[620px]:aria-selected:border-white/[.18] max-[620px]:aria-selected:bg-[#202023] max-[620px]:aria-selected:after:hidden ${focusClass}`;
const tabIconClass = "h-7 w-7 shrink-0 text-current [&_.product-icon__solid]:hidden group-aria-selected:[&_.product-icon__stroke]:hidden group-aria-selected:[&_.product-icon__solid]:inline max-[860px]:h-[23px] max-[860px]:w-[23px] max-[620px]:h-5 max-[620px]:w-5";
const articleClass = "group/panel grid min-h-[640px] grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)] items-center gap-x-[clamp(32px,4vw,60px)] gap-y-[clamp(30px,3.5vw,46px)] p-[clamp(40px,4.6vw,64px)] [html.js_&]:data-[active=false]:hidden group-data-[switching=true]/stage:data-[active=true]:animate-product-panel motion-reduce:animate-none max-[1080px]:grid-cols-1 max-[1080px]:items-start max-[1080px]:gap-y-[34px] max-[860px]:min-h-0 max-[860px]:p-12 max-[620px]:min-h-0 max-[620px]:gap-y-7 max-[620px]:px-5 max-[620px]:pt-[30px] max-[620px]:pb-[22px]";
const copyClass = "relative col-start-1 row-start-1 max-w-[470px] max-[1080px]:max-w-[720px]";
const indexClass = "w-fit rounded-[9px] px-2.5 py-[7px] text-[.66rem] font-[680] tracking-[.08em] text-[#bba9e5] uppercase";
const titleClass = "mt-[22px] max-w-[13ch] text-[clamp(2.35rem,3.2vw,3.25rem)] leading-[1.02] font-[570] tracking-[-.055em] max-[1080px]:max-w-[16ch] max-[1080px]:text-[clamp(2.2rem,4.3vw,3rem)] max-[620px]:max-w-[14ch] max-[620px]:text-[clamp(2rem,8.2vw,2.55rem)]";
const descriptionClass = "mt-6 max-w-[41ch] text-[clamp(1rem,1.2vw,1.1rem)] leading-[1.6] text-muted max-[620px]:mt-[18px]";
const actionClass = "mt-[30px] flex flex-wrap items-center gap-x-5 gap-y-3";
const linkClass = `inline-flex items-center gap-2 rounded-lg text-[.92rem] font-[620] text-[#ded8ee] [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:shrink-0 [&>svg]:transition-transform [&>svg]:duration-200 [&>svg]:ease-snappy hover:[&>svg]:translate-x-0.5 ${focusClass}`;
const docsLinkClass = `inline-flex items-center rounded-lg text-[.82rem] font-[450] text-[#9993a4] transition-colors hover:text-white ${focusClass}`;
const panelClass = "relative col-start-2 row-start-1 min-h-[460px] w-full min-w-0 overflow-hidden rounded-shell border border-line bg-[#09090a] shadow-[0_28px_80px_rgb(0_0_0_/.34),inset_0_1px_rgb(255_255_255_/.035)] before:pointer-events-none before:absolute before:inset-x-[25%] before:top-[-30%] before:z-0 before:h-[280px] before:rounded-full before:bg-[rgb(131_103_199_/.1)] before:blur-[80px] before:content-[''] [&>*]:relative [&>*]:z-[1] max-[1080px]:col-start-1 max-[1080px]:row-start-2 max-[620px]:min-h-0";
const toolbarClass = "relative z-[2] flex min-h-[70px] items-center justify-between border-b border-line px-5";
const panelTitleClass = "flex items-center gap-3 [&>span:last-child]:grid [&>span:last-child]:gap-0.5 [&_small]:text-[.61rem] [&_small]:font-[650] [&_small]:tracking-[.09em] [&_small]:text-[#65656d] [&_small]:uppercase [&_strong]:text-[.82rem] [&_strong]:font-[620] [&_strong]:text-[#ededf0]";
const glyphClass = "grid h-[37px] w-[37px] place-items-center rounded-[10px] border border-[rgb(131_103_199_/.22)] bg-[rgb(131_103_199_/.08)] text-[#b8a6e5]";
const panelIconClass = "h-[19px] w-[19px] [&_.product-icon__solid]:hidden";
const featureListClass = "col-span-full row-start-2 grid list-none grid-cols-4 border-t border-line pt-[26px] max-[1080px]:col-start-1 max-[1080px]:row-start-3 max-[1080px]:grid-cols-2 max-[620px]:grid-cols-1 max-[620px]:pt-3.5";
const featureItemClasses = [
  "flex min-w-0 items-start gap-2.5 py-0.5 pr-[18px] text-[.83rem] leading-[1.45] text-[#b7b7c0] max-[1080px]:px-0 max-[1080px]:py-2.5 max-[620px]:py-[11px]",
  "flex min-w-0 items-start gap-2.5 border-l border-line px-[18px] py-0.5 text-[.83rem] leading-[1.45] text-[#b7b7c0] max-[1080px]:py-2.5 max-[620px]:border-t max-[620px]:border-l-0 max-[620px]:px-0 max-[620px]:py-[11px]",
  "flex min-w-0 items-start gap-2.5 border-l border-line px-[18px] py-0.5 text-[.83rem] leading-[1.45] text-[#b7b7c0] max-[1080px]:border-t max-[1080px]:border-l-0 max-[1080px]:px-0 max-[1080px]:py-2.5 max-[620px]:py-[11px]",
  "flex min-w-0 items-start gap-2.5 border-l border-line px-[18px] py-0.5 text-[.83rem] leading-[1.45] text-[#b7b7c0] max-[1080px]:border-t max-[1080px]:py-2.5 max-[620px]:border-l-0 max-[620px]:px-0 max-[620px]:py-[11px]",
];
const featureDotClass = "mt-[.5em] h-[5px] w-[5px] shrink-0 rounded-full bg-accent-light";

function FeatureList({ features, label }: { features: string[]; label: string }) {
  return (
    <ul className={featureListClass} aria-label={label}>
      {features.map((feature, index) => (
        <li className={featureItemClasses[index]} key={feature}><span className={featureDotClass} aria-hidden="true" />{feature}</li>
      ))}
    </ul>
  );
}

export function ProductStories({ docsUrl }: { docsUrl: string }) {
  return (
    <section className="py-[clamp(24px,4vw,56px)] pb-[clamp(104px,12vw,170px)] max-[620px]:pt-7 max-[620px]:pb-[86px]" aria-label="Explore OutRay products">
      <div className="relative mx-auto w-[min(calc(100%-48px),var(--container-page))] max-[1080px]:w-[min(calc(100%-36px),var(--container-page))] max-[860px]:w-[min(calc(100%-28px),var(--container-page))] max-[620px]:w-[min(calc(100%-24px),var(--container-page))]" data-product-tabs data-default-tab="tunnels" data-tab-group="showcase">
        <div className="group/frame relative isolate rounded-[42px] bg-[#030304] p-6 max-[860px]:p-[18px] max-[620px]:rounded-[30px] max-[620px]:border max-[620px]:border-white/10 max-[620px]:bg-[#0d0d0e]" data-product-outline>
          <div className="pointer-events-none absolute top-6 right-6 left-6 z-0 hidden h-20 grid-cols-4 gap-[clamp(12px,2vw,28px)] group-data-[outline-ready=true]/frame:grid max-[860px]:top-[18px] max-[860px]:right-[18px] max-[860px]:left-[18px] max-[860px]:gap-3 max-[620px]:group-data-[outline-ready=true]/frame:hidden" data-product-pills aria-hidden="true">
            <span className="rounded-full border border-white/[.09] bg-surface-2" data-product-pill />
            <span className="rounded-full border border-white/[.09] bg-surface-2" data-product-pill />
            <span className="rounded-full border border-white/[.09] bg-surface-2" data-product-pill />
            <span className="rounded-full border border-white/[.09] bg-surface-2" data-product-pill />
          </div>
          <div className="relative z-[2] grid h-[104px] grid-cols-4 items-start gap-[clamp(12px,2vw,28px)] max-[860px]:gap-3 max-[620px]:flex max-[620px]:h-auto max-[620px]:snap-x max-[620px]:snap-proximity max-[620px]:gap-2.5 max-[620px]:overflow-x-auto max-[620px]:[overscroll-behavior-inline:contain] max-[620px]:[scrollbar-width:none] max-[620px]:[&::-webkit-scrollbar]:hidden" role="tablist" aria-label="OutRay products">
            <button className={tabClass} type="button" id="showcase-tab-tunnels" role="tab" aria-selected="true" aria-controls="tunnels" tabIndex={0} data-product-tab="tunnels"><ProductIcon product="tunnels" className={tabIconClass} /><span>Tunnels</span></button>
            <button className={tabClass} type="button" id="showcase-tab-observability" role="tab" aria-selected="false" aria-controls="observability" tabIndex={-1} data-product-tab="observability"><ProductIcon product="observability" className={tabIconClass} /><span>Observability</span></button>
            <button className={tabClass} type="button" id="showcase-tab-secrets" role="tab" aria-selected="false" aria-controls="secrets" tabIndex={-1} data-product-tab="secrets"><ProductIcon product="secrets" className={tabIconClass} /><span>Secrets</span></button>
            <button className={tabClass} type="button" id="showcase-tab-uptime" role="tab" aria-selected="false" aria-controls="uptime" tabIndex={-1} data-product-tab="uptime"><ProductIcon product="uptime" className={tabIconClass} /><span>Uptime</span></button>
          </div>

          <div className="group/stage relative z-[2] min-h-[640px] overflow-hidden rounded-[40px] border border-line-strong bg-[radial-gradient(circle_at_73%_30%,rgb(131_103_199_/.09),transparent_35rem),#0a0a0b] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_73%_30%,rgb(131_103_199_/.085),transparent_33rem),linear-gradient(rgb(255_255_255_/.012)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255_/.012)_1px,transparent_1px)] before:bg-[size:48px_48px] before:[mask-image:linear-gradient(to_bottom,black,transparent_75%)] before:content-[''] data-[switching=true]:transition-[height] data-[switching=true]:duration-[220ms] data-[switching=true]:ease-snappy group-data-[outline-ready=true]/frame:border-transparent group-data-[outline-ready=true]/frame:bg-transparent motion-reduce:data-[switching=true]:transition-none max-[620px]:mt-5 max-[620px]:min-h-0 max-[620px]:rounded-3xl max-[620px]:bg-[#151517]" data-product-stage>
            <div className="relative z-[1]">
              <article className={articleClass} id="tunnels" role="tabpanel" aria-labelledby="showcase-tab-tunnels" data-product-panel="tunnels" data-product-section="tunnels" data-active="true">
                <div className={copyClass}>
                  <p className={indexClass}>01 / Tunnels</p>
                  <h2 className={titleClass}>Give localhost a real address.</h2>
                  <p className={descriptionClass}>Put a local service online in seconds, keep a stable domain, and inspect the requests that cross the tunnel.</p>
                  <div className={actionClass}>
                    <a className={linkClass} href="/products/tunnels" data-track="cta" data-track-label="tunnels-explore">Explore Tunnels <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg></a>
                    <a className={docsLinkClass} href={`${docsUrl}/tunnels`} data-track="cta" data-track-label="tunnels-read-docs">Documentation</a>
                  </div>
                </div>
                <div className={`${panelClass} isolate`} role="group" aria-label="Tunnel request interface">
                  <div className={toolbarClass}>
                    <div className={panelTitleClass}><span className={glyphClass}><ProductIcon product="tunnels" className={panelIconClass} /></span><span><small>Tunnel</small><strong>orders-api</strong></span></div>
                    <span className="inline-flex items-center gap-[7px] font-mono text-[.67rem] font-[650] tracking-[.08em] text-success uppercase"><i className="h-1.5 w-1.5 shrink-0 rounded-full bg-success shadow-[0_0_9px_rgb(52_211_153_/.55)]" />Live</span>
                  </div>
                  <div className="m-5 flex min-h-[58px] items-center justify-between gap-5 rounded-[13px] border border-line bg-[#0d0d0f] px-4 font-mono text-[.72rem] text-[#aaaab3]"><span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">https://orders.outray.app</span><svg className="h-[18px] w-[18px] text-[#64646d]" aria-hidden="true" viewBox="0 0 20 20"><path d="M7 6V4.8C7 3.8 7.8 3 8.8 3h6.4c1 0 1.8.8 1.8 1.8v6.4c0 1-.8 1.8-1.8 1.8H14M4.8 7h6.4c1 0 1.8.8 1.8 1.8v6.4c0 1-.8 1.8-1.8 1.8H4.8c-1 0-1.8-.8-1.8-1.8V8.8C3 7.8 3.8 7 4.8 7Z" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg></div>
                  <div className="mx-5 overflow-hidden rounded-[14px] border border-line bg-[#09090b]" role="table" aria-label="Recent tunnel requests">
                    <div className="grid min-h-[43px] grid-cols-[64px_minmax(120px,1fr)_60px_66px] items-center gap-3.5 border-b border-line px-[15px] font-sans text-[.61rem] font-[660] tracking-[.06em] text-[#9898a2] uppercase max-[620px]:grid-cols-[52px_minmax(0,1fr)_36px] max-[620px]:gap-1.5 max-[620px]:px-2 max-[620px]:text-[.6rem] [&>:last-child]:max-[620px]:hidden" role="row"><span role="columnheader">Method</span><span role="columnheader">Path</span><span role="columnheader">Status</span><span role="columnheader">Duration</span></div>
                    {requestRows.map(({ method, path, status, duration, tone }) => (
                      <div className="grid min-h-[62px] grid-cols-[64px_minmax(120px,1fr)_60px_66px] items-center gap-3.5 border-b border-line px-[15px] font-mono text-[.72rem] text-[#b4b4bd] last:border-b-0 max-[620px]:grid-cols-[52px_minmax(0,1fr)_36px] max-[620px]:gap-1.5 max-[620px]:px-2 max-[620px]:text-[.6rem] [&>:last-child]:max-[620px]:hidden" role="row" key={`${method}-${duration}`}><span role="cell" className={`w-fit rounded-md px-1.5 py-1 text-[.61rem] ${tone}`}>{method}</span><span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" role="cell">{path}</span><span className="text-success" role="cell">{status}</span><span role="cell">{duration}</span></div>
                    ))}
                  </div>
                  <div className="flex items-center gap-[7px] px-5 pt-[18px] pb-5 text-[.65rem] text-[#92929b] [&>span]:rounded-[7px] [&>span]:border [&>span]:border-white/[.075] [&>span]:px-2 [&>span]:py-[5px] [&>span:last-child]:max-[620px]:hidden"><span>HTTP</span><span>localhost:3000</span><span>Request capture enabled</span></div>
                </div>
                <FeatureList features={tunnelFeatures} label="Tunnel capabilities" />
              </article>

              <article className={articleClass} id="observability" role="tabpanel" aria-labelledby="showcase-tab-observability" data-product-panel="observability" data-product-section="observability" data-active="false">
                <div className={copyClass}>
                  <p className={indexClass}>02 / Observability</p>
                  <h2 className={titleClass}>Follow a request all the way through.</h2>
                  <p className={descriptionClass}>See what your server did, where it spent time, and which log belongs to which request—without instrumenting every handler by hand.</p>
                  <div className={actionClass}>
                    <a className={linkClass} href="/products/observability" data-track="cta" data-track-label="observability-explore">Explore Observability <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg></a>
                    <a className={docsLinkClass} href={`${docsUrl}/observability`} data-track="cta" data-track-label="observability-read-docs">Documentation</a>
                  </div>
                </div>
                <div className={`${panelClass} isolate`} role="group" aria-label="Distributed trace interface">
                  <div className={toolbarClass}><div className={panelTitleClass}><span className={glyphClass}><ProductIcon product="observability" className={panelIconClass} /></span><span><small>Trace details</small><strong>POST /api/orders</strong></span></div><span className="rounded-lg border border-[rgb(131_103_199_/.2)] bg-[rgb(131_103_199_/.08)] px-[9px] py-1.5 font-mono text-[.64rem] text-[#b9a7e6]">412ms</span></div>
                  <div className="mx-5 mt-[18px] grid grid-cols-3 overflow-hidden rounded-[13px] border border-line [&>span]:grid [&>span]:gap-[7px] [&>span]:px-[15px] [&>span]:py-[13px] [&>span+span]:border-l [&>span+span]:border-line [&_small]:text-[.58rem] [&_small]:font-[650] [&_small]:tracking-[.07em] [&_small]:text-[#585860] [&_small]:uppercase [&_strong]:font-mono [&_strong]:text-[.69rem] [&_strong]:text-[#c9c9ce]"><span><small>Status</small><strong className="flex items-center gap-1.5 !text-success"><i className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_9px_rgb(52_211_153_/.55)]" />OK</strong></span><span><small>Service</small><strong>orders-api</strong></span><span><small>Spans</small><strong>6</strong></span></div>
                  <div className="m-5 mt-4 overflow-hidden rounded-[14px] border border-line" role="list" aria-label="Trace span waterfall">
                    {traceSpans.map(({ name, duration, bar }, index) => (
                      <div className={`grid min-h-[47px] grid-cols-[minmax(112px,.62fr)_minmax(150px,1.38fr)_51px] items-center gap-3 border-b border-line px-[13px] font-mono text-[.62rem] text-[#7e7e87] last:border-b-0 max-[620px]:grid-cols-[minmax(90px,.72fr)_minmax(120px,1.28fr)] ${index === 0 ? "text-[#d2d2d7]" : ""}`} role="listitem" key={name}><span className="overflow-hidden text-ellipsis whitespace-nowrap">{name}</span><i className={`relative h-[18px] overflow-hidden rounded-md bg-[#111114] not-italic after:absolute after:inset-y-[3px] after:rounded-sm after:bg-[linear-gradient(90deg,#654aa8,#9b83d2)] after:content-[''] ${bar}`} /><small className="text-right text-[#5d5d65] max-[620px]:hidden">{duration}</small></div>
                    ))}
                  </div>
                </div>
                <FeatureList features={observabilityFeatures} label="Observability capabilities" />
              </article>

              <article className={articleClass} id="secrets" role="tabpanel" aria-labelledby="showcase-tab-secrets" data-product-panel="secrets" data-product-section="secrets" data-active="false">
                <div className={copyClass}>
                  <p className={indexClass}>03 / Secrets</p>
                  <h2 className={titleClass}>Keep configuration out of the repo.</h2>
                  <p className={descriptionClass}>Store encrypted values in a vault, organize them across environments, and inject them only when your process starts.</p>
                  <div className={actionClass}>
                    <a className={linkClass} href="/products/secrets" data-track="cta" data-track-label="secrets-explore">Explore Secrets <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg></a>
                    <a className={docsLinkClass} href={`${docsUrl}/secrets`} data-track="cta" data-track-label="secrets-read-docs">Documentation</a>
                  </div>
                </div>
                <div className={panelClass} role="group" aria-label="Secrets vault interface">
                  <div className={toolbarClass}><div className={panelTitleClass}><span className={glyphClass}><ProductIcon product="secrets" className={panelIconClass} /></span><span><small>Vault</small><strong>orders-service</strong></span></div><span className="rounded-lg border border-[rgb(131_103_199_/.2)] bg-[rgb(131_103_199_/.08)] px-[9px] py-1.5 font-mono text-[.64rem] text-[#b9a7e6]">Production</span></div>
                  <div className="grid min-h-[45px] grid-cols-[minmax(120px,1fr)_minmax(120px,.9fr)_70px] items-center gap-3.5 border-b border-line px-5 text-[.6rem] font-[660] tracking-[.08em] text-[#9898a2] uppercase max-[620px]:grid-cols-[minmax(105px,1fr)_minmax(85px,.8fr)] max-[620px]:px-3.5 max-[390px]:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)] max-[390px]:gap-2 max-[390px]:px-2.5 [&>:last-child]:max-[620px]:hidden"><span>Key</span><span>Value</span><span>Updated</span></div>
                  {secretRows.map(({ key, updated }) => (
                    <div className="grid min-h-16 grid-cols-[minmax(120px,1fr)_minmax(120px,.9fr)_70px] items-center gap-3.5 border-b border-line px-5 text-[.7rem] text-[#c8c8ce] max-[620px]:grid-cols-[minmax(105px,1fr)_minmax(85px,.8fr)] max-[620px]:px-3.5 max-[390px]:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)] max-[390px]:gap-2 max-[390px]:px-2.5" key={key}><span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono">{key}</span><code className="overflow-hidden text-ellipsis whitespace-nowrap font-mono tracking-[.1em] text-[#94949d]">••••••••••••</code><small className="text-right text-[#5d5d65] max-[620px]:hidden">{updated}</small></div>
                  ))}
                  <div className="flex min-h-14 items-center gap-2 px-5 text-[.66rem] text-[#686870]"><i className="h-1.5 w-1.5 shrink-0 rounded-full bg-success shadow-[0_0_9px_rgb(52_211_153_/.55)]" /><span>Encrypted at rest · decrypted on explicit reveal or runtime delivery</span></div>
                </div>
                <FeatureList features={secretFeatures} label="Secrets capabilities" />
              </article>

              <article className={articleClass} id="uptime" role="tabpanel" aria-labelledby="showcase-tab-uptime" data-product-panel="uptime" data-product-section="uptime" data-active="false">
                <div className={copyClass}>
                  <p className={indexClass}>04 / Uptime</p>
                  <h2 className={titleClass}>Know when a service goes down.</h2>
                  <p className={descriptionClass}>Check your public endpoints, alert your team when they fail, and keep everyone informed on a status page you control.</p>
                  <div className={actionClass}>
                    <a className={linkClass} href="/products/uptime" data-track="cta" data-track-label="uptime-explore">Explore Uptime <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg></a>
                    <a className={docsLinkClass} href={`${docsUrl}/uptime`} data-track="cta" data-track-label="uptime-read-docs">Documentation</a>
                  </div>
                </div>
                <div className={panelClass} role="group" aria-label="Uptime status page interface">
                  <div className={toolbarClass}><div className={panelTitleClass}><span className={glyphClass}><ProductIcon product="uptime" className={panelIconClass} /></span><span><small>Status page</small><strong>Acme services</strong></span></div><span className="rounded-lg border border-white/[.11] px-[9px] py-1.5 font-mono text-[.64rem] text-[#a8a8b0]">Public</span></div>
                  <div className="grid gap-[17px] p-5">
                    <div className="flex min-h-[72px] items-center gap-3.5 rounded-[13px] border border-[rgb(52_211_153_/.22)] bg-[rgb(52_211_153_/.055)] px-[15px] py-[13px]"><span className="grid h-[35px] w-[35px] shrink-0 place-items-center rounded-[9px] bg-[rgb(52_211_153_/.12)] text-success" aria-hidden="true"><ProductIcon product="uptime" className={panelIconClass} /></span><span className="grid gap-[5px]"><strong className="text-[.89rem] font-[650] text-[#d2f7e6]">All systems operational</strong><small className="text-[.68rem] text-[#849a8e]">Current status across visible services</small></span></div>
                    <div className="overflow-hidden rounded-[13px] border border-line bg-[#0b0b0d]">
                      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-[17px]"><strong className="text-[.73rem] font-[640] text-[#d5d5d9]">Services</strong><span className="font-mono text-[.62rem] text-[#777781]">2 components</span></div>
                      <div className="flex min-h-[55px] items-center justify-between gap-3 px-[17px]"><span className="text-[.75rem] text-[#c9c9d0]">API</span><span className="inline-flex items-center gap-[7px] font-mono text-[.63rem] text-success"><i className="h-1.5 w-1.5 rounded-full bg-success" />Operational</span></div>
                      <div className="flex min-h-[55px] items-center justify-between gap-3 border-t border-line px-[17px]"><span className="text-[.75rem] text-[#c9c9d0]">Dashboard</span><span className="inline-flex items-center gap-[7px] font-mono text-[.63rem] text-success"><i className="h-1.5 w-1.5 rounded-full bg-success" />Operational</span></div>
                    </div>
                    <div className="flex justify-between gap-3 px-0.5 py-[11px] text-[.68rem]"><span className="text-[#7e7e87]">Incident history</span><strong className="font-[520] text-[#b7b7bf]">No recent incidents</strong></div>
                  </div>
                </div>
                <FeatureList features={uptimeFeatures} label="Uptime capabilities" />
              </article>
            </div>
          </div>
          <svg className="pointer-events-none absolute inset-0 z-[1] hidden h-full w-full overflow-visible group-data-[outline-ready=true]/frame:block max-[620px]:hidden" data-product-outline-svg aria-hidden="true" preserveAspectRatio="none"><path className="fill-[#0a0a0b] stroke-line-strong [stroke-width:1.5] [vector-effect:non-scaling-stroke]" data-product-outline-path /></svg>
        </div>
      </div>
    </section>
  );
}
