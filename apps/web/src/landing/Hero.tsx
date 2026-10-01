import { GitHubIcon } from "./GitHubIcon";

export function Hero({ signupUrl, githubUrl }: { signupUrl: string; githubUrl: string }) {
  return (
<section className="hero" id="top" aria-labelledby="hero-title">
  <div className="page-shell hero-content hero-shell">
    <h1 className="hero-title" id="hero-title">Everything between <span className="hero-endpoint hero-endpoint-local">localhost</span> and <span className="hero-endpoint hero-endpoint-production">production</span></h1>
    <p className="hero-lede">
      Secure tunnels, server-side observability, and encrypted runtime secrets in one developer platform.
    </p>
    <div className="hero-actions">
      <a className="button button-primary" href={signupUrl} data-track="cta" data-track-label="hero-start-free">
        Start free
        <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m7 4 6 6-6 6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6"></path></svg>
      </a>
      <a className="button button-secondary" href={githubUrl} target="_blank" rel="noreferrer" data-track="github" data-track-label="hero">
        <GitHubIcon />
        GitHub
      </a>
    </div>

  </div>

</section>
  );
}

