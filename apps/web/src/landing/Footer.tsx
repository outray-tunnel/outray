export function Footer({ docsUrl, statusUrl, loginUrl, privacyUrl, termsUrl, githubUrl }: { docsUrl: string; statusUrl: string; loginUrl: string; privacyUrl: string; termsUrl: string; githubUrl: string }) {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="relative z-[1] border-t border-line bg-page">
      <div className="mx-auto grid w-[min(calc(100%-48px),var(--container-page))] grid-cols-[minmax(230px,1fr)_auto] gap-[70px] pt-[54px] pb-9 max-[1080px]:w-[min(calc(100%-36px),var(--container-page))] max-[860px]:w-[min(calc(100%-28px),var(--container-page))] max-[620px]:w-[min(calc(100%-24px),var(--container-page))] max-[620px]:grid-cols-1">
        <div>
          <a className="inline-flex min-h-[42px] shrink-0 items-center gap-2.5 rounded-[11px] text-[1.06rem] font-bold tracking-[-.035em] text-[#f5f5f6] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-light" href="/" aria-label="OutRay home" data-track="navigation" data-track-label="footer-logo">
            <img className="h-[30px] w-[30px]" src="/brand/outray-mark.svg" width="34" height="34" alt="" loading="lazy" />
            <span>OutRay</span>
          </a>
          <p className="mt-[17px] max-w-[370px] text-[.88rem] leading-[1.65] text-[#91919b]">Developer infrastructure for exposing, observing, and securing your services.</p>
        </div>
        <nav aria-label="Footer navigation">
          <ul className="grid list-none grid-cols-[repeat(2,minmax(110px,auto))] gap-x-11 gap-y-[5px] p-0 [&_a]:inline-flex [&_a]:min-h-[34px] [&_a]:items-center [&_a]:text-[.84rem] [&_a]:text-[#85858d] [&_a]:transition-colors [&_a]:duration-200 hover:[&_a]:text-white [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-accent-light">
            <li><a href="/products" data-track="navigation" data-track-label="footer-products">All products</a></li>
            <li><a href="/products/tunnels" data-track="navigation" data-track-label="footer-tunnels">Tunnels</a></li>
            <li><a href="/products/observability" data-track="navigation" data-track-label="footer-observability">Observability</a></li>
            <li><a href="/products/secrets" data-track="navigation" data-track-label="footer-secrets">Secrets</a></li>
            <li><a href="/products/uptime" data-track="navigation" data-track-label="footer-uptime">Uptime</a></li>
            <li><a href={docsUrl} data-track="navigation" data-track-label="footer-docs">Docs</a></li>
            <li><a href={statusUrl} target="_blank" rel="noreferrer" data-track="navigation" data-track-label="footer-status">Status</a></li>
            <li><a href={loginUrl} data-track="cta" data-track-label="footer-login">Log in</a></li>
            <li><a href={privacyUrl} data-track="navigation" data-track-label="footer-privacy">Privacy</a></li>
            <li><a href={termsUrl} data-track="navigation" data-track-label="footer-terms">Terms</a></li>
            <li><a href={githubUrl} target="_blank" rel="noreferrer" data-track="github" data-track-label="footer">GitHub</a></li>
          </ul>
        </nav>
      </div>
      <div className="mx-auto flex min-h-[76px] w-[min(calc(100%-48px),var(--container-page))] items-center justify-between border-t border-white/[.07] text-[.74rem] text-[#92929b] max-[1080px]:w-[min(calc(100%-36px),var(--container-page))] max-[860px]:w-[min(calc(100%-28px),var(--container-page))] max-[620px]:min-h-[92px] max-[620px]:w-[min(calc(100%-24px),var(--container-page))] max-[620px]:flex-col max-[620px]:items-start max-[620px]:justify-center max-[620px]:gap-1">
        <p>© {currentYear} OutRay.</p>
        <p>Built for the people on call.</p>
      </div>
    </footer>
  );
}
