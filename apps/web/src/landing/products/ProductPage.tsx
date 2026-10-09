import { ProductIcon } from "../ProductIcon";
import { ProductPreview } from "./ProductPreview";
import { productIds, products, type ProductId } from "./content";

function Arrow() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" /></svg>;
}

function ProductNav({ active }: { active?: ProductId }) {
  return (
    <nav className="pd-product-nav" aria-label="Product pages">
      <a href="/products" aria-current={active ? undefined : "page"}>All products</a>
      <span aria-hidden="true" />
      {productIds.map((id) => <a key={id} href={`/products/${id}`} aria-current={id === active ? "page" : undefined}><ProductIcon product={id} />{products[id].name}</a>)}
    </nav>
  );
}

export function ProductPage({ product }: { product: ProductId }) {
  const content = products[product];

  return (
    <article className="page-shell pd-page">
      <ProductNav active={product} />
      <section className="pd-hero" aria-labelledby="product-title">
        <div className="pd-hero-copy">
          <p className="pd-eyebrow"><ProductIcon product={product} />OUTRAY {content.name.toUpperCase()}</p>
          <h1 id="product-title">{content.title}</h1>
          <p className="pd-lead">{content.description}</p>
          <div className="pd-actions"><a className="button button-primary" href="/signup" data-track="cta" data-track-label={`${product}-get-started`}>Get started<Arrow /></a><a className="pd-text-link" href={`/docs/${product}`} data-track="cta" data-track-label={`${product}-documentation`}>Read the docs<Arrow /></a></div>
          <ul className="pd-tags" aria-label={`${content.name} highlights`}>{content.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
        </div>
        <ProductPreview product={product} />
      </section>

      <section className="pd-workflow pd-section" aria-labelledby="workflow-title">
        <div>
          <p className="pd-eyebrow">THE WORKFLOW</p>
          <h2 id="workflow-title">{content.workflow.title}</h2>
          <p className="pd-section-description">{content.workflow.description}</p>
          <ol className="pd-steps">{content.workflow.steps.map((step, index) => <li key={step.title}><span aria-hidden="true">0{index + 1}</span><div><h3>{step.title}</h3><p>{step.description}</p></div></li>)}</ol>
        </div>
        <div className="pd-code-panel"><div className="pd-code-heading"><span>{content.workflow.label}</span><span aria-hidden="true">↗</span></div><pre tabIndex={0} aria-label={`${content.name} getting started example`}><code>{content.workflow.code}</code></pre><p>{content.workflow.note}</p><a className="pd-text-link" href={`/docs/${product}`}>Full setup guide<Arrow /></a></div>
      </section>

      <section className="pd-section" aria-labelledby="capabilities-title">
        <div className="pd-section-heading"><p className="pd-eyebrow">BUILT IN</p><h2 id="capabilities-title">The details that make it useful.</h2></div>
        <div className="pd-capabilities">{content.capabilities.map((capability, index) => <div key={capability.title}><span className="pd-capability-number" aria-hidden="true">0{index + 1}</span><h3>{capability.title}</h3><p>{capability.description}</p></div>)}</div>
      </section>

      <section className="pd-section pd-use-cases" aria-labelledby="use-cases-title">
        <div><p className="pd-eyebrow">IN PRACTICE</p><h2 id="use-cases-title">Where it fits in your day.</h2></div>
        <div>{content.useCases.map((useCase) => <div className="pd-use-case" key={useCase.title}><h3>{useCase.title}</h3><p>{useCase.description}</p></div>)}</div>
      </section>

      <section className="pd-connected" aria-labelledby="connected-title"><span className="pd-connected-icon"><ProductIcon product={content.next} /></span><div><p className="pd-eyebrow">BETTER TOGETHER</p><h2 id="connected-title">{content.connection}</h2></div><a className="pd-text-link" href={`/products/${content.next}`}>Explore {products[content.next].name}<Arrow /></a></section>
      <section className="pd-bottom-cta" aria-labelledby="start-title"><div><p className="pd-eyebrow">YOUR NEXT STEP</p><h2 id="start-title">Start with {content.name.toLowerCase()}.</h2><p>Create a workspace and connect your first service.</p></div><div className="pd-actions"><a className="button button-primary" href="/signup" data-track="cta" data-track-label={`${product}-bottom-get-started`}>Get started<Arrow /></a><a className="pd-text-link" href={`/docs/${product}`}>Documentation<Arrow /></a></div></section>
    </article>
  );
}

export function ProductsIndex() {
  return (
    <div className="page-shell pd-page pd-index">
      <ProductNav />
      <section className="pd-index-hero" aria-labelledby="products-title"><p className="pd-eyebrow">THE OUTRAY TOOLKIT</p><h1 id="products-title">Four tools. One workspace.<br />Start where you need them.</h1><p className="pd-lead">Expose a local service, understand its requests, manage its configuration, and keep an eye on its public endpoint. Each product works on its own, with the same place to return to.</p><div className="pd-actions"><a className="button button-primary" href="/signup" data-track="cta" data-track-label="products-get-started">Get started<Arrow /></a><a className="pd-text-link" href="/docs">Browse the docs<Arrow /></a></div></section>
      <div className="pd-index-products">{productIds.map((id) => <section className="pd-index-product" key={id} aria-labelledby={`${id}-title`}><div className="pd-index-copy"><p className="pd-eyebrow">{products[id].number} / {products[id].name.toUpperCase()}</p><h2 id={`${id}-title`}>{products[id].summary}</h2><p>{products[id].description}</p><ul className="pd-tags" aria-label={`${products[id].name} highlights`}>{products[id].tags.map((tag) => <li key={tag}>{tag}</li>)}</ul><a className="pd-text-link" href={`/products/${id}`} data-track="navigation" data-track-label={`products-explore-${id}`}>Explore {products[id].name}<Arrow /></a></div><ProductPreview product={id} /></section>)}</div>
      <section className="pd-bottom-cta" aria-labelledby="start-title"><div><p className="pd-eyebrow">ONE PLACE TO START</p><h2 id="start-title">Make a little room in your toolkit.</h2><p>Create a workspace, then connect the product you need.</p></div><a className="button button-primary" href="/signup" data-track="cta" data-track-label="products-bottom-get-started">Get started<Arrow /></a></section>
    </div>
  );
}
