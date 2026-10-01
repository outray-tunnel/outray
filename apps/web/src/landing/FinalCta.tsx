export function FinalCta({ signupUrl, githubUrl }: { signupUrl: string; githubUrl: string }) {
  return (
<section className="final-cta" aria-labelledby="final-cta-title">
  <div className="final-cta-grid" aria-hidden="true"></div>
  <div className="page-shell final-cta-content">
    <img src="/brand/outray-mark.svg" width="48" height="48" alt="" loading="lazy" />
    <p className="eyebrow"><span></span> Start where your service is</p>
    <h2 id="final-cta-title">Your next request should tell you more.</h2>
    <p>Open a tunnel, capture a trace, or inject a vault. OutRay is ready when your service is.</p>
    <div className="final-cta-actions cta-actions">
      <a className="button button-primary" href={signupUrl} data-track="cta" data-track-label="final-start-free">Start free</a>
      <a className="button button-secondary" href={githubUrl} target="_blank" rel="noreferrer" data-track="github" data-track-label="final">View on GitHub</a>
    </div>
  </div>
</section>
  );
}

