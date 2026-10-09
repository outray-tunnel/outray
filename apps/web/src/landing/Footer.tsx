export function Footer({ docsUrl, statusUrl, loginUrl, privacyUrl, termsUrl, githubUrl }: { docsUrl: string; statusUrl: string; loginUrl: string; privacyUrl: string; termsUrl: string; githubUrl: string }) {
  const currentYear = new Date().getFullYear();
  return (
<footer className="site-footer">
  <div className="page-shell footer-shell">
    <div className="footer-brand">
      <a className="brand-link" href="/" aria-label="OutRay home" data-track="navigation" data-track-label="footer-logo">
        <img src="/brand/outray-mark.svg" width="34" height="34" alt="" loading="lazy" />
        <span>OutRay</span>
      </a>
      <p>Developer infrastructure for exposing, observing, and securing your services.</p>
    </div>
    <nav aria-label="Footer navigation">
      <ul className="footer-links">
        <li><a className="footer-link" href="/products" data-track="navigation" data-track-label="footer-products">All products</a></li>
        <li><a className="footer-link" href="/products/tunnels" data-track="navigation" data-track-label="footer-tunnels">Tunnels</a></li>
        <li><a className="footer-link" href="/products/observability" data-track="navigation" data-track-label="footer-observability">Observability</a></li>
        <li><a className="footer-link" href="/products/secrets" data-track="navigation" data-track-label="footer-secrets">Secrets</a></li>
        <li><a className="footer-link" href="/products/uptime" data-track="navigation" data-track-label="footer-uptime">Uptime</a></li>
        <li><a className="footer-link" href={docsUrl} data-track="navigation" data-track-label="footer-docs">Docs</a></li>
        <li><a className="footer-link" href={statusUrl} target="_blank" rel="noreferrer" data-track="navigation" data-track-label="footer-status">Status</a></li>
        <li><a className="footer-link" href={loginUrl} data-track="cta" data-track-label="footer-login">Log in</a></li>
        <li><a className="footer-link" href={privacyUrl} data-track="navigation" data-track-label="footer-privacy">Privacy</a></li>
        <li><a className="footer-link" href={termsUrl} data-track="navigation" data-track-label="footer-terms">Terms</a></li>
        <li><a className="footer-link" href={githubUrl} target="_blank" rel="noreferrer" data-track="github" data-track-label="footer">GitHub</a></li>
      </ul>
    </nav>
  </div>
  <div className="page-shell footer-bottom">
    <p>© {currentYear} OutRay.</p>
    <p>Built for the people on call.</p>
  </div>
</footer>
  );
}
