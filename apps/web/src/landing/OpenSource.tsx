import { GitHubIcon } from "./GitHubIcon";

export function OpenSource({ githubUrl }: { githubUrl: string }) {
  return (
<section className="open-source" aria-labelledby="open-source-title">
  <div className="page-shell open-source-shell open-source-card">
    <div className="open-source-mark" aria-hidden="true">
      <GitHubIcon />
    </div>
    <div className="open-source-copy">
      <p className="eyebrow"><span></span> Built in the open</p>
      <h2 id="open-source-title">Inspect it. Run it.<br />Improve it.</h2>
      <p>
        OutRay is built in the open. Inspect and self-host the AGPL-3.0 platform, and integrate with MIT-licensed framework SDKs.
      </p>
      <a className="button button-secondary" href={githubUrl} target="_blank" rel="noreferrer" data-track="github" data-track-label="open-source">
        Explore the repository
        <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path></svg>
      </a>
    </div>
  </div>
</section>
  );
}

