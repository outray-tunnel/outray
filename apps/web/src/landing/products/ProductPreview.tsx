import { ProductIcon } from "../ProductIcon";
import { products, type ProductId } from "./content";

const previewIcon = "grid size-8 shrink-0 place-items-center rounded-lg border border-[#35303e] bg-[#1c1724] text-[#b495d9] [&_.product-icon]:size-[19px]";
const table = "w-full border-collapse text-left font-mono text-[.61rem] whitespace-nowrap [&_th]:h-11 [&_th]:border-b [&_th]:border-[var(--line)] [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-[.58rem] [&_th]:font-normal [&_th]:text-[#8a8a97] [&_td]:h-11 [&_td]:border-b [&_td]:border-[var(--line)] [&_td]:px-3 [&_td]:py-2.5 [&_td]:font-normal [&_td]:text-[#bdbdc8] [&_th:first-child]:pl-5 [&_td:first-child]:pl-5 [&_th:last-child]:pr-5 [&_th:last-child]:text-right [&_td:last-child]:pr-5 [&_td:last-child]:text-right";
const footnote = "flex flex-wrap justify-between gap-2 px-5 py-[13px] text-[.58rem] text-[#8a8a97] max-[540px]:px-[15px]";
const traceSummary = "grid grid-cols-3 border-b border-[var(--line)] [&>span]:grid [&>span]:gap-[7px] [&>span]:px-5 [&>span]:py-[17px] max-[540px]:[&>span]:px-[11px] max-[540px]:[&>span]:py-[15px] [&>span+span]:border-l [&>span+span]:border-[var(--line)] [&_small]:text-[.6rem] [&_small]:text-[#93939f] max-[540px]:[&_small]:text-[.55rem] [&_strong]:font-mono [&_strong]:text-[.73rem] [&_strong]:font-normal [&_strong]:text-[#d7d7df] max-[540px]:[&_strong]:text-[.68rem]";

const traceSpans = [
  { name: "POST /api/orders", duration: "412 ms", left: "0%", width: "100%" },
  { name: "postgres · SELECT", duration: "84 ms", left: "8%", width: "20%" },
  { name: "payments · POST", duration: "226 ms", left: "32%", width: "55%" },
  { name: "redis · SET", duration: "12 ms", left: "88%", width: "5%" },
] as const;

function PreviewHeader({ product, title, detail }: { product: ProductId; title: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--line)] bg-[#101013] px-5 py-[18px] max-[540px]:px-[15px]">
      <span className={previewIcon}><ProductIcon product={product} /></span>
      <span className="grid min-w-0 gap-[3px]"><strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[.8rem] font-[520] text-[#e0e0e7]">{title}</strong><small className="text-[.64rem] text-[#8f8f9c]">{detail}</small></span>
      <span className="ml-auto font-mono text-[.58rem] text-[#898995]">Example</span>
    </div>
  );
}

export function ProductPreview({ product }: { product: ProductId }) {
  return (
    <figure className="m-0 min-w-0 overflow-hidden rounded-[15px] border border-[#28282e] bg-[#0c0c0f] shadow-[0_16px_60px_rgb(0_0_0/.22)] max-[820px]:w-full max-[820px]:max-w-[650px]" aria-label={`${products[product].name} example interface`}>
      {product === "tunnels" ? <TunnelPreview /> : null}
      {product === "observability" ? <ObservabilityPreview /> : null}
      {product === "secrets" ? <SecretsPreview /> : null}
      {product === "uptime" ? <UptimePreview /> : null}
      <figcaption className="border-t border-[var(--line)] px-5 py-[11px] text-[.61rem] text-[#878792]">Illustrative interface · sample data</figcaption>
    </figure>
  );
}

function TunnelPreview() {
  return (
    <>
      <PreviewHeader product="tunnels" title="orders-api" detail="HTTP tunnel" />
      <div className="grid grid-cols-[minmax(0,1fr)_16px_40px_16px_minmax(0,1fr)] items-center gap-2 px-5 py-[30px] max-[540px]:gap-1.5 max-[540px]:px-[15px] max-[540px]:py-[25px] [&>span:first-child]:grid [&>span:first-child]:gap-[9px] [&>span:last-child]:grid [&>span:last-child]:gap-[9px] [&_small]:text-[.61rem] [&_small]:text-[#9696a2] [&_strong]:[overflow-wrap:anywhere] [&_strong]:font-mono [&_strong]:text-[.65rem] [&_strong]:font-normal [&_strong]:text-[#d4d4dc] max-[540px]:[&_strong]:text-[.58rem]" aria-label="Public requests pass through OutRay to localhost port 3000">
        <span><small>Public URL</small><strong>orders.outray.app</strong></span>
        <span className="text-[.9rem] text-[#80669f]" aria-hidden="true">→</span>
        <span className="grid size-10 place-items-center rounded-[10px] border border-[#4b365f] bg-[#21162e]"><img src="/brand/outray-mark.svg" width="26" height="26" alt="OutRay" /></span>
        <span className="text-[.9rem] text-[#80669f]" aria-hidden="true">→</span>
        <span><small>Your machine</small><strong>localhost:3000</strong></span>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 border-y border-[var(--line)] bg-[#101014] px-5 py-[13px] max-[540px]:px-[15px] [&>code]:min-w-0 [&>code]:[overflow-wrap:anywhere] [&>code]:font-mono [&>code]:text-[.63rem] [&>code]:text-[#bfbfc9] [&>code>span]:text-[#a485c7]"><code><span>$</span> outray 3000 --subdomain orders</code><span className="ml-auto font-mono text-[.6rem] text-[#78c8a3]">Connected</span></div>
      <div className="overflow-x-auto" role="region" aria-label="Example tunnel requests" tabIndex={0}>
        <table className={table}>
          <caption className="sr-only">Example incoming HTTP requests</caption>
          <thead><tr><th scope="col">Method</th><th scope="col">Path</th><th scope="col">Status</th><th scope="col">Time</th></tr></thead>
          <tbody>
            <tr><td className="text-[#bda2df]!">POST</td><td>/webhooks/payment</td><td className="text-[#7ac6a5]!">200</td><td>42 ms</td></tr>
            <tr><td>GET</td><td>/api/orders</td><td className="text-[#7ac6a5]!">200</td><td>68 ms</td></tr>
            <tr><td className="text-[#bda2df]!">POST</td><td>/api/orders</td><td className="text-[#7ac6a5]!">201</td><td>124 ms</td></tr>
          </tbody>
        </table>
      </div>
      <div className={footnote}><span>HTTP forwarding</span><span>Requests arrive at your local server</span></div>
    </>
  );
}

function ObservabilityPreview() {
  return (
    <>
      <PreviewHeader product="observability" title="POST /api/orders" detail="orders-api · production" />
      <div className={traceSummary}><span><small>Duration</small><strong>412 ms</strong></span><span><small>Status</small><strong className="text-[#7ac6a5]!">200 OK</strong></span><span><small>Spans</small><strong>4</strong></span></div>
      <div className="px-5 pt-[17px] pb-[21px] max-[540px]:px-[15px]" aria-label="Example trace: total 412 milliseconds, database 84 milliseconds, payments 226 milliseconds, Redis 12 milliseconds">
        <div className="mr-[52px] mb-[13px] ml-[41%] flex justify-between font-mono text-[.53rem] text-[#868693]" aria-hidden="true"><span>0</span><span>200 ms</span><span>412 ms</span></div>
        {traceSpans.map((span, index) => (
          <div className="grid min-h-[38px] grid-cols-[minmax(0,1.15fr)_minmax(0,1.55fr)_45px] items-center gap-2.5 font-mono text-[.59rem]" key={span.name}>
            <code className="min-w-0 [overflow-wrap:anywhere] font-[inherit] text-[#bbb8c7]">{span.name}</code>
            <span className="relative h-3.5 rounded-[3px] bg-[#19171d]" aria-hidden="true"><i className={`absolute inset-y-0.5 min-w-[3px] rounded-sm ${index === 0 ? "bg-[#b093cf]" : "bg-[#8b6ab2]"}`} style={{ left: span.left, width: span.width }} /></span>
            <span className="text-right text-[#9692a0]">{span.duration}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--line)] bg-[#101013] px-5 py-[17px] max-[540px]:px-[15px]"><small className="font-mono text-[.54rem] tracking-[.07em] text-[#a091b2]">RELATED LOG</small><p className="my-[10px_4px] font-mono text-[.63rem] text-[#cbcad2]"><span className="mr-[9px] text-[#7ac6a5]">INFO</span> payment accepted <code className="ml-[5px] font-[inherit] text-[#a38bbf]">order_123</code></p><span className="text-[.6rem] text-[#93909c]">Attached to this request&apos;s trace context</span></div>
    </>
  );
}

function SecretsPreview() {
  return (
    <>
      <PreviewHeader product="secrets" title="orders / development" detail="Vault environment" />
      <div className="flex gap-[19px] border-b border-[var(--line)] px-5 py-[17px] text-[.66rem] text-[#898594] max-[540px]:px-[15px]" aria-label="Example vault environments"><span className="text-[#c7aedf]">Development</span><span>Staging</span><span>Production</span></div>
      <div className="overflow-x-auto" role="region" aria-label="Example vault secrets" tabIndex={0}>
        <table className={`${table} [&_td]:h-[52px] [&_td:nth-child(2)]:tracking-[.12em] [&_td:nth-child(2)]:text-[#9f95aa]`}>
          <caption className="sr-only">Example masked secrets and their versions</caption>
          <thead><tr><th scope="col">Key</th><th scope="col">Value</th><th scope="col">Version</th></tr></thead>
          <tbody>
            <tr><td>DATABASE_URL</td><td aria-label="Masked value">••••••••••••</td><td>v3</td></tr>
            <tr><td>PAYMENTS_API_KEY</td><td aria-label="Masked value">••••••••••••</td><td>v2</td></tr>
            <tr><td>OBSERVABILITY_TOKEN</td><td aria-label="Masked value">••••••••••••</td><td>v1</td></tr>
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 border-b border-[var(--line)] p-5 max-[540px]:px-[15px]"><span className={previewIcon}><ProductIcon product="secrets" /></span><span className="grid min-w-0 gap-[9px]"><small className="font-mono text-[.54rem] tracking-[.07em] text-[#a091b2]">DELIVER TO THE PROCESS</small><code className="[overflow-wrap:anywhere] font-mono text-[.65rem] text-[#c9bfd5]">outray secrets run -- npm run dev</code></span></div>
      <div className={footnote}><span>Encrypted at rest</span><span>Values masked until explicitly revealed</span></div>
    </>
  );
}

function UptimePreview() {
  return (
    <>
      <PreviewHeader product="uptime" title="Orders API" detail="GET · api.acme.com/health" />
      <div className="flex items-center gap-[11px] border-b border-[var(--line)] px-5 py-[22px] max-[540px]:px-[15px]"><span className="size-[7px] shrink-0 rounded-full bg-[#7ac6a5] shadow-[0_0_0_5px_rgb(122_198_165/.09)]" aria-hidden="true" /><span className="grid gap-1"><strong className="text-[.87rem] font-medium text-[#bce9d3]">Operational</strong><small className="text-[.61rem] text-[#8e9f95]">Last check returned 200 OK</small></span><span className="ml-auto font-mono text-[.61rem] text-[#8e9f95]">Every 60s</span></div>
      <div className={traceSummary}><span><small>Observed uptime</small><strong>99.98%</strong></span><span><small>Response time</small><strong>142 ms</strong></span><span><small>Last checked</small><strong>23s ago</strong></span></div>
      <div className="px-5 py-[22px] max-[540px]:px-[15px] [&>div:not([aria-hidden])]:flex [&>div:not([aria-hidden])]:justify-between [&>div:not([aria-hidden])]:text-[.6rem] [&>div:not([aria-hidden])]:text-[#91919e]"><div><span>Recent checks</span><span className="text-[#7ac6a5]">Healthy</span></div><div className="my-[12px_9px] flex gap-1 max-[540px]:gap-[3px] [&>i]:h-[30px] [&>i]:flex-1 [&>i]:rounded-sm [&>i]:bg-[#355344]" aria-hidden="true">{Array.from({ length: 40 }, (_, index) => <i key={index} />)}</div><div><span>Earlier</span><span>Now</span></div></div>
      <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-[var(--line)] bg-[#101013] px-5 py-[18px] max-[540px]:px-[15px]"><span className="grid gap-2"><small className="font-mono text-[.54rem] tracking-[.07em] text-[#a091b2]">PUBLIC STATUS PAGE</small><strong className="text-[.73rem] font-normal text-[#d0ccd7]">Acme service status</strong></span><span className="font-mono text-[.6rem] text-[#78c8a3]">All systems operational</span></div>
    </>
  );
}
