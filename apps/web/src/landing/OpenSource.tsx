import { GitHubIcon } from "./GitHubIcon";

export function OpenSource({ githubUrl }: { githubUrl: string }) {
  return (
    <section className="pt-0 pb-[clamp(100px,12vw,164px)] max-[620px]:pb-[84px]" aria-labelledby="open-source-title">
      <div className="relative mx-auto flex min-h-[580px] w-[min(calc(100%-48px),var(--container-page))] flex-col items-center justify-center gap-6 overflow-hidden rounded-shell border border-line bg-[radial-gradient(circle_at_50%_12%,rgb(131_103_199_/.12),transparent_30rem),linear-gradient(145deg,#0c0c0e,#080809)] px-[clamp(24px,6vw,80px)] py-[clamp(52px,7vw,88px)] text-center shadow-card before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(rgb(255_255_255_/.026)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255_/.026)_1px,transparent_1px)] before:bg-[size:48px_48px] before:[mask-image:radial-gradient(ellipse_at_50%_35%,black,transparent_75%)] before:content-[''] max-[1080px]:w-[min(calc(100%-36px),var(--container-page))] max-[860px]:w-[min(calc(100%-28px),var(--container-page))] max-[620px]:min-h-0 max-[620px]:w-[min(calc(100%-24px),var(--container-page))] max-[620px]:gap-[18px] max-[620px]:rounded-[20px] max-[620px]:px-5 max-[620px]:py-12">
        <div className="relative z-[1] grid h-[82px] w-[82px] place-items-center text-ink drop-shadow-[0_12px_30px_rgb(131_103_199_/.25)] max-[620px]:h-[68px] max-[620px]:w-[68px] [&>svg]:h-full [&>svg]:w-full" aria-hidden="true">
          <GitHubIcon />
        </div>
        <div className="relative z-[1] w-full max-w-[800px]">
          <p className="inline-flex items-center gap-[9px] text-[.74rem] leading-[1.1] font-bold tracking-[.15em] text-accent-light uppercase"><span className="h-px w-[18px] bg-current" /> Built in the open</p>
          <h2 className="mx-auto mt-[18px] text-[clamp(3.1rem,5vw,4.7rem)] leading-[1.02] font-[570] tracking-[-.062em] max-[620px]:text-[clamp(2.3rem,10vw,3.2rem)]" id="open-source-title">Inspect it. Run it.<br />Improve it.</h2>
          <p className="mx-auto mt-[22px] max-w-[57ch] text-[clamp(1rem,1.3vw,1.12rem)] leading-[1.65] text-muted max-[620px]:mt-[18px]">
            OutRay is built in the open. Inspect and self-host the AGPL-3.0 platform, and integrate with MIT-licensed framework SDKs.
          </p>
          <a className="relative mt-[30px] inline-flex min-h-[46px] items-center justify-center gap-[9px] overflow-hidden rounded-[14px] border border-line-strong bg-[#111113] px-[19px] text-[.94rem] font-[620] tracking-[-.015em] text-ink transition-[border-color,background-color,color,transform,box-shadow] duration-200 ease-snappy hover:-translate-y-px hover:border-white/30 hover:bg-[#18181b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-light [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:shrink-0 [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:translate-x-0.5" href={githubUrl} target="_blank" rel="noreferrer" data-track="github" data-track-label="open-source">
            Explore the repository
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg>
          </a>
        </div>
      </div>
    </section>
  );
}
