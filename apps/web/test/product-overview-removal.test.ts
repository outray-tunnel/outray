import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, isNotFound, notFound, Outlet } from "@tanstack/react-router";
import ts from "typescript";
import { productIds } from "../src/landing/products/content";

type ProductRouteOptions = {
  component: React.ComponentType;
  notFoundComponent: React.ComponentType;
  beforeLoad?: unknown;
  loader: (context: { location: { pathname: string } }) => void;
};

/** Keep the actual loader/boundary while excluding the unrelated navigation/component tree. */
async function loadProductRoute() {
  const source = await readFile(new URL("../src/routes/products.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
  } }).outputText;
  const ProductLayout = () => React.createElement(Outlet);
  const module = { exports: {} as { Route: { path: string; options: ProductRouteOptions } } };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "@tanstack/react-router") return {
        createFileRoute: (path: string) => (options: unknown) => ({ path, options }), notFound,
      };
      if (specifier === "@/landing/products/ProductLayout") return { ProductLayout };
      throw new Error(`Unexpected products-layout dependency: ${specifier}`);
    },
  });
  return { ...module.exports.Route, ProductLayout };
}

test("the products overview is removed without removing the parent layout or four child routes", async () => {
  await assert.rejects(stat(new URL("../src/routes/products.index.tsx", import.meta.url)), { code: "ENOENT" });
  const shared = await readFile(new URL("../src/landing/products/ProductPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(shared, /\bProductsIndex\b/);
  assert.match(shared, /export function ProductPage\b/);
  const routeTree = await readFile(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8");
  assert.doesNotMatch(routeTree, /products\.index|ProductsIndexRoute/);
  for (const product of productIds) {
    const source = await readFile(new URL(`../src/routes/products.${product}.tsx`, import.meta.url), "utf8");
    assert.ok(source.includes(`createFileRoute("/products/${product}")`));
    assert.ok(source.includes(`productPageHead("${product}")`));
  }
});

test("the preserved products parent returns notFound for exactly the removed overview paths", async () => {
  const route = await loadProductRoute();
  assert.equal(route.path, "/products");
  assert.equal(route.options.component, route.ProductLayout);
  assert.equal(typeof route.options.notFoundComponent, "function", "the removed overview has an explicit not-found screen instead of a blank layout");
  const notFoundMarkup = renderToStaticMarkup(React.createElement(route.options.notFoundComponent));
  assert.match(notFoundMarkup, /<main\b/);
  assert.match(notFoundMarkup, /<h1\b[^>]*>Page not found<\/h1>/);
  assert.match(notFoundMarkup, /href="\/"[^>]*>Back to OutRay<\/a>/);
  assert.doesNotMatch(notFoundMarkup, /href="\/products\/?"/);
  assert.equal(route.options.beforeLoad, undefined, "a beforeLoad notFound can bubble past the product boundary");
  assert.equal(typeof route.options.loader, "function");
  for (const pathname of ["/products", "/products/"]) {
    assert.throws(() => route.options.loader({ location: { pathname } }), (error: unknown) => isNotFound(error) && error.routeId === "/products");
  }
  for (const pathname of [...productIds.map((product) => `/products/${product}`), "/products/unknown", "/products-archive"]) {
    assert.doesNotThrow(() => route.options.loader({ location: { pathname } }), "the exact-root guard does not intercept child or similarly named paths");
  }
});

test("the installed router marks both removed overview paths 404 at the products boundary while child pages succeed", async () => {
  const route = await loadProductRoute();
  const routerFor = (pathname: string) => {
    const root = createRootRoute();
    const parent = createRoute({ ...route.options, getParentRoute: () => root, path: "products" });
    const children = productIds.map((path) => createRoute({ getParentRoute: () => parent, path }));
    return createRouter({
      routeTree: root.addChildren([parent.addChildren(children)]),
      history: createMemoryHistory({ initialEntries: [pathname] }), isServer: true,
    });
  };
  for (const pathname of ["/products", "/products/", ...productIds.map((product) => `/products/${product}`)]) {
    let router = routerFor(pathname);
    await router.load();
    if (pathname === "/products/") {
      assert.equal(router.state.statusCode, 307, "the installed router first canonicalizes the trailing slash");
      const redirect = router.state.redirect;
      assert.ok(redirect);
      const canonicalPath = new URL(redirect.options.href ?? redirect.options.to ?? "", "http://localhost").pathname;
      assert.equal(canonicalPath, "/products");
      router = routerFor(canonicalPath);
      await router.load();
    }
    const parentMatch = router.state.matches.find((match) => match.routeId === "/products");
    assert.ok(parentMatch, JSON.stringify({ pathname, statusCode: router.state.statusCode, matches: router.state.matches.map((match) => ({ routeId: match.routeId, status: match.status, error: match.error })) }));
    if (pathname === "/products" || pathname === "/products/") {
      assert.equal(router.state.statusCode, 404);
      assert.equal(parentMatch.status, "notFound");
      assert.ok(isNotFound(parentMatch.error) && parentMatch.error.routeId === "/products");
      assert.equal(router.state.matches[0].status, "success", "notFound stays inside the products boundary rather than bubbling to root");
    } else {
      assert.equal(router.state.statusCode, 200);
      assert.ok(router.state.matches.every((match) => match.status === "success"));
      assert.equal(router.state.matches.at(-1)?.pathname, pathname);
    }
  }
});

test("router navigation restores scroll instantly instead of inheriting smooth anchor scrolling", async () => {
  const source = await readFile(new URL("../src/router.tsx", import.meta.url), "utf8");
  assert.match(source, /scrollRestoration:\s*true/);
  assert.match(source, /scrollRestorationBehavior:\s*["']instant["']/);
});

test("product metadata requires a concrete product and public navigation has no removed overview links", async () => {
  const meta = await readFile(new URL("../src/landing/products/meta.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("meta.ts", meta, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "productPageHead");
  assert.ok(declaration && ts.isFunctionDeclaration(declaration));
  assert.equal(declaration.parameters[0].questionToken, undefined, "metadata cannot be generated for a nonexistent optional overview");
  assert.equal(declaration.parameters[0].type?.getText(ast), "ProductId");
  for (const path of [
    "../src/landing/Navigation.tsx", "../src/landing/Footer.tsx",
    "../src/components/docs/docs-header.tsx", "../content/docs/index.mdx",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\b(?:to|href)\s*(?:=|:)\s*\{?\s*["']\/products\/?["']|\]\(\/products\/?\)/, `${path} must not link to the removed overview`);
  }
});
