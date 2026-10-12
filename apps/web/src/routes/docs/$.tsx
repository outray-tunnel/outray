import { createFileRoute, notFound } from "@tanstack/react-router";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { createServerFn } from "@tanstack/react-start";
import { source } from "@/lib/source";
import browserCollections from "fumadocs-mdx:collections/browser";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { baseOptions } from "@/lib/layout.shared";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { Mermaid } from "@/components/mdx/mermaid";
import { DocsHeader } from "@/components/docs/docs-header";

const docsShellClassName = "[--fd-layout-width:1440px] [--fd-header-height:64px] [--color-fd-background:#09090b] [--color-fd-card:#101012] [--color-fd-muted:#18181b] [--color-fd-muted-foreground:#9b9ba5] [--color-fd-border:#ffffff12] [--color-fd-accent:#ffffff0a] [--color-fd-accent-foreground:#f4f4f5] [--color-fd-primary:#b29adf] bg-[#09090b] font-sans [grid-template:\"header_header_header\"_auto_\"sidebar_toc-popover_toc\"_auto_\"sidebar_main_toc\"_1fr/minmax(var(--fd-sidebar-col),1fr)_minmax(0,calc(var(--fd-layout-width,90rem)-var(--fd-sidebar-width)-var(--fd-toc-width)))_minmax(min-content,1fr)] max-md:[--fd-header-height:56px] [&_[data-sidebar-placeholder]]:top-16 [&_[data-sidebar-placeholder]]:h-[calc(100dvh-64px)] [&_#nd-sidebar]:border-white/[.07] [&_#nd-sidebar]:bg-[#0c0c0e] [&_#nd-sidebar]:text-[13px] [&_#nd-sidebar]:[--color-fd-background:#09090b] [&_#nd-sidebar]:[--color-fd-muted:#18181b] [&_#nd-sidebar]:[--color-fd-secondary:#18181b] [&_#nd-sidebar]:[--color-fd-accent:#ffffff0a] [&_#nd-sidebar]:[--color-fd-muted-foreground:#9898a3] [&_#nd-sidebar]:[--color-fd-primary:#e4e4e7] [&_#nd-sidebar_a]:rounded-lg [&_#nd-sidebar_button]:rounded-lg [&_#nd-sidebar_[data-active=true]]:bg-white/[.04] [&_#nd-sidebar_[data-active=true]]:text-zinc-50 [&_#nd-sidebar_[data-active=true]::before]:hidden [&_#nd-sidebar_p]:text-[11px] [&_#nd-sidebar_p]:tracking-[.025em] [&_#nd-sidebar_p]:text-[#92929f] [&_#nd-toc]:top-16 [&_#nd-toc]:h-[calc(100dvh-64px)] [&_#nd-toc]:pt-12 [&_#nd-toc]:text-xs [&_#toc-title]:text-xs [&_#toc-title]:text-[#92929f] [&_#nd-toc_a]:leading-[1.65] [&_#nd-page_nav]:text-xs [&_#nd-page_footer_a]:rounded-[10px] [&_#nd-page_footer_a]:bg-[#111113] max-md:[&_#nd-toc-popover]:top-14";
const docsBodyClassName = "text-sm leading-[1.85] text-[#bbbbc5] [&_:is(h2,h3,h4)]:font-medium [&_:is(h2,h3,h4)]:tracking-[-.025em] [&_:is(h2,h3,h4)]:text-zinc-200 [&_:is(h2,h3,h4)]:scroll-mt-[calc(var(--fd-header-height)+56px)] [&_h2]:mt-11 [&_h2]:pt-0 [&_h2]:text-[21px] [&_h2]:leading-[1.35] [&_h3]:mt-[30px] [&_h3]:text-base [&_h3]:leading-normal [&_p]:my-4 [&_li]:my-1.5 [&_strong]:font-medium [&_strong]:text-zinc-200 [&_a:not([data-card]):not(.not-prose)]:text-[#c2afe9] [&_a:not([data-card]):not(.not-prose)]:decoration-[#8367c75c] [&_a:not([data-card]):not(.not-prose)]:underline-offset-4 [&_a:hover]:text-[#e3d8ff] [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-[#b29adf] [&_:is(code,pre)]:text-xs [&_figure.shiki]:rounded-xl [&_figure.shiki]:border-white/[.08] [&_figure.shiki]:bg-[#111113] [&_[data-card=true]]:rounded-xl [&_[data-card=true]]:border-white/[.08] [&_[data-card=true]]:bg-[#111113] [&_[data-card=true]]:shadow-none [&_[data-card=true]]:no-underline [&_[data-card=true]]:transition-[background,border-color] [&_[data-card=true]]:duration-150 [&_[data-card=true]:hover]:border-white/[.16] [&_[data-card=true]:hover]:bg-[#18181c] [&_[data-card=true]_h3]:mt-0 [&_[data-card=true]_h3]:mb-2 [&_[data-card=true]_h3]:text-[15px] [&_[data-card=true]_h3]:text-zinc-200 [&_[data-card=true]_p]:m-0 [&_[data-card=true]_p]:text-[13px] [&_[data-card=true]_p]:leading-[1.7] [&_[data-card=true]_p]:text-[#92929f] [&_[data-card=true]>div:last-child]:text-[13px] [&_[data-card=true]>div:last-child]:leading-[1.7] [&_[data-card=true]>div:last-child]:text-[#92929f] [&_table]:text-[13px] [&_th]:font-medium [&_th]:text-[#dedee5] [&_:is(td,th)]:border-white/[.063] [&_:is(td,th)]:px-3.5 [&_:is(td,th)]:py-3 [&_blockquote]:border-[#8367c76e] [&_blockquote]:font-normal [&_blockquote]:not-italic [&_blockquote]:text-zinc-400 motion-reduce:[&_[data-card=true]]:transition-none";

async function loadDocsPage({ params }: { params: { _splat?: string } }): Promise<Awaited<ReturnType<typeof serverLoader>>> {
  const slugs = params._splat?.split("/") ?? [];
  const data = await serverLoader({ data: slugs });
  await clientLoader.preload(data.path);
  return data;
}

export const Route = createFileRoute("/docs/$")({
  head: ({ loaderData, params }) => {
    const title = loaderData?.title ? `${loaderData.title} — OutRay Docs` : "Documentation — OutRay";
    const description = loaderData?.description ?? "Guides for OutRay Tunnels, Observability, Secrets, and Uptime.";
    const origin = import.meta.env.PUBLIC_SITE_URL?.trim();
    const path = `/docs${params._splat ? `/${params._splat.split("/").map(encodeURIComponent).join("/")}` : ""}`;
    const canonical = origin ? new URL(path, origin).toString() : undefined;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        ...(canonical ? [{ property: "og:url", content: canonical }] : []),
      ],
      links: [
        { rel: "preload", href: "/fonts/geom-latin.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
        ...(canonical ? [{ rel: "canonical", href: canonical }] : []),
      ],
    };
  },
  component: Page,
  loader: loadDocsPage,
});

const serverLoader = createServerFn({
  method: "GET",
})
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) throw notFound();

    return {
      path: page.path,
      title: page.data.title,
      description: page.data.description,
      pageTree: await source.serializePageTree(source.getPageTree()),
    };
  });

const clientLoader = browserCollections.docs.createClientLoader({
  component({ toc, frontmatter, default: MDX }) {
    return (
      <DocsPage toc={toc} className="gap-3.5 px-[clamp(22px,4vw,64px)] pt-12 pb-16 max-md:px-5 max-md:pt-7 max-md:pb-12">
        <DocsTitle id="docs-content" tabIndex={-1} className="scroll-mt-[calc(var(--fd-header-height)+56px)] text-[clamp(28px,3vw,36px)] leading-[1.2] font-normal tracking-[-.035em] text-zinc-100 focus:outline-none">{frontmatter.title}</DocsTitle>
        <DocsDescription className="mb-[18px] max-w-[65ch] text-[15px] leading-[1.7] text-[#92929f]">{frontmatter.description}</DocsDescription>
        <DocsBody className={docsBodyClassName}>
          <MDX
            components={{
              ...defaultMdxComponents,
              Mermaid,
            }}
          />
        </DocsBody>
      </DocsPage>
    );
  },
});

function Page() {
  const data = Route.useLoaderData();
  const { pageTree } = useFumadocsLoader(data);
  const content = clientLoader.useContent(data.path, {});
  if (!pageTree) throw notFound();

  return (
    <DocsLayout
      {...baseOptions()}
      tree={pageTree}
      nav={{
        title: <span className="text-[13px] font-normal text-zinc-200">Documentation</span>,
        url: "/docs",
        component: <DocsHeader />,
      }}
      containerProps={{
        className: docsShellClassName,
      }}
      searchToggle={{ enabled: false }}
      sidebar={{
        collapsible: false,
        tabs: false,
        defaultOpenLevel: 0,
        banner: <p className="mt-px mb-2 text-xs text-[#92929f]">Your services, from local to live.</p>,
        footer: <a className="block px-0 py-1 text-xs text-[#92929d] hover:text-zinc-200" href="/products">Explore the products <span aria-hidden="true">↗</span></a>,
      }}
    >
      {content}
    </DocsLayout>
  );
}
