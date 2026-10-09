import { ProductIcon } from "../ProductIcon";
import { products, type ProductId } from "./content";

const traceSpans = [
  { name: "POST /api/orders", duration: "412 ms", left: "0%", width: "100%" },
  { name: "postgres · SELECT", duration: "84 ms", left: "8%", width: "20%" },
  { name: "payments · POST", duration: "226 ms", left: "32%", width: "55%" },
  { name: "redis · SET", duration: "12 ms", left: "88%", width: "5%" },
] as const;

function PreviewHeader({ product, title, detail }: { product: ProductId; title: string; detail: string }) {
  return (
    <div className="pd-preview-header">
      <span className="pd-preview-icon"><ProductIcon product={product} /></span>
      <span><strong>{title}</strong><small>{detail}</small></span>
      <span className="pd-example-label">Example</span>
    </div>
  );
}

export function ProductPreview({ product }: { product: ProductId }) {
  return (
    <figure className={`pd-preview pd-preview--${product}`} aria-label={`${products[product].name} example interface`}>
      {product === "tunnels" ? <TunnelPreview /> : null}
      {product === "observability" ? <ObservabilityPreview /> : null}
      {product === "secrets" ? <SecretsPreview /> : null}
      {product === "uptime" ? <UptimePreview /> : null}
      <figcaption>Illustrative interface · sample data</figcaption>
    </figure>
  );
}

function TunnelPreview() {
  return (
    <>
      <PreviewHeader product="tunnels" title="orders-api" detail="HTTP tunnel" />
      <div className="pd-tunnel-flow" aria-label="Public requests pass through OutRay to localhost port 3000">
        <span><small>Public URL</small><strong>orders.outray.app</strong></span>
        <span className="pd-flow-arrow" aria-hidden="true">→</span>
        <span className="pd-flow-mark"><img src="/brand/outray-mark.svg" width="26" height="26" alt="OutRay" /></span>
        <span className="pd-flow-arrow" aria-hidden="true">→</span>
        <span><small>Your machine</small><strong>localhost:3000</strong></span>
      </div>
      <div className="pd-terminal-line"><code><span>$</span> outray 3000 --subdomain orders</code><span className="pd-state">Connected</span></div>
      <div className="pd-table-scroll" role="region" aria-label="Example tunnel requests" tabIndex={0}>
        <table className="pd-preview-table">
          <caption className="sr-only">Example incoming HTTP requests</caption>
          <thead><tr><th scope="col">Method</th><th scope="col">Path</th><th scope="col">Status</th><th scope="col">Time</th></tr></thead>
          <tbody>
            <tr><td className="pd-purple">POST</td><td>/webhooks/payment</td><td className="pd-green">200</td><td>42 ms</td></tr>
            <tr><td>GET</td><td>/api/orders</td><td className="pd-green">200</td><td>68 ms</td></tr>
            <tr><td className="pd-purple">POST</td><td>/api/orders</td><td className="pd-green">201</td><td>124 ms</td></tr>
          </tbody>
        </table>
      </div>
      <div className="pd-preview-footnote"><span>HTTP forwarding</span><span>Requests arrive at your local server</span></div>
    </>
  );
}

function ObservabilityPreview() {
  return (
    <>
      <PreviewHeader product="observability" title="POST /api/orders" detail="orders-api · production" />
      <div className="pd-trace-summary"><span><small>Duration</small><strong>412 ms</strong></span><span><small>Status</small><strong className="pd-green">200 OK</strong></span><span><small>Spans</small><strong>4</strong></span></div>
      <div className="pd-waterfall" aria-label="Example trace: total 412 milliseconds, database 84 milliseconds, payments 226 milliseconds, Redis 12 milliseconds">
        <div className="pd-waterfall-axis" aria-hidden="true"><span>0</span><span>200 ms</span><span>412 ms</span></div>
        {traceSpans.map((span) => (
          <div className="pd-span" key={span.name}>
            <code>{span.name}</code>
            <span className="pd-span-track" aria-hidden="true"><i style={{ left: span.left, width: span.width }} /></span>
            <span>{span.duration}</span>
          </div>
        ))}
      </div>
      <div className="pd-related-log"><small>RELATED LOG</small><p><span className="pd-green">INFO</span> payment accepted <code>order_123</code></p><span>Attached to this request's trace context</span></div>
    </>
  );
}

function SecretsPreview() {
  return (
    <>
      <PreviewHeader product="secrets" title="orders / development" detail="Vault environment" />
      <div className="pd-vault-environments" aria-label="Example vault environments"><span className="pd-vault-selected">Development</span><span>Staging</span><span>Production</span></div>
      <div className="pd-table-scroll" role="region" aria-label="Example vault secrets" tabIndex={0}>
        <table className="pd-preview-table pd-secret-table">
          <caption className="sr-only">Example masked secrets and their versions</caption>
          <thead><tr><th scope="col">Key</th><th scope="col">Value</th><th scope="col">Version</th></tr></thead>
          <tbody>
            <tr><td>DATABASE_URL</td><td aria-label="Masked value">••••••••••••</td><td>v3</td></tr>
            <tr><td>PAYMENTS_API_KEY</td><td aria-label="Masked value">••••••••••••</td><td>v2</td></tr>
            <tr><td>OBSERVABILITY_TOKEN</td><td aria-label="Masked value">••••••••••••</td><td>v1</td></tr>
          </tbody>
        </table>
      </div>
      <div className="pd-secret-runtime"><span className="pd-preview-icon"><ProductIcon product="secrets" /></span><span><small>DELIVER TO THE PROCESS</small><code>outray secrets run -- npm run dev</code></span></div>
      <div className="pd-preview-footnote"><span>Encrypted at rest</span><span>Values masked until explicitly revealed</span></div>
    </>
  );
}

function UptimePreview() {
  return (
    <>
      <PreviewHeader product="uptime" title="Orders API" detail="GET · api.acme.com/health" />
      <div className="pd-monitor-status"><span className="pd-status-dot" aria-hidden="true" /><span><strong>Operational</strong><small>Last check returned 200 OK</small></span><span className="pd-check-interval">Every 60s</span></div>
      <div className="pd-trace-summary"><span><small>Observed uptime</small><strong>99.98%</strong></span><span><small>Response time</small><strong>142 ms</strong></span><span><small>Last checked</small><strong>23s ago</strong></span></div>
      <div className="pd-check-history"><div><span>Recent checks</span><span className="pd-green">Healthy</span></div><div className="pd-check-bars" aria-hidden="true">{Array.from({ length: 40 }, (_, index) => <i key={index} />)}</div><div><span>Earlier</span><span>Now</span></div></div>
      <div className="pd-status-page-preview"><span><small>PUBLIC STATUS PAGE</small><strong>Acme service status</strong></span><span className="pd-state">All systems operational</span></div>
    </>
  );
}
