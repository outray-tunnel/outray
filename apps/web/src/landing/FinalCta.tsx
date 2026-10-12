import { Link } from "@tanstack/react-router";

export function FinalCta({ signupUrl }: { signupUrl: "/signup" }) {
  return (
    <section className="relative isolate overflow-hidden py-[clamp(108px,14vw,190px)] text-center before:absolute before:top-1/2 before:left-1/2 before:-z-[1] before:h-[520px] before:w-[min(850px,90vw)] before:-translate-x-1/2 before:-translate-y-1/2 before:bg-[radial-gradient(ellipse,rgb(131_103_199_/.15),transparent_68%)] before:content-['']" aria-labelledby="final-cta-title">
      <div className="absolute inset-0 -z-[2] bg-[linear-gradient(rgb(255_255_255_/.028)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255_/.028)_1px,transparent_1px)] bg-[size:54px_54px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_67%)]" aria-hidden="true" />
      <div className="mx-auto w-[min(calc(100%-48px),var(--container-page))] text-center max-[1080px]:w-[min(calc(100%-36px),var(--container-page))] max-[860px]:w-[min(calc(100%-28px),var(--container-page))] max-[620px]:w-[min(calc(100%-24px),var(--container-page))]">
        <img className="mx-auto mb-6 h-12 w-12 drop-shadow-[0_0_22px_rgb(131_103_199_/.4)]" src="/brand/outray-mark.svg" width="48" height="48" alt="" loading="lazy" />
        <h2 className="mx-auto max-w-[900px] text-[clamp(2rem,4.5vw,4rem)] leading-[1.15] font-[570] tracking-[-.072em] [&>span]:block" id="final-cta-title">
          <span>Everything behind your app.</span>{" "}
          <span>Together in OutRay.</span>
        </h2>
        <div className="mt-8 flex flex-wrap justify-center gap-2.5 max-[620px]:grid max-[620px]:grid-cols-1">
          <Link className="relative inline-flex min-h-[46px] items-center justify-center gap-[9px] overflow-hidden rounded-[14px] border border-white/90 bg-white px-[19px] text-[.94rem] font-[620] tracking-[-.015em] text-[#080808] shadow-[0_10px_30px_rgb(255_255_255_/.08)] transition-[border-color,background-color,color,transform,box-shadow] duration-200 ease-snappy hover:-translate-y-px hover:border-white hover:bg-[#f1eff7] hover:shadow-[0_12px_36px_rgb(131_103_199_/.18)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-light max-[620px]:w-full" to={signupUrl} data-track="cta" data-track-label="final-start-free">Get started</Link>
        </div>
      </div>
    </section>
  );
}
