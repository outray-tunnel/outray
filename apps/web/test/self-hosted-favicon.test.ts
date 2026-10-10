import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as routerRuntime from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import ts from "typescript";

const { createMemoryHistory, createRoute, createRouter, HeadContent, RouterContextProvider } = routerRuntime;
const goldIcon = "/favicon-self-hosted.svg?v=metal-1";

/** Real route head callbacks and router aggregation, without importing pools,
 * authentication, analytics, or the unrelated page/component dependency tree. */
async function loadRoute(file: string, selfHosted: boolean, configError?: Error): Promise<AnyRoute> {
  const source = await readFile(new URL(`../src/routes/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source.replaceAll("import.meta.env", "importMetaEnv"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} as { Route: AnyRoute } };
  const passThrough = ({ children }: { children: React.ReactNode }) => children;
  runInNewContext(compiled, {
    module, exports: module.exports, URL,
    importMetaEnv: { PUBLIC_SITE_URL: "https://hosted.example.test" },
    require: (specifier: string) => {
      if (specifier === "react") return React;
      if (specifier === "react/jsx-runtime") return jsxRuntime;
      if (specifier === "@tanstack/react-router") return {
        ...routerRuntime, createFileRoute: () => (options: unknown) => ({ options }),
      };
      if (specifier === "@/lib/instance") return {
        getPublicInstanceConfig: async () => {
          if (configError) throw configError;
          return { selfHosted };
        },
      };
      if (specifier === "@/lib/instance-context") return { InstanceContext: React.createContext(null) };
      if (specifier === "@/lib/auth-client") return { authClient: {} };
      if (specifier === "@/lib/query-client") return {};
      if (specifier === "@tanstack/react-query") return { QueryClientProvider: passThrough };
      if (specifier === "fumadocs-ui/provider/tanstack") return { RootProvider: passThrough };
      if (specifier === "posthog-js/react") return { PostHogProvider: passThrough };
      if (specifier === "@/landing/LandingPage") return { LandingPage: passThrough };
      if (specifier === "@/landing/products/ProductLayout") return { ProductLayout: passThrough };
      if (specifier === "@/lib/self-hosted-home") return {
        getSelfHostedHomeDestination: async () => "/login",
      };
      if (specifier === "../index.css?url") return "/app.css";
      if (specifier === "@/landing/landing.css?url") return "/landing.css";
      if (specifier === "@/landing/products/products.css?url") return "/products.css";
      throw new Error(`Unexpected favicon fixture dependency: ${specifier}`);
    },
  }, { filename: file });
  return module.exports.Route;
}

async function renderHead(selfHosted: boolean, pathname: string, configError?: Error) {
  const root = await loadRoute("__root.tsx", selfHosted, configError);
  const home = await loadRoute("index.tsx", selfHosted);
  const products = await loadRoute("products.tsx", selfHosted);
  const children = [
    createRoute({ ...home.options, getParentRoute: () => root, path: "/" }),
    createRoute({ getParentRoute: () => root, path: "login", head: () => ({ meta: [{ title: "Sign in — OutRay" }] }) }),
    createRoute({ getParentRoute: () => root, path: "acme/tunnel", head: () => ({ meta: [{ title: "Overview — OutRay" }] }) }),
    createRoute({ ...products.options, getParentRoute: () => root, path: "products" }),
  ];
  const router = createRouter({
    routeTree: root.addChildren(children), isServer: true,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  await router.load();
  assert.equal(router.state.redirect, undefined);
  assert.equal(router.state.matches.length, 2, "root and child are both loaded");
  if (!configError) for (const match of router.state.matches) assert.equal(match.status, "success");
  const html = renderToStaticMarkup(React.createElement(RouterContextProvider, {
    router, children: React.createElement(HeadContent),
  }));
  return { html, matches: router.state.matches };
}

function icons(html: string) {
  return html.match(/<link\b[^>]*\brel="icon"[^>]*>/g) ?? [];
}

for (const pathname of ["/login", "/acme/tunnel", "/products"]) {
  test(`self-hosted ${pathname} renders exactly one metallic gold favicon`, async () => {
    const { html } = await renderHead(true, pathname);
    assert.equal(icons(html).length, 1);
    assert.ok(icons(html)[0].includes(`href="${goldIcon}"`));
    assert.match(icons(html)[0], /type="image\/svg\+xml"/);
    assert.doesNotMatch(html, /href="\/favicon\.svg"/);
    assert.match(html, /href="\/app\.css"/);
    assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
    assert.match(html, /<meta charSet="utf-8"\/>/i);
    if (pathname === "/products") {
      assert.match(html, /href="\/landing\.css"/);
      assert.match(html, /href="\/products\.css"/);
      assert.match(html, /name="theme-color" content="#050505"/);
    } else {
      assert.match(html, new RegExp(`<title>${pathname === "/login" ? "Sign in" : "Overview"} — OutRay</title>`));
    }
  });
}

test("hosted console root keeps its implicit existing favicon and metadata", async () => {
  const { html, matches } = await renderHead(false, "/login");
  assert.equal(icons(html).length, 0, "do not replace the console's implicit favicon.ico");
  assert.equal((matches[0].links ?? []).filter((link) => link?.rel === "icon").length, 0);
  assert.doesNotMatch(html, /favicon-self-hosted/);
  assert.match(html, /href="\/app\.css"/);
  assert.match(html, /property="og:image" content="https:\/\/outray\.dev\/og\.png"/);
  assert.match(html, /<title>Sign in — OutRay<\/title>/);
});

for (const pathname of ["/", "/products"]) {
  test(`hosted ${pathname} keeps its original SVG favicon and page head`, async () => {
    const { html } = await renderHead(false, pathname);
    assert.equal(icons(html).length, 1);
    assert.match(icons(html)[0], /href="\/favicon\.svg"/);
    assert.doesNotMatch(html, /favicon-self-hosted/);
    assert.match(html, /href="\/app\.css"/);
    assert.match(html, /href="\/landing\.css"/);
    assert.match(html, /href="\/fonts\/geom-latin\.woff2"/);
    assert.match(html, /name="theme-color" content="#050505"/);
    if (pathname === "/") {
      assert.match(html, /rel="manifest" href="\/site\.webmanifest"/);
      assert.match(html, /rel="canonical" href="https:\/\/hosted\.example\.test\/"/);
      assert.match(html, /<title>OutRay — Everything between localhost and production\.<\/title>/);
    } else assert.match(html, /href="\/products\.css"/);
  });
}

test("a failed instance-config lookup does not remove root metadata/styles or cause secondary head errors", async (t) => {
  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  t.after(() => { console.error = originalError; });
  for (const pathname of ["/login", "/", "/products"]) {
    const { html, matches } = await renderHead(true, pathname, new Error("Instance config unavailable"));
    assert.equal(matches[0].status, "error");
    assert.match(html, /href="\/app\.css"/);
    assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
    assert.doesNotMatch(html, /favicon-self-hosted/);
    assert.ok(icons(html).length <= 1, "an error page must not gain duplicate icons");
    if (pathname !== "/login") assert.match(html, /href="\/landing\.css"/);
  }
  assert.deepEqual(errors, [], "head callbacks should not mask the original config failure with another error");
});

test("metallic favicon preserves the original transparent OutRay geometry and only internal SVG references", async () => {
  const icon = await readFile(new URL("../public/favicon-self-hosted.svg", import.meta.url), "utf8");
  const original = await readFile(new URL("../src/assets/logo_light.svg", import.meta.url), "utf8");
  assert.equal(icon.match(/<path\b[^>]*\bd="([^"]+)"/)?.[1], original.match(/<path\b[^>]*\bd="([^"]+)"/)?.[1]);
  assert.match(icon, /viewBox="0 0 170 170" fill="none"/);
  assert.match(icon, /<linearGradient id="gold"/);
  assert.match(icon, /<radialGradient id="sheen"/);
  assert.match(icon, /<filter id="bevel"/);
  assert.match(icon, /<feComposite in2="SourceAlpha" operator="in"\/>/);
  assert.equal((icon.match(/<path\b/g) ?? []).length, 1);
  assert.doesNotMatch(icon, /<rect\b|<circle\b|<ellipse\b|<image\b|<script\b|<foreignObject\b/i);
  for (const reference of icon.matchAll(/(?:href="|url\()([^"\s)]+)/g)) {
    assert.ok(reference[1].startsWith("#"), `External SVG resource: ${reference[1]}`);
    assert.ok(icon.includes(`id="${reference[1].slice(1)}"`), `Missing SVG resource: ${reference[1]}`);
  }
});
