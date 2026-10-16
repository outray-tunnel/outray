import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ProductIcon } from "../ProductIcon";
import { ProductPreview } from "./ProductPreview";
import { products, type ProductId } from "./content";

const pageShell = "mx-auto w-[min(calc(100%_-_48px),1240px)] pb-[84px] max-[620px]:w-[min(calc(100%_-_28px),1240px)] max-[540px]:pb-[58px]";
const eyebrow = "mb-[19px] flex items-center gap-[9px] font-mono text-[.64rem] leading-[1.5] font-medium tracking-[.11em] text-[#a58acb] [&_.product-icon]:size-[19px]";
const h1 = "max-w-[620px] text-[clamp(2.1rem,3.7vw,3.05rem)] leading-[1.1] font-[520] tracking-[-.045em] text-balance text-[#efeff2] max-[820px]:max-w-[570px] max-[820px]:text-[clamp(2.2rem,5.5vw,2.8rem)] max-[540px]:text-[2.05rem]";
const h2 = "text-[clamp(1.55rem,2.4vw,2.05rem)] leading-[1.17] font-[520] tracking-[-.035em] text-balance text-[#efeff2]";
const h3 = "text-[.96rem] leading-[1.4] font-[520] tracking-[-.012em] text-[#efeff2]";
const lead = "mt-[23px] max-w-[600px] text-base leading-[1.75] text-[#9999a4] max-[540px]:text-[.92rem]";
const actions = "mt-[29px] flex flex-wrap items-center gap-x-6 gap-y-3";
const primaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[9px] bg-white px-[17px] py-2.5 text-[.84rem] font-semibold text-black transition-colors hover:bg-[#e8e8e8] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70";
const textLink = "inline-flex min-h-10 items-center gap-[9px] rounded-[5px] text-[.83rem] font-[520] text-[#c9bbdf] transition-colors duration-150 hover:text-[#f1eaff] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70 [&>svg]:shrink-0";
const tags = "mt-[30px] flex list-none flex-wrap gap-x-[18px] gap-y-2 p-0 [&>li]:inline-flex [&>li]:items-center [&>li]:gap-2 [&>li]:text-[.7rem] [&>li]:text-[#8e8e9a] [&>li]:before:size-[3px] [&>li]:before:rounded-full [&>li]:before:bg-[#8d70b4] [&>li]:before:content-['']";
const section = "border-t border-[var(--line)] py-[67px] max-[820px]:py-[49px]";
const sectionGrid = "grid grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)] gap-[clamp(40px,5vw,76px)] max-[1050px]:gap-[35px] max-[820px]:grid-cols-1";

function Arrow() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" /></svg>;
}

export function ProductPage({ product, hero, workflow, sections, className = "" }: { product: ProductId; hero?: ReactNode; workflow?: ReactNode; sections?: ReactNode; className?: string }) {
  const content = products[product];

  return (
    <article className={`${pageShell} ${className}`.trim()}>
      {hero ?? <section className="grid grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)] items-center gap-[clamp(40px,5vw,76px)] py-[76px_88px] max-[1050px]:gap-[35px] max-[820px]:grid-cols-1 max-[820px]:gap-[38px] max-[820px]:py-[49px_58px]" aria-labelledby="product-title">
        <div className="max-[820px]:max-w-[590px]">
          <p className={eyebrow}><ProductIcon product={product} />OUTRAY {content.name.toUpperCase()}</p>
          <h1 className={h1} id="product-title">{content.title}</h1>
          <p className={lead}>{content.description}</p>
          <div className={actions}><Link className={primaryButton} to="/signup" data-track="cta" data-track-label={`${product}-get-started`}>Get started<Arrow /></Link><Link className={textLink} to="/docs/$" params={{ _splat: product }} data-track="cta" data-track-label={`${product}-documentation`}>Read the docs<Arrow /></Link></div>
          <ul className={tags} aria-label={`${content.name} highlights`}>{content.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
        </div>
        <ProductPreview product={product} />
      </section>}

      {workflow ?? <section className={`${section} ${sectionGrid}`} aria-labelledby="workflow-title">
        <div>
          <p className={eyebrow}>THE WORKFLOW</p>
          <h2 className={h2} id="workflow-title">{content.workflow.title}</h2>
          <p className="mt-[17px] max-w-[510px] text-[.88rem] leading-[1.7] text-[#9797a2]">{content.workflow.description}</p>
          <ol className="mt-[31px] grid list-none gap-[26px] p-0">{content.workflow.steps.map((step, index) => <li className="flex items-start gap-4" key={step.title}><span className="grid size-[27px] shrink-0 place-items-center rounded-[7px] border border-[#36303e] font-mono text-[.58rem] text-[#b797da]" aria-hidden="true">0{index + 1}</span><div><h3 className={h3}>{step.title}</h3><p className="mt-2 text-[.83rem] leading-[1.75] text-[#9696a2]">{step.description}</p></div></li>)}</ol>
        </div>
        <div className="self-start overflow-hidden rounded-xl border border-[#2b2730] bg-[#0c0c0e]"><div className="flex justify-between gap-3 border-b border-[var(--line)] bg-[#111014] px-[21px] py-[15px] font-mono text-[.65rem] text-[#ada3ba]"><span>{content.workflow.label}</span><span aria-hidden="true">↗</span></div><pre className="m-0 overflow-x-auto px-[21px] py-[26px] font-mono text-[.72rem] leading-[1.9] text-[#c9bbdb] [tab-size:2] [&>code]:font-[inherit]" tabIndex={0} aria-label={`${content.name} getting started example`}><code>{content.workflow.code}</code></pre><p className="m-0 border-t border-[var(--line)] px-[21px] pt-[19px] text-[.74rem] leading-[1.75] text-[#9b94a4]">{content.workflow.note}</p><Link className={`${textLink} mx-[21px] mt-3 mb-4 text-[.76rem]`} to="/docs/$" params={{ _splat: product }}>Full setup guide<Arrow /></Link></div>
      </section>}

      {sections ?? <>
      <section className={section} aria-labelledby="capabilities-title">
        <div className="mb-[31px]"><p className={eyebrow}>BUILT IN</p><h2 className={h2} id="capabilities-title">The details that make it useful.</h2></div>
        <div className="grid grid-cols-2 gap-x-[46px] max-[540px]:grid-cols-1">{content.capabilities.map((capability, index) => <div className="border-t border-[var(--line)] py-[26px] max-[540px]:py-[23px]" key={capability.title}><span className="mb-3.5 block font-mono text-[.6rem] text-[#9584a9]" aria-hidden="true">0{index + 1}</span><h3 className={h3}>{capability.title}</h3><p className="mt-2 max-w-[480px] text-[.83rem] leading-[1.75] text-[#9696a2]">{capability.description}</p></div>)}</div>
      </section>

      <section className={`${section} ${sectionGrid}`} aria-labelledby="use-cases-title">
        <div><p className={eyebrow}>IN PRACTICE</p><h2 className={`${h2} max-w-80 max-[820px]:max-w-none`} id="use-cases-title">Where it fits in your day.</h2></div>
        <div>{content.useCases.map((useCase, index) => <div className={`border-t border-[var(--line)] py-[22px] ${index === 0 ? "border-t-0 pt-0" : ""}`} key={useCase.title}><h3 className={h3}>{useCase.title}</h3><p className="mt-2 text-[.83rem] leading-[1.75] text-[#9696a2]">{useCase.description}</p></div>)}</div>
      </section>

      <section className="flex items-center gap-[21px] rounded-xl border border-[#302836] bg-[#110e15] p-[29px] max-[1050px]:flex-wrap max-[540px]:gap-[15px] max-[540px]:p-5" aria-labelledby="connected-title"><span className="grid size-11 shrink-0 place-items-center rounded-[10px] border border-[#40304f] text-[#b79acf] max-[540px]:size-9"><ProductIcon product={content.next} /></span><div className="flex-1 max-[540px]:min-w-0"><p className={`${eyebrow} mb-2 text-[.57rem]`}>BETTER TOGETHER</p><h2 className="max-w-[650px] text-[1.05rem] leading-[1.55] font-[520] tracking-[-.015em] text-[#d2c9dd] max-[540px]:text-[.91rem]" id="connected-title">{content.connection}</h2></div><Link className={`${textLink} shrink-0 max-[1050px]:ml-[65px] max-[540px]:ml-[51px]`} to={`/products/${content.next}`}>Explore {products[content.next].name}<Arrow /></Link></section>
      <section className="flex items-center justify-between gap-[35px] pt-[69px] max-[1050px]:items-start max-[540px]:flex-col max-[540px]:gap-6 max-[540px]:pt-[49px]" aria-labelledby="start-title"><div><p className={`${eyebrow} mb-3`}>YOUR NEXT STEP</p><h2 className={`${h2} text-[1.65rem]`} id="start-title">Start with {content.name.toLowerCase()}.</h2><p className="mt-[11px] text-[.85rem] text-[#9494a0]">Create a workspace and connect your first service.</p></div><div className={`${actions} m-0 max-[1050px]:shrink-0 max-[1050px]:flex-col max-[1050px]:items-start max-[1050px]:gap-2 max-[540px]:flex-row max-[540px]:items-center max-[540px]:gap-5`}><Link className={primaryButton} to="/signup" data-track="cta" data-track-label={`${product}-bottom-get-started`}>Get started<Arrow /></Link><Link className={textLink} to="/docs/$" params={{ _splat: product }}>Documentation<Arrow /></Link></div></section>
      </>}
    </article>
  );
}
