import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import { compile } from "@mdx-js/mdx";
import { parse as parseYaml } from "yaml";
import { FrameworkProvider } from "fumadocs-core/framework";
import { RootProvider } from "fumadocs-ui/provider/base";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { DocsHeader } from "../src/components/docs/docs-header";
import { Hero } from "../src/landing/Hero";
import { FinalCta } from "../src/landing/FinalCta";

Object.assign(globalThis, { React });
const products = ["tunnels", "observability", "secrets", "uptime"];
const docsDirectory = new URL("../content/docs/", import.meta.url);

function renderLanding(component: React.ReactNode) {
  const root = createRootRoute();
  const signup = createRoute({ getParentRoute: () => root, path: "signup" });
  const router = createRouter({ routeTree: root.addChildren([signup]), history: createMemoryHistory({ initialEntries: ["/"] }), isServer: true });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: component }));
}

async function documents(directory: URL, segments: string[] = []): Promise<{ path: URL; url: string; content: string }[]> {
  const result: { path: URL; url: string; content: string }[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = new URL(entry.name, directory);
    if (entry.isDirectory()) {
      const visibleSegments = entry.name.startsWith("(") ? segments : [...segments, entry.name];
      result.push(...await documents(new URL(`${entry.name}/`, directory), visibleSegments));
    } else if (entry.name.endsWith(".mdx")) {
      const name = entry.name.replace(/\.mdx$/, "");
      const slug = name === "index" ? segments : [...segments, name];
      result.push({ path, url: `/docs${slug.length ? `/${slug.join("/")}` : ""}`, content: await readFile(path, "utf8") });
    }
  }
  return result;
}

test("hero has an SSR-safe decorative beam and its two primary destinations", () => {
  const html = renderLanding(React.createElement(Hero, { signupUrl: "/signup", githubUrl: "https://github.com/outray-tunnel/outray" }));
  assert.match(html, /aria-labelledby="hero-title"/);
  assert.match(html, /aria-hidden="true"><svg/);
  assert.match(html, /Everything between/);
  assert.doesNotMatch(html, /<canvas|Loading\.\.\./);
  assert.match(html, /href="\/signup"/);
  assert.match(html, /href="https:\/\/github\.com\/outray-tunnel\/outray"/);
  assert.equal((html.match(/<a /g) ?? []).length, 2);
  assert.doesNotMatch(html, /Explore OutRay products|href="\/products\//);
});

test("final CTA retains the requested simplified copy and two-line heading", () => {
  const html = renderLanding(React.createElement(FinalCta, { signupUrl: "/signup" }));
  assert.match(html, /<span>Everything behind your app\.<\/span> <span>Together in OutRay\.<\/span>/);
  assert.match(html, /href="\/signup"[^>]*>Get started<\/a>/);
  assert.equal((html.match(/<a /g) ?? []).length, 1);
  assert.doesNotMatch(html, /Start where your service is|Open a tunnel|View on GitHub/);
});

test("hero beam crossfades only opacity and disables transitions for reduced motion", async () => {
  const beam = await readFile(new URL("../src/landing/HeroBeam.tsx", import.meta.url), "utf8");
  const canvas = await readFile(new URL("../src/landing/HeroBeamCanvas.tsx", import.meta.url), "utf8");
  const fallback = await readFile(new URL("../src/landing/HeroAuroraFallback.tsx", import.meta.url), "utf8");
  assert.match(beam, /opacity-100 transition-opacity duration-500 group-data-\[ready=true\]\/beam:opacity-0 motion-reduce:transition-none/);
  assert.match(canvas, /opacity-0 transition-opacity duration-500 group-data-\[ready=true\]\/beam:opacity-100 motion-reduce:transition-none/);
  assert.match(fallback, /transition-opacity duration-500 group-data-\[ready=true\]\/beam:opacity-0 motion-reduce:transition-none/);
  assert.match(beam, /pointer-events-none/);
  assert.doesNotMatch(`${beam}\n${canvas}\n${fallback}`, /animate-\[(?:blur|width|height)/);
});

test("docs have unique public URLs and no broken internal documentation links", async () => {
  const pages = await documents(docsDirectory);
  const urls = new Set<string>();
  for (const page of pages) {
    assert.ok(!urls.has(page.url), `Duplicate documentation URL: ${page.url}`);
    urls.add(page.url);
    const frontmatter = page.content.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(frontmatter, `${fileURLToPath(page.path)} needs frontmatter`);
    const metadata = parseYaml(frontmatter[1]);
    assert.equal(typeof metadata.title, "string", `${page.url} needs a title`);
    assert.ok(metadata.title.trim(), `${page.url} needs a nonempty title`);
    assert.equal(typeof metadata.description, "string", `${page.url} needs a description`);
  }
  for (const product of products) assert.ok(urls.has(`/docs/${product}`), `${product} overview missing`);
  for (const page of pages) {
    for (const link of page.content.matchAll(/(?:href=["']|\]\()((?:\/docs)(?:\/[^\s"')#?]*)?)/g)) {
      const destination = link[1].replace(/\/$/, "");
      assert.ok(urls.has(destination), `${page.url} links to missing ${destination}`);
    }
  }
});

test("all documentation pages compile as MDX", async () => {
  for (const page of await documents(docsDirectory)) {
    const body = page.content.replace(/^---\n[\s\S]*?\n---\n/, "");
    await assert.doesNotReject(() => compile(body), `Invalid MDX: ${fileURLToPath(page.path)}`);
  }
});

test("docs keep keyboard search and mobile navigation in the new shell", async () => {
  const header = await readFile(new URL("../src/components/docs/docs-header.tsx", import.meta.url), "utf8");
  assert.match(header, /useSearchContext/);
  assert.match(header, /setOpenSearch\(true\)/);
  assert.match(header, /SidebarTrigger/);
  assert.match(header, /Skip to content/);
  assert.match(header, /href="#docs-content"/);
  const route = await readFile(new URL("../src/routes/docs/$.tsx", import.meta.url), "utf8");
  assert.match(route, /id="docs-content" tabIndex=\{-1\}/);
  assert.match(header, /\[&_:is\(a,button\):focus-visible\]:outline-2/);
  assert.match(header, /max-md:/);
  assert.match(route, /\[&_\[data-card=true\]\]/);
  assert.match(route, /motion-reduce:\[&_\[data-card=true\]\]:transition-none/);
  assert.doesNotMatch(`${header}\n${route}`, /docs\.module\.css/);
});

test("docs shell server-renders with real Fumadocs search and sidebar contexts", async () => {
  const stream = await renderToReadableStream(React.createElement(FrameworkProvider, {
    usePathname: () => "/docs/tunnels",
    useParams: () => ({}),
    useRouter: () => ({ push() {}, refresh() {} }),
    children: React.createElement(RootProvider, {
      theme: { enabled: false },
      children: React.createElement(DocsLayout, {
        tree: { name: "Documentation", children: [{ type: "page", name: "Tunnels", url: "/docs/tunnels" }] },
        nav: { component: React.createElement(DocsHeader) },
        searchToggle: { enabled: false },
        themeSwitch: { enabled: false },
        children: React.createElement(DocsPage, { toc: [], children: React.createElement(DocsTitle, { id: "docs-content", tabIndex: -1, children: "Tunnels" }) }),
      }),
    }),
  }));
  await stream.allReady;
  const html = await new Response(stream).text();
  assert.match(html, /aria-label="Search documentation"/);
  assert.match(html, /aria-label="Open documentation navigation"/);
  assert.match(html, /href="#docs-content"/);
  assert.match(html, /id="docs-content" tabindex="-1"/);
  assert.match(html, /href="\/docs\/tunnels"/);
});
