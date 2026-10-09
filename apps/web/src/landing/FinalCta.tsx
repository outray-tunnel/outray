export function FinalCta({ signupUrl }: { signupUrl: string }) {
  return (
<section className="final-cta" aria-labelledby="final-cta-title">
  <div className="final-cta-grid" aria-hidden="true"></div>
  <div className="page-shell final-cta-content">
    <img src="/brand/outray-mark.svg" width="48" height="48" alt="" loading="lazy" />
    <h2 id="final-cta-title">
      <span>Everything behind your app.</span>{" "}
      <span>Together in OutRay.</span>
    </h2>
    <div className="final-cta-actions cta-actions">
      <a className="button button-primary" href={signupUrl} data-track="cta" data-track-label="final-start-free">Get started</a>
    </div>
  </div>
</section>
  );
}
