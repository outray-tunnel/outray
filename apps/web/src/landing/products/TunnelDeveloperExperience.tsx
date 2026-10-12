import { useId, useRef, useState, type KeyboardEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Activity03Icon from "@outray/icons/stroke/Activity03Icon";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import CodeIcon from "@outray/icons/stroke/CodeIcon";
import CommandLineIcon from "@outray/icons/stroke/CommandLineIcon";
import { SiExpress, SiNextdotjs, SiVite } from "react-icons/si";
import { CopyButton } from "../../components/arc/copy-button/copy-button";

const cardClass = "min-w-0 rounded-2xl border border-[#353535] bg-[#111] p-7 transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:border-[#4a4a4a] motion-reduce:transition-none max-[1050px]:p-[23px] max-[820px]:p-[27px] max-[540px]:rounded-xl max-[540px]:p-5";
const cardHeadingClass = "mb-[17px] flex items-center gap-3 [&>h3]:text-lg [&>h3]:font-medium [&>h3]:tracking-[-.025em] [&>h3]:text-[#f4f4f4] max-[540px]:[&>h3]:text-base";
const iconClass = "grid size-[35px] shrink-0 place-items-center rounded-[9px] border border-[#444] bg-[#1d1d1d] text-[#c084fc]";
const descriptionClass = "m-0 text-sm leading-[1.8] text-[#b0b0b4] max-[540px]:text-xs";
const smallLinkClass = "inline-flex min-h-[33px] shrink-0 items-center gap-[7px] rounded-sm text-[11px] text-[#c8c8c8] transition-colors duration-150 hover:text-[#f5f5f5] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#bdbdbd] motion-reduce:transition-none";
const copyButtonClass = "h-[34px] min-h-[34px] w-[34px] shrink-0 rounded-md p-0 text-[#aaa] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#bdbdbd]";

export const TUNNEL_PLUGINS = [
  {
    id: "vite",
    name: "Vite",
    file: "vite.config.ts",
    install: "npm install --save-dev @outray/vite",
    docs: "/docs/vite-plugin",
    icon: SiVite,
    code: 'import { defineConfig } from "vite";\nimport outray from "@outray/vite";\n\nexport default defineConfig({\n  plugins: [outray({\n    apiKey: process.env.OUTRAY_API_KEY,\n  })],\n});',
  },
  {
    id: "next",
    name: "Next.js",
    file: "next.config.ts",
    install: "npm install @outray/next",
    docs: "/docs/nextjs-plugin",
    icon: SiNextdotjs,
    code: 'import withOutray from "@outray/next";\n\nexport default withOutray(\n  {},\n  {\n    apiKey: process.env.OUTRAY_API_KEY,\n  },\n);',
  },
  {
    id: "express",
    name: "Express",
    file: "server.ts",
    install: "npm install @outray/express",
    docs: "/docs/express-plugin",
    icon: SiExpress,
    code: 'import express from "express";\nimport outray from "@outray/express";\n\nconst app = express();\noutray(app, {\n  apiKey: process.env.OUTRAY_API_KEY,\n});\napp.listen(3000);',
  },
] as const;

/** Automatic activation keeps the displayed code and the focused tab together. */
export function tunnelPluginIndexFromKey(current: number, key: string): number | null {
  if (key === "ArrowRight") return (current + 1) % TUNNEL_PLUGINS.length;
  if (key === "ArrowLeft") return (current + TUNNEL_PLUGINS.length - 1) % TUNNEL_PLUGINS.length;
  if (key === "Home") return 0;
  if (key === "End") return TUNNEL_PLUGINS.length - 1;
  return null;
}

type TunnelCodeToken = { text: string; kind: "plain" | "keyword" | "string" | "number" | "comment" };

/** Only decorates our short, fixed examples; source stays text, never HTML. */
export function tokenizeTunnelCode(source: string): TunnelCodeToken[] {
  const tokens: TunnelCodeToken[] = [];
  const pattern = /\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:import|from|export|default|const|let|await|async|function|return)\b|\b\d+(?:\.\d+)?\b/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const start = match.index;
    if (start > cursor) tokens.push({ text: source.slice(cursor, start), kind: "plain" });
    const text = match[0];
    const kind = text.startsWith("//") ? "comment" : text.startsWith('"') || text.startsWith("'") ? "string" : /^\d/.test(text) ? "number" : "keyword";
    tokens.push({ text, kind });
    cursor = start + text.length;
  }
  if (cursor < source.length) tokens.push({ text: source.slice(cursor), kind: "plain" });
  return tokens;
}

function HighlightedTunnelCode({ source }: { source: string }) {
  const tokenClass = { keyword: "text-[#c084fc]", string: "text-[#4ade80]", number: "text-[#60a5fa]", comment: "text-[#969696]" } as const;
  return <>{tokenizeTunnelCode(source).map((token, index) => token.kind === "plain" ? token.text : <span key={index} className={tokenClass[token.kind]}>{token.text}</span>)}</>;
}

const exampleRequests = [
  { method: "POST", path: "/webhooks/payment", status: "201 Created", duration: "58 ms", body: '{\n  "received": true,\n  "event": "payment.completed"\n}' },
  { method: "GET", path: "/api/orders", status: "200 OK", duration: "24 ms", body: '{\n  "orders": [],\n  "hasMore": false\n}' },
  { method: "PUT", path: "/api/account", status: "200 OK", duration: "41 ms", body: '{\n  "updated": true\n}' },
  { method: "GET", path: "/api/health", status: "503 Unavailable", duration: "12 ms", body: '{\n  "healthy": false,\n  "dependency": "database"\n}' },
] as const;

function PluginTabs() {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = tunnelPluginIndexFromKey(index, event.key);
    if (next === null) return;
    event.preventDefault();
    setSelected(next);
    buttons.current[next]?.focus();
  }

  return (
    <div className="mt-6 min-w-0">
      <div className="flex gap-1.5 pb-3 max-[540px]:gap-[3px]" role="tablist" aria-label="Tunnel framework integration">
        {TUNNEL_PLUGINS.map((plugin, index) => {
          const Icon = plugin.icon;
          return <button
            key={plugin.id}
            type="button"
            role="tab"
            id={`${id}-tab-${plugin.id}`}
            aria-controls={`${id}-panel-${plugin.id}`}
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            ref={(element) => { buttons.current[index] = element; }}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => handleKey(event, index)}
            className="inline-flex min-h-[37px] items-center justify-center gap-[7px] rounded-[7px] border border-transparent bg-transparent px-[11px] py-2 font-[inherit] text-xs text-[#969696] transition-[color,background] duration-150 hover:bg-[#292929] hover:text-[#f0f0f0] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#bdbdbd] aria-selected:border-[#484848] aria-selected:bg-[#2d2d2d] aria-selected:text-white aria-selected:shadow-[inset_0_-2px_0_#a855f7] motion-reduce:transition-none max-[540px]:min-h-10 max-[540px]:px-2.5 max-[540px]:text-[11px] [&>svg]:size-[15px] aria-selected:[&>svg]:text-[#c084fc] max-[540px]:[&>svg]:size-[13px]"
          ><Icon aria-hidden="true" focusable="false" />{plugin.name}</button>;
        })}
      </div>
      {TUNNEL_PLUGINS.map((plugin, index) => <div
        key={plugin.id}
        role="tabpanel"
        id={`${id}-panel-${plugin.id}`}
        aria-labelledby={`${id}-tab-${plugin.id}`}
        hidden={selected !== index}
      >
        <div className="overflow-hidden rounded-[9px] border border-[#363636] bg-[#090909]">
          <div className="flex min-h-[43px] items-center justify-between gap-3 border-b border-[#333] bg-[#191919] py-1 pr-[7px] pl-4">
            <span className="font-mono text-xs text-[#b7b7bc]">{plugin.file}</span>
            <CopyButton value={plugin.code} label={`Copy ${plugin.name} integration`} iconOnly variant="plain" className={copyButtonClass} />
          </div>
          <pre className="m-0 h-[211px] overflow-auto px-4 py-[18px] font-mono text-xs leading-[1.8] text-[#e5e5e8] [tab-size:2] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#bdbdbd] max-[540px]:px-[13px] max-[540px]:py-[15px] max-[540px]:text-[11px] [&>code]:font-[inherit]" tabIndex={0} aria-label={`${plugin.name} tunnel integration code`}><code><HighlightedTunnelCode source={plugin.code} /></code></pre>
        </div>
        <div className="flex min-h-[45px] items-center justify-between gap-2.5 pt-3 max-[1050px]:flex-wrap max-[1050px]:gap-x-3 max-[1050px]:gap-y-0.5 max-[540px]:gap-x-2.5 max-[540px]:gap-y-0.5">
          <code className="min-w-0 overflow-auto py-[3px] font-mono text-[10px] whitespace-nowrap text-[#aaa] max-[540px]:text-[9px]">{plugin.install}</code>
          <a className={smallLinkClass} href={plugin.docs}>Setup guide<HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" size={14} strokeWidth={1.7} /></a>
        </div>
      </div>)}
      <p className="mt-[5px] text-[10px] leading-[1.6] text-[#a3a3a3] max-[540px]:text-[9px]">Use a server-side token with tunnel access. Never expose it in client code.</p>
    </div>
  );
}

function RequestInspection() {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const request = exampleRequests[selected];

  return <article className={`${cardClass} flex flex-col`}>
    <div className={cardHeadingClass}>
      <span className={iconClass}><HugeiconsIcon icon={Activity03Icon} aria-hidden="true" size={19} strokeWidth={1.7} /></span>
      <h3>Inspect every request</h3>
    </div>
    <p className={descriptionClass}>Follow HTTP traffic through your tunnel. Enable request capture to look closer at headers and supported payloads.</p>
    <div className="mt-7 min-w-0 overflow-hidden rounded-[10px] border border-[#363636] bg-[#090909]">
      <div className="flex min-h-[45px] items-center justify-between gap-3 border-b border-[#333] bg-[#191919] px-[17px] text-[11px] text-[#e7e7e7] max-[540px]:gap-[7px] max-[540px]:px-3 [&>span:last-child]:font-mono [&>span:last-child]:text-[10px] [&>span:last-child]:text-[#aaa] max-[540px]:[&>span:last-child]:text-[9px]"><span>Requests</span><span>Example · capture enabled</span></div>
      <ul className="m-0 list-none p-0 [&>li+li]:border-t [&>li+li]:border-[#202020]" aria-label="Example tunnel requests">
        {exampleRequests.map((item, index) => <li key={item.path}>
          <button
            type="button"
            aria-pressed={selected === index}
            aria-controls={`${id}-request-detail`}
            aria-label={`Inspect ${item.method} ${item.path}, ${item.status}`}
            className="grid min-h-[50px] w-full grid-cols-[39px_minmax(0,1fr)_28px_43px] items-center gap-2.5 border-0 bg-transparent px-[17px] py-3 text-left font-mono text-[inherit] text-[#d1d1d1] transition-colors duration-150 hover:bg-[#222] focus-visible:relative focus-visible:z-[1] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#bdbdbd] aria-pressed:bg-[#282828] aria-pressed:shadow-[inset_2px_0_0_#a855f7] motion-reduce:transition-none max-[1050px]:grid-cols-[33px_minmax(0,1fr)_26px] max-[1050px]:gap-2 max-[1050px]:px-[13px] max-[820px]:grid-cols-[39px_minmax(0,1fr)_28px_43px] max-[820px]:gap-2.5 max-[820px]:px-[17px] max-[540px]:min-h-[46px] max-[540px]:grid-cols-[29px_minmax(0,1fr)_23px] max-[540px]:gap-1.5 max-[540px]:px-3 [&>code]:min-w-0 [&>code]:overflow-hidden [&>code]:text-ellipsis [&>code]:whitespace-nowrap [&>code]:font-[inherit] [&>code]:text-[11px] max-[540px]:[&>code]:text-[10px]"
            onClick={() => setSelected(index)}
          >
            <span className="text-[10px] text-[#b4b4b4] max-[540px]:text-[9px]">{item.method}</span>
            <code>{item.path}</code>
            <span className={`text-[11px] max-[540px]:text-[10px] ${item.status.startsWith("5") ? "text-[#fb7185]" : "text-[#4ade80]"}`} data-error={item.status.startsWith("5")}>{item.status.slice(0, 3)}</span>
            <span className="text-right text-[10px] text-[#aaa] tabular-nums max-[1050px]:hidden max-[820px]:block max-[540px]:hidden">{item.duration}</span>
          </button>
        </li>)}
      </ul>
      <div className="border-t border-[#353535] px-[17px] py-[22px] max-[540px]:px-3" id={`${id}-request-detail`} role="region" aria-label="Selected example request">
        <div className="grid gap-[11px]"><code className="[overflow-wrap:anywhere] font-mono text-xs text-[#f0f0f0]">{request.method} {request.path}</code><span className="text-[11px] text-[#aaa]">Response</span></div>
        <dl className="my-[22px_21px] grid grid-cols-2 gap-[18px] max-[820px]:grid-cols-[1fr_1fr_1.2fr] max-[540px]:grid-cols-2 [&>div:last-child]:col-span-full max-[820px]:[&>div:last-child]:col-auto max-[540px]:[&>div:last-child]:col-span-full [&_dt]:mb-[5px] [&_dt]:text-[10px] [&_dt]:text-[#aaa] [&_dd]:m-0 [&_dd]:font-mono [&_dd]:text-[11px] [&_dd]:text-[#bdbdbd]">
          <div><dt>Status</dt><dd className={request.status.startsWith("5") ? "text-[#fb7185]!" : undefined} data-error={request.status.startsWith("5")}>{request.status}</dd></div>
          <div><dt>Duration</dt><dd>{request.duration}</dd></div>
          <div><dt>Content type</dt><dd>application/json</dd></div>
        </dl>
        <pre className="m-0 h-[118px] overflow-auto rounded-[7px] border border-[#303030] bg-[#050505] p-4 font-mono text-xs leading-[1.8] text-[#e5e5e8] max-[540px]:px-3 max-[540px]:text-[11px] [&>code]:font-[inherit]"><code>{request.body}</code></pre>
      </div>
    </div>
    <span className="absolute size-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]" role="status">Showing example {request.method} {request.path}, {request.status}, {request.duration}.</span>
    <div className="mt-auto flex items-center justify-between gap-3 pt-6 max-[1050px]:flex-wrap max-[1050px]:gap-1.5 max-[820px]:flex-nowrap max-[540px]:flex-wrap max-[540px]:gap-1.5"><span className="text-[11px] text-[#a3a3a3]">See the request, not just the status.</span><a className={smallLinkClass} href="/docs/tunnels">Explore Tunnels<HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" size={14} strokeWidth={1.7} /></a></div>
  </article>;
}

export function TunnelDeveloperExperience() {
  return <section className="border-t border-[#222] py-[100px_112px] [--foreground:#efefef] [--surface-muted:#262626] [--text-secondary:#a3a3a3] max-[820px]:py-[72px_84px] max-[540px]:py-[56px_64px]" aria-labelledby="tunnel-developer-title">
    <div className="mb-[42px] max-w-[700px] max-[820px]:mb-[30px]">
      <h2 className="max-w-[620px] text-[clamp(31px,3.4vw,47px)] leading-[1.15] font-medium tracking-[-.045em] text-[#f7f7f7] max-[540px]:text-[29px]" id="tunnel-developer-title">First-class developer experience</h2>
      <p className="mt-5 text-base leading-[1.75] text-[#b0b0b4] max-[540px]:mt-[15px] max-[540px]:text-sm">Less setup. More building. OutRay fits right into the tools you already use.</p>
    </div>
    <div className="grid grid-cols-2 items-stretch gap-6 max-[1050px]:gap-[18px] max-[820px]:grid-cols-1">
      <div className="grid min-w-0 gap-6 max-[1050px]:gap-[18px]">
        <article className={cardClass}>
          <div className={cardHeadingClass}><span className={iconClass}><HugeiconsIcon icon={CommandLineIcon} aria-hidden="true" size={19} strokeWidth={1.7} /></span><h3>Online in one line</h3></div>
          <p className={descriptionClass}>Start your app. Point OutRay at its port. Get a public address without deploying a thing.</p>
          <div className="mt-6 flex min-h-[51px] items-center gap-[13px] rounded-[9px] border border-[#363636] bg-[#080808] py-1.5 pr-[7px] pl-[17px] max-[540px]:gap-2.5 max-[540px]:pl-[13px] [&>code]:min-w-0 [&>code]:flex-1 [&>code]:font-mono [&>code]:text-[13px] [&>code]:text-[#efefef] max-[540px]:[&>code]:text-xs [&>span]:font-mono [&>span]:text-[13px] [&>span]:text-[#c084fc]"><span aria-hidden="true">$</span><code>npx outray 3000</code><CopyButton value="npx outray 3000" label="Copy CLI quickstart" iconOnly variant="plain" className={copyButtonClass} /></div>
        </article>
        <article className={cardClass}>
          <div className={cardHeadingClass}><span className={iconClass}><HugeiconsIcon icon={CodeIcon} aria-hidden="true" size={19} strokeWidth={1.7} /></span><h3>Fits into your workflow</h3></div>
          <p className={descriptionClass}>Prefer your usual dev command? Let a framework plugin open the tunnel when your server starts.</p>
          <PluginTabs />
        </article>
      </div>
      <RequestInspection />
    </div>
  </section>;
}
