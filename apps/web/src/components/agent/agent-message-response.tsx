import { createContext, useContext, type ReactNode } from "react";
import { Streamdown, defaultRehypePlugins, defaultRemarkPlugins, defaultUrlTransform, type Components, type UrlTransform } from "streamdown";
import { safeAgentEvidenceHref } from "./agent-chat-data";
import styles from "./agent-message-response.module.css";

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
    : <span className={styles.inertLink}>{children as ReactNode}</span>;
}

function MarkdownCode({ children }: MarkdownRendererProps) {
  return <code>{children as ReactNode}</code>;
}

function MarkdownCodeBlock({ children }: MarkdownRendererProps) {
  return <pre tabIndex={0} aria-label="Code example">{children as ReactNode}</pre>;
}

function MarkdownTable({ children }: MarkdownRendererProps) {
  return <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Agent result table"><table>{children as ReactNode}</table></div>;
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
    <div className={styles.response} data-agent-message-response="" data-streaming={streaming ? "true" : "false"}>
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
