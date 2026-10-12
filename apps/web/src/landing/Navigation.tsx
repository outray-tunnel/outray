import { ProductIcon } from "./ProductIcon";
import { authClient } from "@/lib/auth-client";

const productLinks = [
  { id: "tunnels", label: "Tunnels", href: "/products/tunnels", description: "Put a local service on a public URL." },
  { id: "observability", label: "Observability", href: "/products/observability", description: "Follow requests through traces, logs, and metrics." },
  { id: "secrets", label: "Secrets", href: "/products/secrets", description: "Deliver encrypted values to every environment." },
  { id: "uptime", label: "Uptime", href: "/products/uptime", description: "Check endpoints and share service status." },
] as const;

const activeItemClasses = {
  tunnels: "group-data-[active-product=tunnels]/products:bg-white/[.055]",
  observability: "group-data-[active-product=observability]/products:bg-white/[.055]",
  secrets: "group-data-[active-product=secrets]/products:bg-white/[.055]",
  uptime: "group-data-[active-product=uptime]/products:bg-white/[.055]",
} as const;

const activePreviewClasses = {
  tunnels: "group-data-[active-product=tunnels]/products:translate-y-0 group-data-[active-product=tunnels]/products:opacity-100",
  observability: "group-data-[active-product=observability]/products:translate-y-0 group-data-[active-product=observability]/products:opacity-100",
  secrets: "group-data-[active-product=secrets]/products:translate-y-0 group-data-[active-product=secrets]/products:opacity-100",
  uptime: "group-data-[active-product=uptime]/products:translate-y-0 group-data-[active-product=uptime]/products:opacity-100",
} as const;

const previewClass = "absolute inset-0 translate-y-[7px] p-[25px_25px_20px] opacity-0 transition-[opacity,transform] duration-200 ease-snappy";
const previewCardClass = "overflow-hidden rounded-[9px] border border-white/[.09] bg-[#0b0b0d]";
const focusClass = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-light";
const primaryButtonClass = `relative inline-flex min-h-[42px] items-center justify-center gap-2 overflow-hidden rounded-[14px] border border-white/90 bg-white px-4 text-[.94rem] font-[620] tracking-[-.015em] text-[#080808] shadow-[0_10px_30px_rgb(255_255_255_/.08)] transition-[border-color,background-color,transform,box-shadow] duration-200 ease-snappy hover:-translate-y-px hover:border-white hover:bg-[#f1eff7] hover:shadow-[0_12px_36px_rgb(131_103_199_/.18)] ${focusClass}`;

export function Navigation({ loginUrl, signupUrl, docsUrl, githubUrl }: { loginUrl: string; signupUrl: string; docsUrl: string; githubUrl: string }) {
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const { data: organizations } = authClient.useListOrganizations();
  const dashboardOrganization = organizations?.find((organization) => organization.id === activeOrganization?.id) ?? organizations?.[0];
  const dashboardUrl = dashboardOrganization ? `/${encodeURIComponent(dashboardOrganization.slug)}/tunnel` : "/select";

  return (
    <header
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] border-b border-transparent transition-[border-color,background-color] duration-200 data-[scrolled=true]:border-white/[.08] data-[scrolled=true]:bg-page/90 data-[scrolled=true]:backdrop-blur-[18px]"
      data-site-header
    >
      <div className="pointer-events-auto mx-auto flex min-h-[78px] w-[min(calc(100%-48px),var(--container-page))] items-center gap-6 max-[1080px]:w-[min(calc(100%-36px),var(--container-page))] max-[860px]:w-[min(calc(100%-28px),var(--container-page))] max-[860px]:gap-2.5 max-[620px]:w-[min(calc(100%-24px),var(--container-page))]">
        <a
          className={`inline-flex min-h-[42px] shrink-0 items-center gap-2.5 rounded-[11px] text-[1.06rem] font-bold tracking-[-.035em] text-[#f5f5f6] ${focusClass}`}
          href="/"
          aria-label="OutRay home"
          data-track="navigation"
          data-track-label="logo"
        >
          <img className="h-[30px] w-[30px]" src="/brand/outray-mark.svg" width="34" height="34" alt="" />
          <span>OutRay</span>
        </a>

        <nav className="mx-auto flex items-center gap-[clamp(22px,3vw,42px)] max-[860px]:hidden" aria-label="Primary navigation">
          <details className="group/products relative" data-products-menu data-active-product="tunnels">
            <summary className={`inline-flex min-h-[42px] cursor-pointer list-none items-center gap-[7px] text-[.91rem] font-[520] text-[#a9a9b1] transition-colors duration-200 hover:text-white group-open/products:text-white [&::-webkit-details-marker]:hidden ${focusClass}`}>
              Products
              <svg className="h-3.5 w-3.5 text-muted transition-transform duration-200 group-open/products:rotate-180" aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg>
            </summary>
            <div className="absolute top-full left-1/2 z-[2] w-[min(720px,calc(100vw-48px))] -translate-x-1/2 pt-[17px]">
              <div className="grid min-h-[390px] grid-cols-[.95fr_1.05fr] gap-3 rounded-2xl border border-white/[.11] bg-[#0d0d0f] p-2.5 shadow-[0_30px_70px_rgb(0_0_0_/.48)] animate-products-menu motion-reduce:animate-none">
                <div className="py-[5px]">
                  <a className={`mx-3 mt-[5px] mb-[9px] inline-flex font-mono text-[.69rem] font-semibold tracking-[.12em] text-[#74747e] uppercase transition-colors hover:text-white ${focusClass}`} href="/products" data-track="navigation" data-track-label="all-products">All products →</a>
                  {productLinks.map(({ id, label, href, description }) => (
                    <a
                      key={id}
                      className={`flex min-h-[82px] items-center gap-3 rounded-[10px] px-2.5 py-[11px] text-[#e5e5e8] transition-colors duration-200 hover:bg-white/[.055] focus-visible:bg-white/[.055] ${focusClass} ${activeItemClasses[id]}`}
                      href={href}
                      aria-label={label}
                      data-menu-product={id}
                      data-track="navigation"
                      data-track-label={id}
                    >
                      <span className="grid h-[39px] w-[39px] shrink-0 place-items-center rounded-[10px] border border-white/10 bg-[#151518] text-[#b6a1e8]"><ProductIcon product={id} className="h-5 w-5 [&_.product-icon__solid]:hidden" /></span>
                      <span className="grid min-w-0 gap-[3px]"><strong className="text-[.94rem] font-[620]">{label}</strong><small className="text-[.77rem] leading-[1.32] text-[#898993]">{description}</small></span>
                      <svg className="ml-auto h-4 w-4 shrink-0 text-[#777780]" aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" /></svg>
                    </a>
                  ))}
                </div>
                <div className="relative min-w-0 overflow-hidden rounded-[10px] border border-white/[.07] bg-[#121215]" aria-hidden="true">
                  <div className={`${previewClass} ${activePreviewClasses.tunnels}`} data-menu-preview="tunnels">
                    <p className="font-mono text-[.69rem] tracking-[.1em] text-accent-light">TUNNELS / 01</p>
                    <p className="mt-[11px] mb-[19px] text-[1.34rem] leading-[1.1] font-[580] tracking-[-.04em] text-[#f1f1f3]">From local to live.</p>
                    <div className={previewCardClass}>
                      <span className="flex gap-1 border-b border-white/[.08] px-3 py-2.5"><i className="h-[5px] w-[5px] rounded-full bg-[#55555e]" /><i className="h-[5px] w-[5px] rounded-full bg-[#55555e]" /><i className="h-[5px] w-[5px] rounded-full bg-[#55555e]" /></span>
                      <code className="block px-3 py-[13px] font-mono text-[.73rem] text-[#d8d8df]"><span className="text-[#9a80d2]">$</span> outray 3000</code>
                      <div className="flex items-center justify-between gap-[9px] border-t border-white/[.08] px-3 py-2.5 font-mono text-[.67rem] text-[#aaaab3]"><span>https://orders.outray.app</span><em className="not-italic text-success">Live</em></div>
                    </div>
                  </div>
                  <div className={`${previewClass} ${activePreviewClasses.observability}`} data-menu-preview="observability">
                    <p className="font-mono text-[.69rem] tracking-[.1em] text-accent-light">OBSERVABILITY / 02</p>
                    <p className="mt-[11px] mb-[19px] text-[1.34rem] leading-[1.1] font-[580] tracking-[-.04em] text-[#f1f1f3]">See the whole request.</p>
                    <div className={`${previewCardClass} pb-[17px]`}>
                      <div className="mb-[19px] flex items-center justify-between gap-[9px] border-b border-white/[.08] px-3 py-2.5 font-mono text-[.67rem] text-[#aaaab3]"><span>GET /api/orders</span><em className="not-italic text-success">200</em></div>
                      <span className="mx-[13px] my-2.5 block h-[9px] w-[76%] rounded-[3px] bg-[#7963ad]" />
                      <span className="my-2.5 ml-[23%] block h-[9px] w-[43%] rounded-[3px] bg-[#5d4b89]" />
                      <span className="my-2.5 ml-[50%] block h-[9px] w-[22%] rounded-[3px] bg-[#4d3e71]" />
                    </div>
                  </div>
                  <div className={`${previewClass} ${activePreviewClasses.secrets}`} data-menu-preview="secrets">
                    <p className="font-mono text-[.69rem] tracking-[.1em] text-accent-light">SECRETS / 03</p>
                    <p className="mt-[11px] mb-[19px] text-[1.34rem] leading-[1.1] font-[580] tracking-[-.04em] text-[#f1f1f3]">Values where they run.</p>
                    <div className={previewCardClass}>
                      <div className="flex items-center justify-between gap-[9px] border-b border-white/[.08] px-3 py-2.5 font-mono text-[.67rem] text-[#aaaab3]"><span>production</span><span>3 secrets</span></div>
                      <p className="flex justify-between px-3 py-[9px] font-mono text-[.67rem] text-[#c3c3cb]">DATABASE_URL <span className="text-[#777781]">••••••••</span></p>
                      <p className="flex justify-between border-t border-white/[.06] px-3 py-[9px] font-mono text-[.67rem] text-[#c3c3cb]">API_KEY <span className="text-[#777781]">••••••••</span></p>
                      <p className="flex justify-between border-t border-white/[.06] px-3 py-[9px] font-mono text-[.67rem] text-[#c3c3cb]">WEBHOOK_SECRET <span className="text-[#777781]">••••••••</span></p>
                    </div>
                  </div>
                  <div className={`${previewClass} ${activePreviewClasses.uptime}`} data-menu-preview="uptime">
                    <p className="font-mono text-[.69rem] tracking-[.1em] text-accent-light">UPTIME / 04</p>
                    <p className="mt-[11px] mb-[19px] text-[1.34rem] leading-[1.1] font-[580] tracking-[-.04em] text-[#f1f1f3]">Know before your users do.</p>
                    <div className={previewCardClass}>
                      <div className="flex items-center justify-between gap-3 border-b border-white/[.08] px-[13px] py-[11px] font-mono text-[.68rem] text-[#888892]"><span>Current status</span><em className="not-italic text-success">Operational</em></div>
                      <p className="flex items-center justify-between gap-3 border-b border-white/[.08] px-[13px] py-[11px] font-mono text-[.68rem] text-[#c3c3cb]"><span>API</span><i className="h-[7px] w-[7px] rounded-full bg-success" /></p>
                      <p className="flex items-center justify-between gap-3 border-b border-white/[.08] px-[13px] py-[11px] font-mono text-[.68rem] text-[#c3c3cb]"><span>Dashboard</span><i className="h-[7px] w-[7px] rounded-full bg-success" /></p>
                      <small className="block px-[13px] py-3 font-mono text-[.64rem] text-[#777781]">Checks every minute</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </details>
          <ul className="flex list-none items-center gap-[clamp(17px,2vw,27px)] p-0 [&_a]:inline-flex [&_a]:min-h-[42px] [&_a]:items-center [&_a]:text-[.91rem] [&_a]:font-[520] [&_a]:text-[#81818b] [&_a]:transition-colors [&_a]:duration-200 hover:[&_a]:text-white [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-accent-light">
            <li><a href={docsUrl} data-track="navigation" data-track-label="docs">Docs</a></li>
            <li><a href={githubUrl} target="_blank" rel="noreferrer" data-track="github" data-track-label="navigation">GitHub</a></li>
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-[5px] max-[860px]:ml-auto">
          {isSessionPending ? (
            <span className="h-[42px] w-[210px] max-[860px]:w-[118px]" aria-hidden="true" />
          ) : session?.user ? (
            <a className={`${primaryButtonClass} max-[860px]:px-3.5`} href={dashboardUrl} data-track="cta" data-track-label="nav-dashboard">Dashboard</a>
          ) : (
            <>
              <a className={`inline-flex min-h-10 items-center rounded-[10px] px-3 text-[.9rem] font-[540] text-[#aaaab2] transition-colors duration-200 hover:bg-white/[.055] hover:text-white max-[860px]:hidden ${focusClass}`} href={loginUrl} data-track="cta" data-track-label="nav-login">Log in</a>
              <a className={`${primaryButtonClass} max-[860px]:px-3.5`} href={signupUrl} data-track="cta" data-track-label="nav-start-free">Start free</a>
            </>
          )}
        </div>

        <details className="group/mobile relative hidden max-[860px]:block" data-mobile-nav>
          <summary className={`grid h-11 w-11 cursor-pointer list-none place-items-center rounded-[10px] border border-transparent bg-transparent text-white group-open/mobile:border-white/10 group-open/mobile:bg-white/[.055] [&::-webkit-details-marker]:hidden ${focusClass}`} aria-label="Navigation menu">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>
            <span className="sr-only">Menu</span>
          </summary>
          <div className="pointer-events-none invisible absolute top-[calc(100%+9px)] right-0 grid max-h-[calc(100dvh-90px)] w-[min(360px,calc(100vw-28px))] -translate-y-[7px] scale-[.985] gap-2 overflow-y-auto rounded-xl border border-line bg-[rgb(9_9_10_/.98)] p-3 opacity-0 shadow-[0_24px_70px_rgb(0_0_0_/.55)] transition-[opacity,transform,visibility] duration-200 ease-snappy group-open/mobile:pointer-events-auto group-open/mobile:visible group-open/mobile:translate-y-0 group-open/mobile:scale-100 group-open/mobile:opacity-100">
            <nav aria-label="Mobile navigation">
              <p className="mx-2.5 mt-2 mb-1.5 font-mono text-[.69rem] font-semibold tracking-[.12em] text-[#73737e] uppercase">Products</p>
              <ul className="list-none p-0 [&_li+li]:mt-0.5">
                {productLinks.map(({ id, label, href }) => (
                  <li key={id}><a className={`flex min-h-12 items-center rounded-[10px] px-3 text-[.93rem] text-[#d1d1d7] hover:bg-white/5 hover:text-white ${focusClass}`} href={href} data-track="navigation" data-track-label={`mobile-${id}`}><span>{label}</span><svg className="ml-auto h-4 w-4 text-[#6f6f79]" aria-hidden="true" viewBox="0 0 20 20"><path d="m7 4 6 6-6 6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg></a></li>
                ))}
              </ul>
              <p className="mx-2.5 mt-2 mb-1.5 font-mono text-[.69rem] font-semibold tracking-[.12em] text-[#73737e] uppercase">Explore</p>
              <ul className="grid list-none grid-cols-1 p-0">
                <li><a className={`flex min-h-12 items-center rounded-[10px] px-3 text-[.93rem] text-[#d1d1d7] hover:bg-white/5 hover:text-white ${focusClass}`} href="/products" data-track="navigation" data-track-label="mobile-all-products">All products</a></li>
                <li><a className={`flex min-h-12 items-center rounded-[10px] px-3 text-[.93rem] text-[#d1d1d7] hover:bg-white/5 hover:text-white ${focusClass}`} href={docsUrl} data-track="navigation" data-track-label="mobile-docs">Docs</a></li>
                <li><a className={`flex min-h-12 items-center rounded-[10px] px-3 text-[.93rem] text-[#d1d1d7] hover:bg-white/5 hover:text-white ${focusClass}`} href={githubUrl} target="_blank" rel="noreferrer" data-track="github" data-track-label="mobile-navigation">GitHub</a></li>
              </ul>
            </nav>
            <div className="mt-1.5 grid grid-cols-1 border-t border-line pt-2.5">
              {!isSessionPending && (session?.user ? (
                <a className={`flex min-h-[46px] items-center justify-between rounded-[10px] px-3 text-[.9rem] text-[#e5e5e9] hover:bg-white/5 ${focusClass}`} href={dashboardUrl} data-track="cta" data-track-label="mobile-dashboard">Dashboard <span aria-hidden="true">↗</span></a>
              ) : (
                <a className={`flex min-h-[46px] items-center justify-between rounded-[10px] px-3 text-[.9rem] text-[#e5e5e9] hover:bg-white/5 ${focusClass}`} href={loginUrl} data-track="cta" data-track-label="mobile-login">Log in to console <span aria-hidden="true">↗</span></a>
              ))}
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
