import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Link, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { ProductPage, ProductsIndex } from "../src/landing/products/ProductPage";
import { TunnelHero } from "../src/landing/products/TunnelHero";
import { TunnelTerminalSection, SAMPLE_TUNNEL_LOGS, createInitialTunnelLogs, advanceTunnelLogs } from "../src/landing/products/TunnelTerminal";
import { TunnelFeatureSections } from "../src/landing/products/TunnelFeatureSections";
import { TunnelDeveloperExperience, TUNNEL_PLUGINS, tunnelPluginIndexFromKey, tokenizeTunnelCode } from "../src/landing/products/TunnelDeveloperExperience";
import { TunnelDomainSection, TunnelLocalSection, TunnelProtocolsSection } from "../src/landing/products/TunnelAddressSections";
import { TunnelNetworkDiagram } from "../src/landing/products/TunnelNetworkDiagram";
import { CopyButton } from "../src/components/arc/copy-button/copy-button";
import { productIds, products, type ProductId } from "../src/landing/products/content";
import { productPageHead } from "../src/landing/products/meta";

Object.assign(globalThis, { React });

function renderToStaticMarkup(component: React.ReactNode) {
  const root = createRootRoute();
  const signup = createRoute({ getParentRoute: () => root, path: "signup" });
  const docs = createRoute({ getParentRoute: () => root, path: "docs/$" });
  const product = createRoute({ getParentRoute: () => root, path: "products/$" });
  const router = createRouter({ routeTree: root.addChildren([signup, docs, product]), history: createMemoryHistory({ initialEntries: ["/"] }), isServer: true });
  return renderMarkup(React.createElement(RouterContextProvider, { router, children: component }));
}

/** Match route composition without importing TanStack's route registration runtime. */
function productPage(product: ProductId) {
  return React.createElement(ProductPage, {
    product,
    ...(product === "tunnels" ? {
      className: "[--accent:#888] [--accent-deep:#444] [--accent-light:#d4d4d4] [--accent-rgb:160_160_160]",
      hero: React.createElement(TunnelHero),
      workflow: React.createElement(TunnelTerminalSection),
      sections: React.createElement(TunnelFeatureSections),
    } : {}),
  });
}

type TerminalElement = React.ReactElement<Record<string, any>>;
type TerminalListener = (...args: any[]) => void;
type TerminalHook = { value: any; dependencies?: unknown[]; cleanup?: () => void };

function terminalElements(node: React.ReactNode): TerminalElement[] {
  if (Array.isArray(node)) return node.flatMap(terminalElements);
  if (!React.isValidElement(node)) return [];
  const element = node as TerminalElement;
  return [element, ...terminalElements(element.props.children)];
}

/** Exercise the real streaming effects and callbacks without a browser or server. */
async function terminalHarness({ component = "TunnelTerminalSection", reduced = false, hidden = false, hasObserver = true }: {
  component?: "TunnelTerminalSection" | "TunnelNetworkDiagram"; reduced?: boolean; hidden?: boolean; hasObserver?: boolean;
} = {}) {
  const file = component === "TunnelTerminalSection" ? "TunnelTerminal" : "TunnelNetworkDiagram";
  const source = await readFile(new URL(`../src/landing/products/${file}.tsx`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const hooks: TerminalHook[] = [], effects: Array<() => void> = [];
  const mediaListeners = new Set<TerminalListener>(), visibilityListeners = new Set<TerminalListener>();
  const observers: Array<{ callback: TerminalListener; disconnected: boolean; targets: unknown[] }> = [];
  const intervals = new Map<number, { callback: () => void; delay: number }>();
  let slot = 0, nextInterval = 0, writes = 0;
  const media = {
    matches: reduced,
    addEventListener(_event: string, listener: TerminalListener) { mediaListeners.add(listener); },
    removeEventListener(_event: string, listener: TerminalListener) { mediaListeners.delete(listener); },
  };
  const document = {
    hidden, visibilityState: hidden ? "hidden" : "visible",
    addEventListener(_event: string, listener: TerminalListener) { visibilityListeners.add(listener); },
    removeEventListener(_event: string, listener: TerminalListener) { visibilityListeners.delete(listener); },
  };
  class IntersectionObserver {
    private record: typeof observers[number];
    constructor(callback: TerminalListener) {
      this.record = { callback, disconnected: false, targets: [] };
      observers.push(this.record);
    }
    observe(target: unknown) { this.record.targets.push(target); }
    disconnect() { this.record.disconnected = true; }
  }
  const react = {
    ...React,
    useId: () => "test-tunnel-terminal",
    useState(initial: any) {
      const index = slot++;
      hooks[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, (value: any) => {
        hooks[index].value = typeof value === "function" ? value(hooks[index].value) : value;
        writes++;
      }];
    },
    useRef(initial: any) {
      const index = slot++;
      return (hooks[index] ??= { value: { current: initial } }).value;
    },
    useEffect(callback: () => void | (() => void), dependencies: unknown[]) {
      const index = slot++, old = hooks[index];
      if (!old || dependencies.length !== old.dependencies?.length || dependencies.some((value, i) => !Object.is(value, old.dependencies?.[i]))) {
        const record: TerminalHook = { value: undefined, dependencies: [...dependencies], cleanup: old?.cleanup };
        hooks[index] = record;
        effects.push(() => { record.cleanup?.(); record.cleanup = callback() || undefined; });
      }
    },
  };
  const module = { exports: {} as Record<string, () => React.ReactNode> };
  runInNewContext(compiled, {
    React: react, module, exports: module.exports, document,
    IntersectionObserver: hasObserver ? IntersectionObserver : undefined,
    window: {
      matchMedia: () => media,
      IntersectionObserver: hasObserver ? IntersectionObserver : undefined,
      setInterval(callback: () => void, delay: number) { intervals.set(++nextInterval, { callback, delay }); return nextInterval; },
      clearInterval(id: number) { intervals.delete(id); },
    },
    require(specifier: string) {
      if (specifier === "react") return react;
      if (specifier === "@tanstack/react-router") return { Link };
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: () => null };
      if (specifier.startsWith("@outray/icons/")) return { __esModule: true, default: [] };
      if (specifier.endsWith(".css")) return { default: new Proxy({}, { get: (_target, name) => String(name) }), __esModule: true };
      throw new Error(`Unexpected client demo dependency: ${specifier}`);
    },
  });
  return {
    intervals, observers, mediaListeners, visibilityListeners,
    get writes() { return writes; },
    render() {
      slot = 0;
      const tree = module.exports[component]();
      for (const element of terminalElements(tree)) {
        const ref = element.props.ref;
        if (ref && typeof ref === "object" && !ref.current) ref.current = { id: "terminal-section" };
      }
      return tree;
    },
    commit() { effects.splice(0).forEach((effect) => effect()); },
    intersect(visible: boolean) {
      for (const observer of observers.filter((record) => !record.disconnected)) observer.callback([{ isIntersecting: visible }]);
    },
    setReduced(value: boolean) { media.matches = value; for (const listener of mediaListeners) listener(); },
    setHidden(value: boolean) { document.hidden = value; document.visibilityState = value ? "hidden" : "visible"; for (const listener of visibilityListeners) listener(); },
    tick() { [...intervals.values()].forEach(({ callback }) => callback()); },
    dispose() { hooks.forEach((hook) => hook.cleanup?.()); },
  };
}

/** Execute a developer demo's real state and event handlers; decorative icons are inert. */
async function developerHarness(component: "PluginTabs" | "RequestInspection") {
  const source = await readFile(new URL("../src/landing/products/TunnelDeveloperExperience.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const hooks: unknown[] = [];
  let slot = 0, focused: string | undefined;
  const react = {
    ...React,
    useId: () => "test-tunnel-developer",
    useState(initial: unknown) {
      const index = slot++;
      if (!(index in hooks)) hooks[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks[index], (value: unknown) => { hooks[index] = typeof value === "function" ? (value as (previous: unknown) => unknown)(hooks[index]) : value; }];
    },
    useRef(initial: unknown) {
      const index = slot++;
      return hooks[index] ??= { current: initial };
    },
  };
  const module = { exports: {} as { TunnelDeveloperExperience: () => React.ReactNode } };
  const Icon = () => null;
  const CopyButton = () => null;
  runInNewContext(compiled, {
    React: react, module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "react") return react;
      if (specifier === "@tanstack/react-router") return { Link };
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: Icon };
      if (specifier.startsWith("@outray/icons/")) return { __esModule: true, default: [] };
      if (specifier === "react-icons/si") return { SiVite: Icon, SiNextdotjs: Icon, SiExpress: Icon };
      if (specifier.endsWith("copy-button/copy-button")) return { CopyButton };
      if (specifier.endsWith(".css")) return { default: new Proxy({}, { get: (_target, name) => String(name) }), __esModule: true };
      throw new Error(`Unexpected developer demo dependency: ${specifier}`);
    },
  });
  const demo = terminalElements(module.exports.TunnelDeveloperExperience()).find((element) => typeof element.type === "function" && element.type.name === component);
  assert.ok(demo, `The actual ${component} demo remains in the developer section`);
  return {
    get focused() { return focused; },
    render() {
      slot = 0;
      const tree = (demo.type as () => React.ReactNode)();
      for (const element of terminalElements(tree)) {
        if (element.props.role === "tab" && typeof element.props.ref === "function") element.props.ref({ focus() { focused = element.props.id; } });
      }
      return tree;
    },
  };
}

test("every product page renders its own content and direct documentation without network requests", () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("Marketing pages must not fetch product data"); };
  try {
    for (const product of productIds) {
      const html = renderToStaticMarkup(productPage(product));
      assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
      if (product === "tunnels") assert.match(html, /Localhost,.*meet the world\./);
      else assert.ok(html.includes(products[product].title));
      assert.ok(html.includes(`href="/docs/${product}"`));
      assert.doesNotMatch(html, /aria-label="Product pages"|pd-product-nav/);
      assert.ok(html.includes('href="/signup"'));
      assert.match(html, /Get started/);
      if (product === "tunnels") assert.match(html, /illustrative|example|sample/i);
      else assert.match(html, /Illustrative interface · sample data/);
      if (product !== "tunnels") assert.match(html, /<pre\b[^>]*tabindex="0"[^>]*aria-label=/);
      assert.equal(products[product].workflow.steps.length, 3);
      assert.equal(products[product].capabilities.length, 4);
      assert.equal(products[product].useCases.length, 3);
      if (product !== "tunnels") {
        const next = products[product].next;
        assert.ok(html.includes(`href="/products/${next}"`));
        assert.ok(html.includes(`Explore ${products[next].name}`));
        assert.equal((html.match(/href="\/products\/[^"]+"/g) ?? []).length, 1, "only the connected-product content link remains");
      }
      for (const other of productIds.filter((id) => id !== product)) assert.ok(!html.includes(products[other].title));
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
  assert.doesNotMatch(html, /aria-label="Product pages"|pd-product-nav/);
  for (const product of productIds) {
    assert.ok(html.includes(`Explore ${products[product].name}`));
    assert.ok(html.includes(`href="/products/${product}"`));
  }
});

test("the tunnels hero has its new headline, real destinations and copyable example command", () => {
  const html = renderToStaticMarkup(productPage("tunnels"));
  const hero = html.match(/<section\b[^>]*aria-labelledby="product-title"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(hero, "the dedicated tunnel hero retains its accessible section heading");
  assert.match(hero, /Localhost,.*meet the world\./);
  assert.match(hero, /href="\/signup"[^>]*>Start tunneling/);
  assert.match(hero, /href="\/docs\/tunnels"[^>]*>Learn more/);
  assert.match(hero, /npx outray 3000/);
  assert.match(hero, /aria-label="Copy[^"]*command"/i);
  assert.match(hero, /aria-live="polite"/);
  assert.match(hero, /aria-label="Example public address/, "the portal is labelled as an example rather than live connection data");
  assert.doesNotMatch(hero, /99\.9\d*%|requests per second|live traffic metrics/i);
  assert.ok(!html.includes(products.tunnels.workflow.title), "the generic workflow is absent");
  assert.doesNotMatch(html, /id="capabilities-title"|id="use-cases-title"/);
  assert.ok(!html.includes(products.tunnels.workflow.title), "the new terminal section replaces the generic tunnel workflow");
});

test("the tunnels hero removes only its terminal demo and caption, retaining the portal and quick start", () => {
  const html = renderToStaticMarkup(productPage("tunnels"));
  const hero = html.match(/<section\b[^>]*aria-labelledby="product-title"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(hero);
  assert.doesNotMatch(hero, /your terminal|Tunnel connected|\/webhooks\/payment|<figcaption\b/i);
  assert.match(hero, /<figure\b[^>]*aria-label="Example public address/);
  assert.match(hero, /YOUR MACHINE/);
  assert.match(hero, /PUBLIC ADDRESS/);
  assert.match(hero, /localhost(?:<[^>]+>)*:3000/);
  assert.match(hero, /demo(?:<[^>]+>)*\.outray\.app/);
  assert.match(hero, /HTTPS, ready to share/);
  assert.equal((hero.match(/npx outray 3000/g) ?? []).length, 1, "the centered copyable command remains without a duplicate terminal command");
  assert.match(hero, /aria-label="Copy tunnel command"/);
});

test("the tunnel hero centers its command row and places Learn more underneath without the old helper or protocols", async () => {
  const html = renderToStaticMarkup(productPage("tunnels"));
  const hero = html.match(/<section\b[^>]*aria-labelledby="product-title"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(hero);
  assert.doesNotMatch(hero, /Once signed in, one command opens the door\.|Your app\. Your machine\.|\b(?:HTTP|TCP|UDP)\b/);
  assert.doesNotMatch(hero, /Read the docs/);
  assert.match(hero, /href="\/signup"[^>]*>Start tunneling/);
  assert.match(hero, /href="\/docs\/tunnels"[^>]*>Learn more/);
  assert.ok(hero.indexOf('href="/docs/tunnels"') > hero.indexOf("npx outray 3000"), "the docs link follows the command in reading and keyboard order");
  const source = await readFile(new URL("../src/landing/products/TunnelHero.tsx", import.meta.url), "utf8");
  assert.match(source, /col-span-full/, "the command spans the copy and portal columns");
  assert.match(source, /justify-self-center justify-items-center/, "the full-width quick start row is centered");
});

test("the dedicated tunnel hero is isolated from the other product heroes and overview", () => {
  for (const product of productIds.filter((id) => id !== "tunnels")) {
    const html = renderToStaticMarkup(productPage(product));
    assert.ok(html.includes(products[product].title));
    assert.doesNotMatch(html, /Localhost,.*meet the world\.|Start tunneling/);
    assert.match(html, /Illustrative interface · sample data/);
  }
  const overview = renderToStaticMarkup(React.createElement(ProductsIndex));
  assert.doesNotMatch(overview, /Localhost,.*meet the world\.|Start tunneling/);
});

test("the tunnel illustration is decorative and its SVG definitions are unique across instances", () => {
  const single = renderToStaticMarkup(productPage("tunnels"));
  const hero = single.match(/<section\b[^>]*aria-labelledby="product-title"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(hero);
  assert.match(hero, /<svg[^>]*aria-hidden="true"[^>]*focusable="false"|<svg[^>]*focusable="false"[^>]*aria-hidden="true"/);
  const output = renderToStaticMarkup(React.createElement("div", null, productPage("tunnels"), productPage("tunnels")));
  const definitionIds = [...output.matchAll(/<(?:linearGradient|radialGradient|filter|mask|clipPath)\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(definitionIds.length > 0, "the unique tunnel illustration is present during SSR");
  assert.equal(new Set(definitionIds).size, definitionIds.length, "separate hero instances cannot share SVG definition identifiers");
  for (const reference of output.matchAll(/url\(#([^)]+)\)/g)) assert.ok(definitionIds.includes(reference[1]), `Missing SVG definition: ${reference[1]}`);
});

test("the tunnel command delegates clipboard behavior and feedback to the shared CopyButton", () => {
  const nodes: React.ReactNode[] = [TunnelHero()];
  let copyButtons = 0;
  while (nodes.length) {
    const node = nodes.pop();
    if (Array.isArray(node)) { nodes.push(...node); continue; }
    if (!React.isValidElement(node)) continue;
    const element = node as React.ReactElement<Record<string, unknown>>;
    if (element.type === CopyButton) {
      copyButtons++;
      assert.equal(element.props.value, "npx outray 3000");
      assert.equal(element.props.iconOnly, true);
      assert.equal(element.props.variant, "plain");
      assert.equal(element.props.label, "Copy tunnel command");
    }
    nodes.push(element.props.children as React.ReactNode);
  }
  assert.equal(copyButtons, 1);
});

test("the tunnel hero has narrow-screen layouts and static packet behavior for reduced motion", async () => {
  const source = await readFile(new URL("../src/landing/products/TunnelHero.tsx", import.meta.url), "utf8");
  assert.match(source, /max-\[820px\]:/);
  assert.match(source, /max-\[540px\]:/);
  assert.match(source, /motion-reduce:animate-none/);
});

test("the Tunnels page keeps readable neutral headlines while allowing selective demo accents", async () => {
  const source = await readFile(new URL("../src/landing/products/TunnelHero.tsx", import.meta.url), "utf8");
  assert.match(source, /var\(--accent(?:-light|-deep)?\)/i, "selective accents remain available in the decorative portal");
  const html = renderToStaticMarkup(productPage("tunnels"));
  const headings = [...html.matchAll(/<h[12]\b[^>]*class="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(headings.length >= 7);
  for (const classes of headings) {
    assert.doesNotMatch(classes, /text-\[var\(--accent/i, "headings remain neutral rather than color-washed");
    assert.doesNotMatch(classes, /text-transparent|bg-clip-text/, "headings do not use accent gradient text");
    for (const [, rawColor] of classes.matchAll(/text-\[#([\da-f]{3}|[\da-f]{6})\]/gi)) {
      const color = rawColor.length === 3 ? [...rawColor].map((digit) => digit.repeat(2)).join("") : rawColor;
      const channels = [0, 2, 4].map((index) => parseInt(color.slice(index, index + 2), 16));
      assert.ok(Math.max(...channels) - Math.min(...channels) < 20, `#${rawColor} remains a neutral headline color`);
    }
  }
});

test("Tunnels cards and chrome use flat fills without removing purposeful illustration gradients", async () => {
  const files = {
    hero: await readFile(new URL("../src/landing/products/TunnelHero.tsx", import.meta.url), "utf8"),
    terminal: await readFile(new URL("../src/landing/products/TunnelTerminal.tsx", import.meta.url), "utf8"),
    developer: await readFile(new URL("../src/landing/products/TunnelDeveloperExperience.tsx", import.meta.url), "utf8"),
    address: await readFile(new URL("../src/landing/products/TunnelAddressSections.tsx", import.meta.url), "utf8"),
    network: await readFile(new URL("../src/landing/products/TunnelNetworkDiagram.tsx", import.meta.url), "utf8"),
    sections: await readFile(new URL("../src/landing/products/TunnelFeatureSections.tsx", import.meta.url), "utf8"),
  };
  for (const [name, source] of Object.entries(files)) {
    assert.match(source, /bg-\[#(?:0[589]|11|15|19|1d|20|29)[0-9a-f]*\]/i, `${name} keeps explicit solid surface fills`);
  }
  assert.doesNotMatch(files.sections, /bg-\[(?:linear|radial)-gradient/, "the final CTA has no neutral wash");
  assert.match(files.network, /bg-\[radial-gradient\([^\]]*var\(--node-rgb\)/, "colored node glows remain decorative, not card shading");
  assert.match(files.network, /bg-\[linear-gradient\(/, "the colored connection track and packet trail remain intact");
  assert.match(files.address, /bg-\[linear-gradient\(/, "the local-device grid remains a purposeful pattern");
  assert.match(files.hero, /<linearGradient\b/, "the decorative portal keeps its illustrated light");
});

test("Tunnels removes section eyebrows, including the hero product label, without removing other products' copy", () => {
  const html = renderToStaticMarkup(productPage("tunnels"));
  assert.doesNotMatch(html, /class="[^"]*\beyebrow\b/);
  for (const label of [
    "OutRay Tunnels", "STRAIGHT TO YOUR TERMINAL", "BUILT FOR YOUR WORKFLOW", "NO PORT FORWARDING. NO DEPLOYMENT.",
    "YOUR ADDRESS. YOUR NAME.", "BEYOND YOUR BROWSER", "NOT JUST WEBSITES", "OPEN SOURCE. NOT A BLACK BOX.", "LOCAL APP. PUBLIC POSSIBILITIES.",
  ]) assert.ok(!html.includes(label), `Removed section eyebrow: ${label}`);
  for (const product of productIds.filter((id) => id !== "tunnels")) {
    const other = renderToStaticMarkup(productPage(product));
    assert.ok(other.includes(`OUTRAY ${products[product].name.toUpperCase()}`));
  }
});

test("the Tunnels UI uses resolvable Hugeicons wrappers while retaining only decorative custom SVGs", async () => {
  for (const component of ["TunnelHero", "TunnelTerminal", "TunnelDeveloperExperience", "TunnelAddressSections", "TunnelFeatureSections", "TunnelNetworkDiagram"]) {
    const source = await readFile(new URL(`../src/landing/products/${component}.tsx`, import.meta.url), "utf8");
    const file = ts.createSourceFile(`${component}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imports = file.statements.filter(ts.isImportDeclaration).map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text);
    const glyphs = imports.filter((path) => path.startsWith("@outray/icons/"));
    assert.ok(glyphs.length > 0, `${component} uses the shared icon package`);
    assert.ok(imports.includes("@hugeicons/react"));
    assert.ok(!imports.includes("lucide-react"), `${component} no longer mixes UI icon libraries`);
    for (const glyph of glyphs) {
      assert.match(glyph, /^@outray\/icons\/(?:stroke|solid)\/\w+Icon$/);
      const wrapper = glyph.replace("@outray/icons/", "");
      await assert.doesNotReject(() => readFile(new URL(`../../../packages/icons/generated/${wrapper}.js`, import.meta.url)), `Missing icon wrapper: ${glyph}`);
    }
    if (component !== "TunnelNetworkDiagram") assert.equal((source.match(/<svg\b/g) ?? []).length, ["TunnelHero", "TunnelAddressSections"].includes(component) ? 1 : 0,
      `${component} keeps custom SVG only for the portal/device illustration, never a UI glyph`);
    assert.doesNotMatch(source, /styles\.eyebrow/);
  }
});

test("the request stream follows the tunnel hero with deterministic, clearly labelled example traffic", () => {
  const first = renderToStaticMarkup(React.createElement(TunnelTerminalSection));
  assert.equal(first, renderToStaticMarkup(React.createElement(TunnelTerminalSection)), "SSR output does not depend on a clock or random traffic");
  assert.match(first, /Every request\. As it arrives\./);
  assert.match(first, /role="region" aria-label="Example tunnel terminal"/);
  assert.match(first, />Example<|>Example<\/span>/);
  assert.match(first, /Illustrative traffic · not a live tunnel\./);
  assert.match(first, /<table[^>]*aria-label="Sample HTTP requests"[^>]*aria-live="off"/);
  assert.match(first, /aria-label="Pause request stream"/);
  const body = first.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
  assert.ok(body);
  assert.equal((body.match(/<tr\b/g) ?? []).length, 8);
  assert.equal((first.match(/scope="col"/g) ?? []).length, 4);
  for (const log of SAMPLE_TUNNEL_LOGS.slice(0, 8)) {
    assert.ok(body.includes(log.path));
    assert.ok(body.includes(`>${log.method}<`));
    assert.ok(body.includes(`>${log.status}<`));
  }
  const html = renderToStaticMarkup(productPage("tunnels"));
  const terminalIndex = html.indexOf("Every request. As it arrives.");
  assert.ok(terminalIndex > html.indexOf('href="/docs/tunnels"'), "the streaming section is below the complete hero/quick start");
  assert.ok(terminalIndex < html.indexOf('id="tunnel-developer-title"'), "the terminal precedes the remaining tunnel feature sections");
});

test("the new request stream does not replace the other product workflows or overview previews", () => {
  for (const product of productIds.filter((id) => id !== "tunnels")) {
    const html = renderToStaticMarkup(productPage(product));
    assert.ok(html.includes(products[product].workflow.title));
    assert.match(html, /<pre\b[^>]*tabindex="0"[^>]*aria-label=/);
    assert.match(html, /id="capabilities-title"|id="use-cases-title"/);
    assert.ok(html.includes(`Explore ${products[products[product].next].name}`));
    assert.doesNotMatch(html, /tunnel-developer-title|tunnel-domain-title|tunnel-local-title|tunnel-protocols-title|tunnel-open-source-title|tunnel-start-title/);
    assert.doesNotMatch(html, /Every request\. As it arrives\.|Example tunnel terminal|Pause request stream/);
  }
  const overview = renderToStaticMarkup(React.createElement(ProductsIndex));
  assert.doesNotMatch(overview, /Every request\. As it arrives\.|Example tunnel terminal|Pause request stream/);
  assert.equal((overview.match(/Illustrative interface · sample data/g) ?? []).length, 4);
});

test("the full Tunnels page presents its new feature sections in order and retains real action destinations", () => {
  const html = renderToStaticMarkup(productPage("tunnels"));
  const expected = [
    "tunnel-developer-title", "tunnel-connection-title", "tunnel-domain-title", "tunnel-local-title",
    "tunnel-protocols-title", "tunnel-open-source-title", "tunnel-start-title",
  ];
  const headings = [...html.matchAll(/<h2\b[^>]*id="(tunnel-[^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(headings, expected);
  assert.ok(html.indexOf("Every request. As it arrives.") < html.indexOf('id="tunnel-developer-title"'));
  assert.doesNotMatch(html, /id="capabilities-title"|id="use-cases-title"|id="connected-title"|id="start-title"/);
  for (const destination of ["/docs/tunnels", "/docs/architecture", "/docs/custom-domains", "/docs/cli-reference#options", "/docs/protocols", "/signup"]) {
    assert.ok(html.includes(`href="${destination}"`), `Missing destination: ${destination}`);
  }
  assert.match(html, /href="https:\/\/github\.com\/outray-tunnel\/outray"[^>]*target="_blank"[^>]*rel="noreferrer"/);
  assert.match(html, /href="https:\/\/discord\.gg\/[^"]+"[^>]*target="_blank"[^>]*rel="noreferrer"/);
  assert.match(html, /AGPL-3\.0 platform · MIT framework SDKs/);
  assert.match(html, /instance-owned limits/);
  assert.match(html, /No deployment\.|doesn’t deploy your app/);
  const cta = html.match(/<section\b[^>]*aria-labelledby="tunnel-start-title"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(cta);
  assert.match(cta, /Keep building locally\..*Let the world in\./);
  assert.match(cta, /href="\/signup"[^>]*>Get started/);
  assert.match(cta, /href="\/docs\/tunnels"[^>]*>Read the docs/);
});

test("the connection section restores the four original-inspired stages with an illustrative, inspectable Tailwind animation", async () => {
  const html = renderToStaticMarkup(productPage("tunnels"));
  const connection = html.match(/<section\b[^>]*aria-labelledby="tunnel-connection-title"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(connection);
  assert.match(connection, /It just works\./);
  const stages = [...connection.matchAll(/<h3\b[^>]*>([^<]+)<\/h3>/g)].map((match) => match[1]);
  assert.deepEqual(stages, ["Localhost", "Secure tunnel", "OutRay Edge", "Public Internet"]);
  assert.match(connection, /aria-label="Pause connection animation"/);
  assert.match(connection, /Illustrative connection/);
  assert.match(connection, /href="\/docs\/architecture"/);
  const source = await readFile(new URL("../src/landing/products/TunnelFeatureSections.tsx", import.meta.url), "utf8");
  assert.match(source, /import\s*\{\s*TunnelNetworkDiagram\s*\}\s*from ["']\.\/TunnelNetworkDiagram["']/);
  const first = renderToStaticMarkup(React.createElement(TunnelNetworkDiagram));
  assert.equal(first, renderToStaticMarkup(React.createElement(TunnelNetworkDiagram)), "the animation stays deterministic during SSR");
  assert.match(first, /data-motion="paused"/);
  assert.deepEqual([...first.matchAll(/data-stage="([^"]+)"/g)].map((match) => match[1]), ["local", "secure", "edge", "public"]);
  assert.doesNotMatch(first, /<canvas|aria-live="(?:polite|assertive)"/);
  const diagramSource = await readFile(new URL("../src/landing/products/TunnelNetworkDiagram.tsx", import.meta.url), "utf8");
  const globalCss = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(globalCss, /@keyframes packet-horizontal/);
  assert.match(globalCss, /@keyframes node-glow/);
  assert.match(diagramSource, /\[animation-play-state:paused\]/);
  assert.match(diagramSource, /data-motion=\{running \? "running" : "paused"\}/);
  assert.match(diagramSource, /motion-reduce:animate-none/);
});

test("the four network accents stay vivid and their animated glows use the same palette", async () => {
  const source = await readFile(new URL("../src/landing/products/TunnelNetworkDiagram.tsx", import.meta.url), "utf8");
  const accents = [...source.matchAll(/--node-color:#([\da-f]{6})\]\s+\[--node-rgb:(\d+)_(\d+)_(\d+)\]/gi)];
  assert.equal(accents.length, 4, "each connection stage has a purposeful accent");
  assert.equal(new Set(accents.map(([, hex]) => hex.toLowerCase())).size, 4, "the four stages remain visually distinct");
  for (const [, hex, red, green, blue] of accents) {
    const channels = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
    const brightest = Math.max(...channels);
    const saturation = (brightest - Math.min(...channels)) / brightest;
    assert.ok(saturation >= .45, `#${hex} should be a vivid accent, not a washed-out pastel`);
    assert.ok(brightest >= 210, `#${hex} should stay bright against the dark node surface`);
    assert.deepEqual([Number(red), Number(green), Number(blue)], channels, "node and glow colors stay consistent");
  }
  assert.match(source, /text-\[var\(--node-color\)\]/);
  assert.match(source, /rgb\(var\(--node-rgb\)\//);
});

test("the restored network animation pauses offscreen, in a hidden tab, and through its user control without a JS loop", async () => {
  const harness = await terminalHarness({ component: "TunnelNetworkDiagram" });
  const motion = (tree: React.ReactNode) => terminalElements(tree).find((element) => "data-motion" in element.props)!.props["data-motion"];
  try {
    let tree = harness.render();
    assert.equal(motion(tree), "paused", "SSR/initial render never animates before checking preferences and visibility");
    harness.commit(); tree = harness.render(); harness.commit();
    assert.equal(motion(tree), "paused");
    harness.intersect(true); tree = harness.render(); harness.commit();
    assert.equal(motion(tree), "running");
    assert.equal(harness.intervals.size, 0, "CSS, not a continuously running JS timer, drives the animation");
    terminalElements(tree).find((element) => element.props["aria-label"] === "Pause connection animation")!.props.onClick();
    tree = harness.render(); harness.commit();
    assert.equal(motion(tree), "paused");
    terminalElements(tree).find((element) => element.props["aria-label"] === "Resume connection animation")!.props.onClick();
    tree = harness.render(); harness.commit();
    assert.equal(motion(tree), "running");
    harness.setHidden(true); tree = harness.render(); harness.commit();
    assert.equal(motion(tree), "paused");
    harness.setHidden(false); tree = harness.render(); harness.commit();
    assert.equal(motion(tree), "running");
    harness.intersect(false); tree = harness.render(); harness.commit();
    assert.equal(motion(tree), "paused");
    harness.intersect(true); tree = harness.render(); harness.commit();
    assert.equal(motion(tree), "running");
  } finally { harness.dispose(); }
  assert.equal(harness.mediaListeners.size, 0);
  assert.equal(harness.visibilityListeners.size, 0);
  assert.ok(harness.observers.every((observer) => observer.disconnected));
  const writes = harness.writes;
  harness.intersect(true); harness.setHidden(true); harness.setReduced(true);
  assert.equal(harness.writes, writes);
});

test("the restored network diagram honors reduced motion initially and at runtime, with a no-observer fallback", async () => {
  const harness = await terminalHarness({ component: "TunnelNetworkDiagram", reduced: true, hasObserver: false });
  const attributes = (tree: React.ReactNode) => terminalElements(tree).find((element) => "data-motion" in element.props)!.props;
  try {
    harness.render(); harness.commit(); let tree = harness.render(); harness.commit();
    assert.equal(attributes(tree)["data-motion"], "paused");
    assert.equal(attributes(tree)["data-reduced-motion"], true);
    assert.ok(!terminalElements(tree).some((element) => element.props["aria-label"] === "Pause connection animation"));
    harness.setReduced(false); tree = harness.render(); harness.commit();
    assert.equal(attributes(tree)["data-motion"], "running");
    assert.equal(attributes(tree)["data-reduced-motion"], false);
    harness.setReduced(true); tree = harness.render(); harness.commit();
    assert.equal(attributes(tree)["data-motion"], "paused");
    assert.equal(attributes(tree)["data-reduced-motion"], true);
    assert.equal(harness.observers.length, 0);
    assert.equal(harness.intervals.size, 0);
  } finally { harness.dispose(); }
});

test("the developer section explains its tools with accessible framework panels and clearly illustrative request details", () => {
  const html = renderToStaticMarkup(React.createElement(TunnelDeveloperExperience));
  for (const title of ["First-class developer experience", "Online in one line", "Fits into your workflow", "Inspect every request"]) assert.ok(html.includes(title));
  assert.match(html, /role="tablist" aria-label="Tunnel framework integration"/);
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map(([tag]) => tag);
  const panels = [...html.matchAll(/<div[^>]*role="tabpanel"[^>]*>/g)].map(([tag]) => tag);
  assert.equal(tabs.length, 3);
  assert.equal(panels.length, 3);
  tabs.forEach((tab, index) => {
    assert.match(tab, new RegExp(`aria-selected="${index === 0}"`));
    assert.match(tab, new RegExp(`tabindex="${index === 0 ? 0 : -1}"`));
    const target = tab.match(/aria-controls="([^"]+)"/)?.[1];
    assert.ok(target);
    assert.ok(panels[index].includes(`id="${target}"`));
    assert.equal(panels[index].includes('hidden=""'), index !== 0);
  });
  for (const plugin of TUNNEL_PLUGINS) {
    assert.ok(html.includes(`href="${plugin.docs}"`));
    assert.ok(html.includes(plugin.file));
    assert.ok(html.includes(plugin.install));
    assert.match(plugin.code, /process\.env\.OUTRAY_API_KEY/);
  }
  assert.match(html, /Never expose it in client code/);
  assert.match(html, /Example · capture enabled/);
  assert.match(html, /aria-label="Example tunnel requests"/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /aria-label="Selected example request"/);
  assert.match(html, /201 Created/);
  assert.match(html, /payment\.completed/);
  const twice = renderToStaticMarkup(React.createElement("div", null, React.createElement(TunnelDeveloperExperience), React.createElement(TunnelDeveloperExperience)));
  const panelIds = [...twice.matchAll(/\bid="([^"]+-(?:tab|panel)-(?:vite|next|express))"/g)].map((match) => match[1]);
  assert.equal(panelIds.length, 12);
  assert.equal(new Set(panelIds).size, panelIds.length, "framework controls remain unique when rendered twice");
});

test("framework tab keys wrap predictably and actual handlers keep selected code and keyboard focus together", async () => {
  assert.deepEqual(TUNNEL_PLUGINS.map(({ id }) => id), ["vite", "next", "express"]);
  TUNNEL_PLUGINS.forEach((_, index) => {
    assert.equal(tunnelPluginIndexFromKey(index, "ArrowRight"), (index + 1) % 3);
    assert.equal(tunnelPluginIndexFromKey(index, "ArrowLeft"), (index + 2) % 3);
    assert.equal(tunnelPluginIndexFromKey(index, "Home"), 0);
    assert.equal(tunnelPluginIndexFromKey(index, "End"), 2);
    assert.equal(tunnelPluginIndexFromKey(index, "Tab"), null);
  });
  const harness = await developerHarness("PluginTabs");
  let tree = harness.render();
  const selected = () => terminalElements(tree).find((element) => element.props.role === "tab" && element.props["aria-selected"] === true)!;
  assert.match(selected().props.id, /-tab-vite$/);
  const express = terminalElements(tree).find((element) => element.props.role === "tab" && element.props.id.endsWith("-tab-express"))!;
  express.props.onClick(); tree = harness.render();
  assert.match(selected().props.id, /-tab-express$/);
  for (const [key, id] of [["ArrowRight", "vite"], ["ArrowLeft", "express"], ["Home", "vite"], ["End", "express"]]) {
    let prevented = false;
    selected().props.onKeyDown({ key, preventDefault() { prevented = true; } });
    tree = harness.render();
    assert.ok(prevented);
    assert.ok(selected().props.id.endsWith(`-tab-${id}`));
    assert.equal(harness.focused, selected().props.id);
    const panels = terminalElements(tree).filter((element) => element.props.role === "tabpanel");
    assert.equal(panels.length, 3, "switching frameworks preserves all panel containers");
    const active = panels.find((element) => element.props.hidden === false)!;
    assert.equal(active.props.id, selected().props["aria-controls"]);
    const text = renderToStaticMarkup(active);
    assert.ok(text.includes(TUNNEL_PLUGINS.find((plugin) => plugin.id === id)!.install));
  }
  let prevented = false;
  selected().props.onKeyDown({ key: "Tab", preventDefault() { prevented = true; } });
  tree = harness.render();
  assert.equal(prevented, false, "ordinary Tab keeps native focus movement");
  assert.match(selected().props.id, /-tab-express$/);
});

test("integration highlighting preserves raw source and clipboard values while rendering code as escaped text", async () => {
  for (const plugin of TUNNEL_PLUGINS) assert.equal(tokenizeTunnelCode(plugin.code).map((token) => token.text).join(""), plugin.code);
  assert.deepEqual(tokenizeTunnelCode(""), []);
  const example = 'const url = "https://example.com/<tag>"; // local example\nawait run(3000);';
  const tokens = tokenizeTunnelCode(example);
  assert.equal(tokens.map((token) => token.text).join(""), example);
  assert.ok(tokens.some((token) => token.kind === "keyword" && token.text === "const"));
  assert.ok(tokens.some((token) => token.kind === "keyword" && token.text === "await"));
  assert.ok(tokens.some((token) => token.kind === "string" && token.text.includes("https://example.com/<tag>")));
  assert.ok(tokens.some((token) => token.kind === "comment" && token.text === "// local example"));
  assert.ok(tokens.some((token) => token.kind === "number" && token.text === "3000"));
  const harness = await developerHarness("PluginTabs");
  const nodes = terminalElements(harness.render());
  const copies = nodes.filter((element) => typeof element.type === "function" && element.type.name === "CopyButton");
  assert.deepEqual(copies.map((element) => element.props.value), TUNNEL_PLUGINS.map((plugin) => plugin.code));
  const highlighted = nodes.find((element) => typeof element.type === "function" && element.type.name === "HighlightedTunnelCode");
  assert.ok(highlighted);
  const output = renderToStaticMarkup(React.cloneElement(highlighted, { source: 'const markup = "<script>alert(1)</script>";' }));
  assert.doesNotMatch(output, /<script>/);
  assert.match(output, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("selecting an example request updates its details without claiming live capture", async () => {
  const harness = await developerHarness("RequestInspection");
  let tree = harness.render();
  const requests = () => terminalElements(tree).filter((element) => element.type === "button" && "aria-pressed" in element.props);
  assert.equal(requests().length, 4);
  assert.equal(requests()[0].props["aria-pressed"], true);
  requests()[3].props.onClick(); tree = harness.render();
  assert.deepEqual(requests().map((request) => request.props["aria-pressed"]), [false, false, false, true]);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /aria-label="Selected example request"[\s\S]*503 Unavailable/);
  assert.match(html, /aria-label="Selected example request"[\s\S]*database/);
  assert.doesNotMatch(html, /payment\.completed/);
  assert.match(html, /Example · capture enabled/);
});

test("custom-domain, local-device and protocol sections use supported commands and describe their real boundaries", () => {
  const domain = renderToStaticMarkup(React.createElement(TunnelDomainSection));
  assert.match(domain, /id="tunnel-domain-title"/);
  assert.match(domain, /href="\/docs\/custom-domains"/);
  assert.match(domain, /outray 3000 --domain preview\.example\.com/);
  assert.match(domain, /aria-label="Copy custom domain command"/);
  assert.match(domain, /_outray-challenge\.preview\.example\.com/);
  assert.match(domain, /Workspace-provided target/);
  assert.match(domain, /Illustrative configuration\. Copy the exact DNS records from your workspace\./);
  const local = renderToStaticMarkup(React.createElement(TunnelLocalSection));
  assert.match(local, /id="tunnel-local-title"/);
  assert.match(local, /href="\/docs\/cli-reference#options"/);
  assert.match(local, /outray 3000 --local/);
  assert.match(local, /share a network and support mDNS/);
  assert.match(local, /mkcert/);
  assert.match(local, /trust its CA on each device/);
  assert.match(local, /otherwise certificates are self-signed/);
  assert.match(local, /Illustrative devices\. Use the local address printed by the CLI\./);
  const protocols = renderToStaticMarkup(React.createElement(TunnelProtocolsSection));
  assert.match(protocols, /id="tunnel-protocols-title"/);
  assert.match(protocols, /href="\/docs\/protocols"/);
  for (const command of ["outray http 3000", "outray tcp 5432", "outray udp 5000"]) assert.ok(protocols.includes(command));
  assert.equal((protocols.match(/aria-label="Copy (?:HTTP|TCP|UDP) tunnel command"/g) ?? []).length, 3);
  assert.match(protocols, /Raw TCP and UDP services still need their own authentication and encryption/);
  assert.doesNotMatch(protocols, /--protocol|--tcp|--udp/);
});

test("the sample request model keeps eight deterministic rows and stable monotonically increasing identities", () => {
  const initial = createInitialTunnelLogs();
  const fresh = createInitialTunnelLogs();
  assert.deepEqual(initial, fresh);
  assert.notEqual(initial, fresh);
  assert.notEqual(initial[0], fresh[0]);
  assert.deepEqual(initial.map(({ id }) => id), [0, 1, 2, 3, 4, 5, 6, 7]);
  const original = initial.map((log) => ({ ...log }));
  let logs = initial;
  for (let count = 1; count <= 100; count++) {
    const previous = logs;
    logs = advanceTunnelLogs(logs);
    assert.equal(logs.length, 8);
    assert.notEqual(logs, previous);
    assert.deepEqual(logs.slice(0, -1), previous.slice(1));
    const newest = logs.at(-1)!;
    const { id, ...sample } = newest;
    assert.equal(id, count + 7);
    assert.deepEqual(sample, SAMPLE_TUNNEL_LOGS[id % SAMPLE_TUNNEL_LOGS.length]);
  }
  assert.deepEqual(initial, original, "advancing the stream cannot mutate a previous render");
  assert.deepEqual(logs.map(({ id }) => id), [100, 101, 102, 103, 104, 105, 106, 107]);
  assert.deepEqual(advanceTunnelLogs([]), [{ ...SAMPLE_TUNNEL_LOGS[0], id: 0 }]);
});

test("the terminal stream pauses offscreen, in a hidden tab, and via its accessible control", async () => {
  const harness = await terminalHarness();
  try {
    harness.render();
    assert.equal(harness.intervals.size, 0, "no timer is created before motion/visibility checks complete");
    harness.commit();
    harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 0, "the offscreen section remains idle");
    harness.intersect(true);
    let tree = harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 1);
    assert.ok([...harness.intervals.values()][0].delay >= 1000, "illustrative arrivals do not flood the UI");
    harness.tick();
    tree = harness.render(); harness.commit();
    const rows = terminalElements(tree).filter((element) => element.type === "tr" && "data-new" in element.props);
    assert.equal(rows.length, 8);
    assert.equal(rows.filter((row) => row.props["data-new"] === true).length, 1);
    assert.equal(rows.at(-1)?.key, "8");

    terminalElements(tree).find((element) => element.props["aria-label"] === "Pause request stream")!.props.onClick();
    tree = harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 0);
    terminalElements(tree).find((element) => element.props["aria-label"] === "Resume request stream")!.props.onClick();
    harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 1);

    harness.setHidden(true); harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 0);
    harness.setHidden(false); harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 1);
    harness.intersect(false); harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 0);
    harness.intersect(true); harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 1);
  } finally { harness.dispose(); }
  assert.equal(harness.intervals.size, 0);
  assert.equal(harness.mediaListeners.size, 0);
  assert.equal(harness.visibilityListeners.size, 0);
  assert.ok(harness.observers.every((observer) => observer.disconnected));
  const writes = harness.writes;
  harness.tick(); harness.setHidden(true); harness.intersect(true); harness.setReduced(true);
  assert.equal(harness.writes, writes, "disposed effects cannot update an unmounted terminal");
});

test("the terminal respects initial and changing reduced-motion preferences with a static preview", async () => {
  const harness = await terminalHarness({ reduced: true });
  try {
    harness.render(); harness.commit(); harness.intersect(true);
    let tree = harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 0);
    assert.ok(terminalElements(tree).some((element) => element.props.children === "Static preview"));
    assert.ok(!terminalElements(tree).some((element) => element.props["aria-label"] === "Pause request stream"));
    harness.setReduced(false); harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 1);
    harness.setReduced(true); tree = harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 0);
    assert.ok(terminalElements(tree).some((element) => element.props.children === "Static preview"));
  } finally { harness.dispose(); }
  const source = await readFile(new URL("../src/landing/products/TunnelTerminal.tsx", import.meta.url), "utf8");
  assert.match(source, /motion-reduce:animate-none/);
});

test("the terminal works without IntersectionObserver but still waits for a visible document", async () => {
  const harness = await terminalHarness({ hasObserver: false, hidden: true });
  try {
    harness.render(); harness.commit(); harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 0);
    harness.setHidden(false); harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 1);
    assert.equal(harness.observers.length, 0);
  } finally { harness.dispose(); }
  assert.equal(harness.intervals.size, 0);
});

test("Tunnels-only hero, workflow and feature dependencies are composed by its route, not the shared product page", async () => {
  const shared = await readFile(new URL("../src/landing/products/ProductPage.tsx", import.meta.url), "utf8");
  const tunnelRoute = await readFile(new URL("../src/routes/products.tunnels.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(shared, /from ["'][^"']*Tunnel[^"']*["']|motion\/react|components\/arc\/copy-button/);
  assert.match(tunnelRoute, /import\s*\{\s*TunnelHero\s*\}\s*from ["'][^"']*TunnelHero["']/);
  assert.match(tunnelRoute, /<ProductPage\s+product="tunnels"/);
  assert.match(tunnelRoute, /hero=\{<TunnelHero\s*\/>\}/);
  assert.match(tunnelRoute, /className="\[--accent:#888\][^"]+"/, "the route scopes neutral accent variables to the Tunnels page only");
  assert.match(tunnelRoute, /import\s*\{\s*TunnelTerminalSection\s*\}\s*from ["'][^"']*TunnelTerminal["']/);
  assert.match(tunnelRoute, /workflow=\{<TunnelTerminalSection\s*\/>\}/);
  assert.match(tunnelRoute, /import\s*\{\s*TunnelFeatureSections\s*\}\s*from ["'][^"']*TunnelFeatureSections["']/);
  assert.match(tunnelRoute, /sections=\{<TunnelFeatureSections\s*\/>\}/);
  assert.match(shared, /sections\?:\s*ReactNode/);
  for (const product of productIds.filter((id) => id !== "tunnels")) {
    const route = await readFile(new URL(`../src/routes/products.${product}.tsx`, import.meta.url), "utf8");
    assert.doesNotMatch(route, /TunnelHero|TunnelTerminal|TunnelFeatureSections|TunnelDeveloperExperience|TunnelAddressSections/);
  }
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
  assert.match(navigation, /to: "\/\$orgSlug\/tunnel"/);
  assert.match(navigation, /params: \{ orgSlug: dashboardOrganization.slug \}/);
  assert.match(navigation, /Dashboard/);
  for (const source of [navigation, footer]) {
    assert.ok(source.includes('to="/"'));
    assert.match(source, /aria-label="OutRay home"/);
    assert.ok(source.includes('to="/products"'));
    for (const product of productIds) assert.ok(source.includes(`/products/${product}`));
  }
  for (const product of productIds) {
    assert.ok(stories.includes(`to="/products/${product}"`));
    assert.match(stories, new RegExp(`params=\\{\\{\\s*_splat: "${product}"\\s*\\}\\}`));
  }
  assert.match(stories, /to="\/docs\/\$"/);
});

test("all product routes use the Tailwind layout and declare their own metadata", async () => {
  const layoutRoute = await readFile(new URL("../src/routes/products.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../src/landing/products/ProductLayout.tsx", import.meta.url), "utf8");
  const globalCss = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
  assert.doesNotMatch(layoutRoute, /\.css\?url/);
  assert.match(layoutRoute, /component: ProductLayout/);
  assert.match(layout, /min-h-screen/);
  assert.doesNotMatch(layout, /pd-product-nav/);
  assert.match(globalCss, /^@import "tailwindcss";/);
  for (const product of productIds) {
    const route = await readFile(new URL(`../src/routes/products.${product}.tsx`, import.meta.url), "utf8");
    assert.ok(route.includes(`createFileRoute("/products/${product}")`));
    assert.ok(route.includes(`productPageHead("${product}")`));
  }
});
