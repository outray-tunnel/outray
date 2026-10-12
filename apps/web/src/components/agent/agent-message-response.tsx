import { createContext, useContext, type ReactNode } from "react";
import { Streamdown, defaultRehypePlugins, defaultRemarkPlugins, defaultUrlTransform, type Components, type UrlTransform } from "streamdown";
import { safeAgentEvidenceHref } from "./agent-chat-data";

const responseClassName = "min-w-0 text-[13px] leading-[1.8] text-zinc-300 [overflow-wrap:anywhere] [&_:is(p,ul,ol,blockquote,pre)]:my-3 [&_:is(h3,h4,h5,h6)]:mt-5 [&_:is(h3,h4,h5,h6)]:mb-2 [&_:is(h3,h4,h5,h6)]:text-[13px] [&_:is(h3,h4,h5,h6)]:leading-[1.55] [&_:is(h3,h4,h5,h6)]:font-semibold [&_:is(h3,h4,h5,h6)]:tracking-[-.012em] [&_:is(h3,h4,h5,h6)]:text-zinc-100 [&_h3]:text-sm [&_strong]:font-semibold [&_strong]:text-zinc-100 [&_em]:italic [&_del]:text-zinc-400 [&_:is(ul,ol)]:pl-[1.35rem] [&_ul]:list-disc [&_ol]:list-decimal [&_li]:my-[.3rem] [&_li]:pl-[.15rem] [&_li::marker]:text-zinc-500 [&_li_p]:my-[.35rem] [&_:is(ul,ol)_:is(ul,ol)]:my-[.4rem] [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-[.9rem] [&_blockquote]:text-zinc-400 [&_hr]:my-[1.1rem] [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-white/[.08] [&_a]:text-violet-300 [&_a]:underline [&_a]:decoration-violet-300/40 [&_a]:underline-offset-3 [&_a:hover]:text-violet-200 [&_a:hover]:decoration-current [&_:is(a,pre):focus-visible]:outline-2 [&_:is(a,pre):focus-visible]:outline-offset-3 [&_:is(a,pre):focus-visible]:outline-zinc-400 [&_code]:rounded [&_code]:border [&_code]:border-white/[.075] [&_code]:bg-white/[.045] [&_code]:px-[.3rem] [&_code]:py-[.1rem] [&_code]:font-mono [&_code]:text-[.88em] [&_code]:text-zinc-200 [&_code]:[overflow-wrap:anywhere] [&_pre]:max-h-[360px] [&_pre]:max-w-full [&_pre]:overflow-auto [&_pre]:overscroll-contain [&_pre]:rounded-[9px] [&_pre]:border [&_pre]:border-white/[.075] [&_pre]:bg-black/22 [&_pre]:px-[.9rem] [&_pre]:py-[.8rem] [&_pre]:leading-[1.65] [&_pre]:whitespace-pre max-[480px]:[&_pre]:p-[.7rem] [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[11px] [&_pre_code]:[overflow-wrap:normal] [&_table]:w-full [&_table]:min-w-[280px] [&_table]:border-collapse [&_table]:text-xs [&_table]:leading-[1.6] [&_:is(th,td)]:border-b [&_:is(th,td)]:border-white/[.065] [&_:is(th,td)]:px-[.8rem] [&_:is(th,td)]:py-[.6rem] [&_:is(th,td)]:text-left [&_:is(th,td)]:align-top max-[480px]:[&_:is(th,td)]:px-[.6rem] max-[480px]:[&_:is(th,td)]:py-2 [&_th]:bg-white/[.025] [&_th]:font-medium [&_th]:text-zinc-200 [&_tr:last-child_td]:border-b-0 [&>div>:first-child]:mt-0 [&>div>:last-child]:mb-0";

const WorkspaceScope = createContext("");
type MarkdownRendererProps = { children?: unknown; href?: unknown; node?: unknown };
type MarkdownNode = { type: string; children?: MarkdownNode[] };

function omitRawHtml() {
  const strip = (node: MarkdownNode) => {
    if (!node.children) return;
    node.children = node.children.filter((child) => child.type !== "html");
    node.children.forEach(strip);
  };
  return strip;
}

function WorkspaceMarkdownLink({ children, href }: MarkdownRendererProps) {
  const orgSlug = useContext(WorkspaceScope);
  const safeHref = safeAgentEvidenceHref(typeof href === "string" ? href : undefined, orgSlug);
  return safeHref
    ? <a href={safeHref}>{children as ReactNode}</a>
    : <span className="text-inherit">{children as ReactNode}</span>;
}

function MarkdownCode({ children }: MarkdownRendererProps) {
  return <code>{children as ReactNode}</code>;
}

function MarkdownCodeBlock({ children }: MarkdownRendererProps) {
  return <pre tabIndex={0} aria-label="Code example">{children as ReactNode}</pre>;
}

function MarkdownTable({ children }: MarkdownRendererProps) {
  return <div className="my-3 max-w-full overflow-x-auto overscroll-contain rounded-[9px] border border-white/[.075] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-zinc-400" tabIndex={0} role="region" aria-label="Agent result table"><table>{children as ReactNode}</table></div>;
}

function SuppressedMedia() { return null; }

// Hoisted renderer identities let settled blocks stay memoized while text streams.
// Native elements are styled locally, rather than relying on library-wide CSS.
const components: Components = {
  a: WorkspaceMarkdownLink,
  p: "p", h1: "h3", h2: "h3", h3: "h4", h4: "h4", h5: "h5", h6: "h6",
  strong: "strong", em: "em", del: "del", blockquote: "blockquote", br: "br", hr: "hr",
  ul: "ul", ol: "ol", li: "li", code: MarkdownCode, pre: MarkdownCodeBlock,
  table: MarkdownTable, thead: "thead", tbody: "tbody", tr: "tr", th: "th", td: "td",
  img: SuppressedMedia, iframe: SuppressedMedia, video: SuppressedMedia, audio: SuppressedMedia,
};
const allowedElements = ["a", "p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "del", "blockquote", "br", "hr", "ul", "ol", "li", "code", "pre", "table", "thead", "tbody", "tr", "th", "td"];
// Streamdown without rehype-raw turns HTML nodes into visible escaped text.
// Omit them in the parsed Markdown tree, before that compatibility transform.
const remarkPlugins = [defaultRemarkPlugins.gfm, omitRawHtml];
const rehypePlugins = [defaultRehypePlugins.sanitize, defaultRehypePlugins.harden];
const urlTransform: UrlTransform = (url, key, node) => key === "href" ? defaultUrlTransform(url, key, node) : undefined;

/** Streaming-safe Markdown only. Raw HTML, media, and external navigation stay inert. */
export function AgentMessageResponse({ text, orgSlug, streaming = false }: { text: string; orgSlug: string; streaming?: boolean }) {
  return <WorkspaceScope.Provider value={orgSlug}>
    <div className={responseClassName} data-agent-message-response="" data-streaming={streaming ? "true" : "false"}>
      <Streamdown
        mode={streaming ? "streaming" : "static"}
        parseIncompleteMarkdown={streaming}
        isAnimating={streaming}
        controls={false}
        skipHtml
        allowedElements={allowedElements}
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={urlTransform}
      >{text}</Streamdown>
    </div>
  </WorkspaceScope.Provider>;
}
