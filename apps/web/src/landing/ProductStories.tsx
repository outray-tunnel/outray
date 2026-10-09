import { ProductIcon } from "./ProductIcon";
import type { CSSProperties } from "react";

const tunnelFeatures = [
  "HTTP, TCP, and UDP forwarding",
  "Custom domains with managed TLS",
  "Request inspection when you need the full exchange",
  "One command from localhost to a public URL",
];

const observabilityFeatures = [
  "Correlated traces, logs, and metrics",
  "Server-side request and dependency spans",
  "Framework-aware route names",
  "Payload capture you explicitly control",
];

const secretFeatures = [
  "Vaults organized by environment",
  "Encrypted values and version history",
  "Audit records for sensitive actions",
  "Runtime injection through the OutRay CLI",
];

const uptimeFeatures = [
  "One-minute HTTP(S) checks",
  "Observed uptime, latency, and incident history",
  "Public status pages with grouped components",
  "Team alerts and team-published subscriber updates",
];

export function ProductStories({ docsUrl }: { docsUrl: string }) {
  return (
<section className="products product-showcase" aria-label="Explore OutRay products">
  <div className="page-shell product-switcher" data-product-tabs data-default-tab="tunnels" data-tab-group="showcase">
    <div className="product-switcher__frame" data-product-outline>
      <div className="product-switcher__pills" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <div className="product-switcher__tabs" role="tablist" aria-label="OutRay products">
      <button
        className="product-switcher__tab"
        type="button"
        id="showcase-tab-tunnels"
        role="tab"
        aria-selected="true"
        aria-controls="tunnels"
        tabIndex={0}
        data-product-tab="tunnels"
      >
        <ProductIcon product="tunnels" className="product-switcher__icon" />
        <span>Tunnels</span>
      </button>
      <button
        className="product-switcher__tab"
        type="button"
        id="showcase-tab-observability"
        role="tab"
        aria-selected="false"
        aria-controls="observability"
        tabIndex={-1}
        data-product-tab="observability"
      >
        <ProductIcon product="observability" className="product-switcher__icon" />
        <span>Observability</span>
      </button>
      <button
        className="product-switcher__tab"
        type="button"
        id="showcase-tab-secrets"
        role="tab"
        aria-selected="false"
        aria-controls="secrets"
        tabIndex={-1}
        data-product-tab="secrets"
      >
        <ProductIcon product="secrets" className="product-switcher__icon" />
        <span>Secrets</span>
      </button>
      <button
        className="product-switcher__tab"
        type="button"
        id="showcase-tab-uptime"
        role="tab"
        aria-selected="false"
        aria-controls="uptime"
        tabIndex={-1}
        data-product-tab="uptime"
      >
        <ProductIcon product="uptime" className="product-switcher__icon" />
        <span>Uptime</span>
      </button>
      </div>

      <div className="product-switcher__stage">
      <div className="product-switcher__panels">
    <article
      className="product-section product-switcher__panel"
      id="tunnels"
      role="tabpanel"
      aria-labelledby="showcase-tab-tunnels"
      data-product-panel="tunnels"
      data-product-section="tunnels"
      data-active="true"
    >
      <div className="product-copy">
        <p className="product-index">01 / Tunnels</p>
        <h2 className="product-title">Give localhost a real address.</h2>
        <p className="product-description">Put a local service online in seconds, keep a stable domain, and inspect the requests that cross the tunnel.</p>
        <div className="product-story-actions">
        <a className="inline-link product-link" href="/products/tunnels" data-track="cta" data-track-label="tunnels-explore">
          Explore Tunnels
          <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path></svg>
        </a>
        <a className="inline-link" href={`${docsUrl}/tunnels`} data-track="cta" data-track-label="tunnels-read-docs">Documentation</a>
        </div>
      </div>

      <div className="product-panel tunnel-panel" role="group" aria-label="Tunnel request interface">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="product-glyph"><ProductIcon product="tunnels" /></span>
            <span><small>Tunnel</small><strong>orders-api</strong></span>
          </div>
          <span className="status-pill"><i></i>Live</span>
        </div>
        <div className="tunnel-url">
          <span>https://orders.outray.app</span>
          <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M7 6V4.8C7 3.8 7.8 3 8.8 3h6.4c1 0 1.8.8 1.8 1.8v6.4c0 1-.8 1.8-1.8 1.8H14M4.8 7h6.4c1 0 1.8.8 1.8 1.8v6.4c0 1-.8 1.8-1.8 1.8H4.8c-1 0-1.8-.8-1.8-1.8V8.8C3 7.8 3.8 7 4.8 7Z" fill="none" stroke="currentColor" strokeWidth="1.4"></path></svg>
        </div>
        <div className="request-table" role="table" aria-label="Recent tunnel requests">
          <div className="request-row request-heading" role="row">
            <span role="columnheader">Method</span><span role="columnheader">Path</span><span role="columnheader">Status</span><span role="columnheader">Duration</span>
          </div>
          <div className="request-row" role="row">
            <span role="cell" className="method method-post">POST</span><span role="cell">/api/orders</span><span role="cell" className="status-code">201</span><span role="cell">124ms</span>
          </div>
          <div className="request-row" role="row">
            <span role="cell" className="method">GET</span><span role="cell">/api/orders/:id</span><span role="cell" className="status-code">200</span><span role="cell">48ms</span>
          </div>
          <div className="request-row" role="row">
            <span role="cell" className="method method-patch">PATCH</span><span role="cell">/api/orders/:id</span><span role="cell" className="status-code">200</span><span role="cell">82ms</span>
          </div>
        </div>
        <div className="panel-footer"><span>HTTP</span><span>localhost:3000</span><span>Request capture enabled</span></div>
      </div>
      <ul className="feature-list product-features" aria-label="Tunnel capabilities">
        {tunnelFeatures.map((feature) => (
          <li key={feature}><span aria-hidden="true"></span>{feature}</li>
        ))}
      </ul>
    </article>

    <article
      className="product-section product-switcher__panel"
      id="observability"
      role="tabpanel"
      aria-labelledby="showcase-tab-observability"
      data-product-panel="observability"
      data-product-section="observability"
      data-active="false"
    >
      <div className="product-copy">
        <p className="product-index">02 / Observability</p>
        <h2 className="product-title">Follow a request all the way through.</h2>
        <p className="product-description">See what your server did, where it spent time, and which log belongs to which request—without instrumenting every handler by hand.</p>
        <div className="product-story-actions">
        <a className="inline-link product-link" href="/products/observability" data-track="cta" data-track-label="observability-explore">
          Explore Observability
          <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path></svg>
        </a>
        <a className="inline-link" href={`${docsUrl}/observability`} data-track="cta" data-track-label="observability-read-docs">Documentation</a>
        </div>
      </div>

      <div className="product-panel trace-panel" role="group" aria-label="Distributed trace interface">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="product-glyph"><ProductIcon product="observability" /></span>
            <span><small>Trace details</small><strong>POST /api/orders</strong></span>
          </div>
          <span className="trace-duration">412ms</span>
        </div>
        <div className="trace-summary">
          <span><small>Status</small><strong className="ok-text"><i></i>OK</strong></span>
          <span><small>Service</small><strong>orders-api</strong></span>
          <span><small>Spans</small><strong>6</strong></span>
        </div>
        <div className="waterfall" role="list" aria-label="Trace span waterfall">
          <div className="span-row span-root" role="listitem"><span>POST /api/orders</span><i style={{ "--span-start": "0%", "--span-width": "100%" } as CSSProperties}></i><small>412ms</small></div>
          <div className="span-row" role="listitem"><span>auth middleware</span><i style={{ "--span-start": "2%", "--span-width": "19%" } as CSSProperties}></i><small>78ms</small></div>
          <div className="span-row" role="listitem"><span>db select user</span><i style={{ "--span-start": "6%", "--span-width": "12%" } as CSSProperties}></i><small>49ms</small></div>
          <div className="span-row" role="listitem"><span>validate order</span><i style={{ "--span-start": "23%", "--span-width": "8%" } as CSSProperties}></i><small>31ms</small></div>
          <div className="span-row" role="listitem"><span>db insert order</span><i style={{ "--span-start": "34%", "--span-width": "45%" } as CSSProperties}></i><small>185ms</small></div>
          <div className="span-row" role="listitem"><span>queue publish</span><i style={{ "--span-start": "81%", "--span-width": "15%" } as CSSProperties}></i><small>62ms</small></div>
        </div>
      </div>
      <ul className="feature-list product-features" aria-label="Observability capabilities">
        {observabilityFeatures.map((feature) => (
          <li key={feature}><span aria-hidden="true"></span>{feature}</li>
        ))}
      </ul>
    </article>

    <article
      className="product-section product-switcher__panel"
      id="secrets"
      role="tabpanel"
      aria-labelledby="showcase-tab-secrets"
      data-product-panel="secrets"
      data-product-section="secrets"
      data-active="false"
    >
      <div className="product-copy">
        <p className="product-index">03 / Secrets</p>
        <h2 className="product-title">Keep configuration out of the repo.</h2>
        <p className="product-description">Store encrypted values in a vault, organize them across environments, and inject them only when your process starts.</p>
        <div className="product-story-actions">
        <a className="inline-link product-link" href="/products/secrets" data-track="cta" data-track-label="secrets-explore">
          Explore Secrets
          <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path></svg>
        </a>
        <a className="inline-link" href={`${docsUrl}/secrets`} data-track="cta" data-track-label="secrets-read-docs">Documentation</a>
        </div>
      </div>

      <div className="product-panel secrets-panel" role="group" aria-label="Secrets vault interface">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="product-glyph"><ProductIcon product="secrets" /></span>
            <span><small>Vault</small><strong>orders-service</strong></span>
          </div>
          <span className="environment-pill">Production</span>
        </div>
        <div className="secret-heading"><span>Key</span><span>Value</span><span>Updated</span></div>
        <div className="secret-row"><span>DATABASE_URL</span><code>••••••••••••</code><small>just now</small></div>
        <div className="secret-row"><span>STRIPE_SECRET_KEY</span><code>••••••••••••</code><small>2m ago</small></div>
        <div className="secret-row"><span>REDIS_URL</span><code>••••••••••••</code><small>5m ago</small></div>
        <div className="secret-row"><span>WEBHOOK_SECRET</span><code>••••••••••••</code><small>1h ago</small></div>
        <div className="secret-sync"><i></i><span>Encrypted at rest · decrypted on explicit reveal or runtime delivery</span></div>
      </div>
      <ul className="feature-list product-features" aria-label="Secrets capabilities">
        {secretFeatures.map((feature) => (
          <li key={feature}><span aria-hidden="true"></span>{feature}</li>
        ))}
      </ul>
    </article>

    <article
      className="product-section product-switcher__panel"
      id="uptime"
      role="tabpanel"
      aria-labelledby="showcase-tab-uptime"
      data-product-panel="uptime"
      data-product-section="uptime"
      data-active="false"
    >
      <div className="product-copy">
        <p className="product-index">04 / Uptime</p>
        <h2 className="product-title">Know when a service goes down.</h2>
        <p className="product-description">Check your public endpoints, alert your team when they fail, and keep everyone informed on a status page you control.</p>
        <div className="product-story-actions">
        <a className="inline-link product-link" href="/products/uptime" data-track="cta" data-track-label="uptime-explore">
          Explore Uptime
          <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path></svg>
        </a>
        <a className="inline-link" href={`${docsUrl}/uptime`} data-track="cta" data-track-label="uptime-read-docs">Documentation</a>
        </div>
      </div>

      <div className="product-panel uptime-panel" role="group" aria-label="Uptime status page interface">
        <div className="panel-toolbar">
          <div className="panel-title">
            <span className="product-glyph"><ProductIcon product="uptime" /></span>
            <span><small>Status page</small><strong>Acme services</strong></span>
          </div>
          <span className="uptime-page-label">Public</span>
        </div>
        <div className="uptime-panel__body">
          <div className="uptime-panel__summary">
            <span className="uptime-panel__summary-icon" aria-hidden="true"><ProductIcon product="uptime" /></span>
            <span><strong>All systems operational</strong><small>Current status across visible services</small></span>
          </div>
          <div className="uptime-panel__group">
            <div className="uptime-panel__group-heading"><strong>Services</strong><span>2 components</span></div>
            <div className="uptime-panel__component"><span>API</span><span><i></i>Operational</span></div>
            <div className="uptime-panel__component"><span>Dashboard</span><span><i></i>Operational</span></div>
          </div>
          <div className="uptime-panel__history">
            <span>Incident history</span>
            <strong>No recent incidents</strong>
          </div>
        </div>
      </div>
      <ul className="feature-list product-features" aria-label="Uptime capabilities">
        {uptimeFeatures.map((feature) => (
          <li key={feature}><span aria-hidden="true"></span>{feature}</li>
        ))}
      </ul>
    </article>
      </div>
    </div>
      <svg className="product-switcher__outline" data-product-outline-svg aria-hidden="true" preserveAspectRatio="none">
        <path data-product-outline-path></path>
      </svg>
    </div>
  </div>
</section>
  );
}
