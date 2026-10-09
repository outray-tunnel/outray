import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductPage, ProductsIndex } from "../src/landing/products/ProductPage";
import { productIds, products } from "../src/landing/products/content";
import { productPageHead } from "../src/landing/products/meta";

Object.assign(globalThis, { React });

test("every product page renders its own content and direct documentation without network requests", () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("Marketing pages must not fetch product data"); };
  try {
    for (const product of productIds) {
      const html = renderToStaticMarkup(React.createElement(ProductPage, { product }));
      assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
      assert.ok(html.includes(products[product].title));
      assert.ok(html.includes(`href="/docs/${product}"`));
      assert.ok(html.includes(`href="/products/${product}" aria-current="page"`));
      assert.ok(html.includes('href="/signup"'));
      assert.match(html, /Get started/);
      assert.match(html, /Illustrative interface · sample data/);
      assert.match(html, /<pre tabindex="0" aria-label=/);
      assert.equal(products[product].workflow.steps.length, 3);
      assert.equal(products[product].capabilities.length, 4);
      assert.equal(products[product].useCases.length, 3);
      for (const other of productIds.filter((id) => id !== product)) {
        assert.ok(html.includes(`href="/products/${other}"`));
        assert.ok(!html.includes(products[other].title));
      }
    }
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the overview links all four products and labels each preview as sample data", () => {
  const html = renderToStaticMarkup(React.createElement(ProductsIndex));
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.equal((html.match(/<figure\b/g) ?? []).length, 4);
  assert.equal((html.match(/Illustrative interface · sample data/g) ?? []).length, 4);
  assert.match(html, /href="\/products" aria-current="page"/);
  for (const product of productIds) assert.ok(html.includes(`Explore ${products[product].name}`));
});

test("product workflows retain actual CLI, server-only instrumentation, and monitoring boundaries", () => {
  assert.match(products.tunnels.workflow.code, /outray 3000 --subdomain orders/);
  assert.match(products.tunnels.workflow.note, /stay running/);
  assert.match(products.observability.workflow.code, /startOutrayObservability/);
  assert.match(products.observability.workflow.code, /process\.env\.OBSERVABILITY_TOKEN/);
  assert.match(products.observability.workflow.steps[0].description, /Send telemetry/);
  const secretsHtml = renderToStaticMarkup(React.createElement(ProductPage, { product: "secrets" }));
  assert.match(secretsHtml, /OBSERVABILITY_TOKEN/);
  assert.doesNotMatch(secretsHtml, /OUTRAY_API_KEY/);
  assert.match(products.observability.workflow.code, /await import\("\.\/server\.js"\)/);
  assert.match(products.observability.workflow.note, /never bundle it into browser code/);
  assert.match(products.observability.workflow.note, /does not require a tunnel/);
  assert.match(products.secrets.workflow.code, /--vault orders/);
  assert.match(products.secrets.workflow.code, /--env development/);
  assert.match(products.secrets.workflow.code, /outray secrets run -- npm run dev/);
  assert.match(products.uptime.workflow.code, /60 seconds/);
  assert.match(products.uptime.workflow.note, /not private addresses or TCP\/UDP/);
});

test("product metadata replaces inherited tunnel-only social text and uses a product canonical", () => {
  for (const product of [undefined, ...productIds]) {
    const head = productPageHead(product, "https://outray.dev");
    const expectedTitle = product ? `${products[product].name} — OutRay` : "Products — OutRay";
    const expectedUrl = product ? `https://outray.dev/products/${product}` : "https://outray.dev/products";
    assert.ok(head.meta.some((meta) => "title" in meta && meta.title === expectedTitle));
    assert.ok(head.meta.some((meta) => "property" in meta && meta.property === "og:title" && meta.content === expectedTitle));
    assert.ok(head.meta.some((meta) => "name" in meta && meta.name === "twitter:title" && meta.content === expectedTitle));
    assert.ok(head.meta.some((meta) => "name" in meta && meta.name === "description" && !meta.content?.includes("ngrok")));
    assert.deepEqual(head.links, [{ rel: "canonical", href: expectedUrl }]);
    assert.deepEqual(productPageHead(product, "").links, []);
  }
});

test("shared navigation and footer use real product destinations while retaining the Dashboard logic", async () => {
  const navigation = await readFile(new URL("../src/landing/Navigation.tsx", import.meta.url), "utf8");
  const footer = await readFile(new URL("../src/landing/Footer.tsx", import.meta.url), "utf8");
  const stories = await readFile(new URL("../src/landing/ProductStories.tsx", import.meta.url), "utf8");
  assert.match(navigation, /session\?\.user/);
  assert.match(navigation, /dashboardOrganization/);
  assert.match(navigation, /encodeURIComponent\(dashboardOrganization.slug\)/);
  assert.match(navigation, /Dashboard/);
  for (const source of [navigation, footer]) {
    assert.match(source, /className="brand-link" href="\/"/);
    assert.ok(source.includes('href="/products"'));
    for (const product of productIds) assert.ok(source.includes(`/products/${product}`));
  }
  for (const product of productIds) {
    assert.ok(stories.includes(`href="/products/${product}"`));
    assert.ok(stories.includes(`href={\`${"${docsUrl}"}/${product}\`}`));
  }
});

test("all product routes share the layout styles and declare their own metadata", async () => {
  const layoutRoute = await readFile(new URL("../src/routes/products.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/landing/products/products.css", import.meta.url), "utf8");
  assert.match(layoutRoute, /landing\/landing\.css\?url/);
  assert.match(layoutRoute, /products\/products\.css\?url/);
  assert.match(layoutRoute, /component: ProductLayout/);
  assert.doesNotMatch(css, /^\s*(?:body|html|:root|\*)\s*\{/m);
  assert.match(css, /@media \(max-width: 540px\)/);
  for (const product of productIds) {
    const route = await readFile(new URL(`../src/routes/products.${product}.tsx`, import.meta.url), "utf8");
    assert.ok(route.includes(`createFileRoute("/products/${product}")`));
    assert.ok(route.includes(`productPageHead("${product}")`));
  }
});
