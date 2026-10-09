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
import styles from "@/components/docs/docs.module.css";

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
      <DocsPage toc={toc} className={styles.page}>
        <DocsTitle id="docs-content" tabIndex={-1} className={styles.title}>{frontmatter.title}</DocsTitle>
        <DocsDescription className={styles.description}>{frontmatter.description}</DocsDescription>
        <DocsBody className={styles.body}>
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
        title: <span className={styles.sidebarTitle}>Documentation</span>,
        url: "/docs",
        component: <DocsHeader />,
      }}
      containerProps={{
        className: styles.shell,
        style: {
          gridTemplate: '"header header header" auto "sidebar toc-popover toc" auto "sidebar main toc" 1fr / minmax(var(--fd-sidebar-col), 1fr) minmax(0, calc(var(--fd-layout-width, 90rem) - var(--fd-sidebar-width) - var(--fd-toc-width))) minmax(min-content, 1fr)',
        },
      }}
      searchToggle={{ enabled: false }}
      sidebar={{
        collapsible: false,
        tabs: false,
        defaultOpenLevel: 0,
        banner: <p className={styles.sidebarNote}>Your services, from local to live.</p>,
        footer: <a className={styles.sidebarFooter} href="/products">Explore the products <span aria-hidden="true">↗</span></a>,
      }}
    >
      {content}
    </DocsLayout>
  );
}
