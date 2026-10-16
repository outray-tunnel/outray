import { Link } from "@tanstack/react-router";
import { FaTwitter } from "react-icons/fa";
import { GitHubIcon } from "./GitHubIcon";

const socialLinkClassName = "inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-[#85858d] transition-colors duration-200 hover:bg-white/[0.04] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-light motion-reduce:transition-none [&>svg]:size-[18px]";
const groupHeadingClassName = "mb-3 text-[.84rem] font-medium text-[#e5e5e9]";
const groupListClassName = "grid list-none justify-items-start gap-y-1 p-0 [&_a]:inline-flex [&_a]:w-fit [&_a]:min-h-[34px] [&_a]:items-center [&_a]:text-[.84rem] [&_a]:text-[#85858d] [&_a]:transition-colors [&_a]:duration-200 [&_a:hover]:text-white [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-accent-light motion-reduce:[&_a]:transition-none";

export function Footer({ statusUrl, loginUrl, privacyUrl, termsUrl, githubUrl }: { statusUrl: string; loginUrl: "/login"; privacyUrl: "/privacy"; termsUrl: "/terms"; githubUrl: string }) {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="relative z-[1] border-t border-line bg-page">
      <div className="mx-auto grid w-[min(calc(100%-48px),var(--container-page))] grid-cols-[minmax(240px,1fr)_minmax(0,1.15fr)] gap-20 pt-[54px] pb-12 max-[1080px]:w-[min(calc(100%-36px),var(--container-page))] max-[860px]:w-[min(calc(100%-28px),var(--container-page))] max-[860px]:grid-cols-1 max-[860px]:gap-9 max-[620px]:w-[min(calc(100%-24px),var(--container-page))]">
        <div>
          <Link className="inline-flex min-h-[42px] shrink-0 items-center gap-2.5 rounded-[11px] text-[1.06rem] font-bold tracking-[-.035em] text-[#f5f5f6] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-light" to="/" aria-label="OutRay home" data-track="navigation" data-track-label="footer-logo">
            <img className="h-[30px] w-[30px]" src="/brand/outray-mark.svg" width="34" height="34" alt="" loading="lazy" />
            <span>OutRay</span>
          </Link>
          <p className="mt-[17px] max-w-[370px] text-[.88rem] leading-[1.65] text-[#91919b]">Developer infrastructure for exposing, observing, and securing your services.</p>
        </div>
        <nav aria-label="Footer navigation" className="grid grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,1fr))] gap-x-[clamp(16px,3vw,48px)]">
          <div>
            <h3 id="footer-products" className={groupHeadingClassName}>Products</h3>
            <ul aria-labelledby="footer-products" className={groupListClassName}>
              <li><Link to="/products/tunnels" data-track="navigation" data-track-label="footer-tunnels">Tunnels</Link></li>
              <li><Link to="/products/observability" data-track="navigation" data-track-label="footer-observability">Observability</Link></li>
              <li><Link to="/products/secrets" data-track="navigation" data-track-label="footer-secrets">Secrets</Link></li>
              <li><Link to="/products/uptime" data-track="navigation" data-track-label="footer-uptime">Uptime</Link></li>
            </ul>
          </div>
          <div>
            <h3 id="footer-resources" className={groupHeadingClassName}>Resources</h3>
            <ul aria-labelledby="footer-resources" className={groupListClassName}>
              <li><Link to="/docs/$" params={{ _splat: "" }} data-track="navigation" data-track-label="footer-docs">Docs</Link></li>
              <li><a href={statusUrl} target="_blank" rel="noreferrer" data-track="navigation" data-track-label="footer-status">Status</a></li>
            </ul>
          </div>
          <div>
            <h3 id="footer-company" className={groupHeadingClassName}>Company</h3>
            <ul aria-labelledby="footer-company" className={groupListClassName}>
              <li><Link to={loginUrl} data-track="cta" data-track-label="footer-login">Log in</Link></li>
              <li><Link to={privacyUrl} data-track="navigation" data-track-label="footer-privacy">Privacy</Link></li>
              <li><Link to={termsUrl} data-track="navigation" data-track-label="footer-terms">Terms</Link></li>
            </ul>
          </div>
        </nav>
      </div>
      <div className="mx-auto flex min-h-[76px] w-[min(calc(100%-48px),var(--container-page))] items-center justify-between gap-4 border-t border-white/[.07] text-[.74rem] text-[#92929b] max-[1080px]:w-[min(calc(100%-36px),var(--container-page))] max-[860px]:w-[min(calc(100%-28px),var(--container-page))] max-[620px]:min-h-[80px] max-[620px]:w-[min(calc(100%-24px),var(--container-page))]">
        <p>© {currentYear} OutRay.</p>
        <nav aria-label="OutRay social links" className="flex items-center gap-2">
          <a className={socialLinkClassName} href={githubUrl} target="_blank" rel="noopener noreferrer" aria-label="OutRay on GitHub" title="GitHub" data-track="github" data-track-label="footer"><GitHubIcon /></a>
          <a className={socialLinkClassName} href="https://twitter.com/outraytunnel" target="_blank" rel="noopener noreferrer" aria-label="OutRay on Twitter" title="Twitter" data-track="navigation" data-track-label="footer-twitter"><FaTwitter size={18} aria-hidden="true" focusable="false" /></a>
        </nav>
      </div>
    </footer>
  );
}
