import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Link, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { ProductPage } from "../src/landing/products/ProductPage";
import { TunnelHero } from "../src/landing/products/TunnelHero";
import { TunnelTerminalSection, SAMPLE_TUNNEL_LOGS, createInitialTunnelLogs, advanceTunnelLogs } from "../src/landing/products/TunnelTerminal";
import { TunnelFeatureSections } from "../src/landing/products/TunnelFeatureSections";
import { TunnelDeveloperExperience, TUNNEL_PLUGINS, tunnelPluginIndexFromKey, tokenizeTunnelCode } from "../src/landing/products/TunnelDeveloperExperience";
import { TunnelDomainSection, TunnelLocalSection, TunnelProtocolsSection } from "../src/landing/products/TunnelAddressSections";
import { TunnelNetworkDiagram } from "../src/landing/products/TunnelNetworkDiagram";
import { ObservabilityHero } from "../src/landing/products/ObservabilityHero";
import { ObservabilityRequestStory } from "../src/landing/products/ObservabilityRequestStory";
import { ObservabilityFeatureSections } from "../src/landing/products/ObservabilityFeatureSections";
import { SecretsHero } from "../src/landing/products/SecretsHero";
import { SecretsEnvironmentSection } from "../src/landing/products/SecretsEnvironmentSection";
import { SecretsProblemSection } from "../src/landing/products/SecretsProblemSection";
import { SecretsFeatureSections } from "../src/landing/products/SecretsFeatureSections";
import { UptimeHero } from "../src/landing/products/UptimeHero";
import { UptimeFeatureSections } from "../src/landing/products/UptimeFeatureSections";
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
    } : product === "observability" ? {
      className: "[--accent:#888] [--accent-deep:#444] [--accent-light:#d4d4d4] [--accent-rgb:160_160_160]",
      hero: React.createElement(ObservabilityHero),
      workflow: React.createElement(ObservabilityRequestStory),
      sections: React.createElement(ObservabilityFeatureSections),
    } : product === "secrets" ? {
      className: "[--accent:#888] [--accent-deep:#444] [--accent-light:#d4d4d4] [--accent-rgb:160_160_160]",
      hero: React.createElement(SecretsHero),
      workflow: React.createElement(React.Fragment, null, React.createElement(SecretsProblemSection), React.createElement(SecretsEnvironmentSection)),
      sections: React.createElement(SecretsFeatureSections),
    } : product === "uptime" ? {
      className: "[--accent:#888] [--accent-deep:#444] [--accent-light:#d4d4d4] [--accent-rgb:160_160_160]",
      hero: React.createElement(UptimeHero),
      workflow: React.createElement(React.Fragment),
      sections: React.createElement(UptimeFeatureSections),
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
      else if (product === "observability") assert.match(html, /Know what.*happened\..*And why\./);
      else if (product === "secrets") assert.match(html, /Your app needs.*secrets\..*Your codebase.*doesn[’']t\./);
      else if (product === "uptime") assert.match(html, /Catch downtime\..*Keep their.*trust\./);
      else assert.ok(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").includes(products[product].title));
      assert.ok(html.includes(`href="/docs/${product}"`));
      assert.doesNotMatch(html, /aria-label="Product pages"|pd-product-nav/);
      assert.ok(html.includes('href="/signup"'));
      assert.match(html, /Get started/);
      if (product === "uptime") assert.doesNotMatch(html, /Illustrative interface · sample data|id="workflow-title"|id="capabilities-title"|id="use-cases-title"/);
      assert.equal(products[product].workflow.steps.length, 3);
      assert.equal(products[product].capabilities.length, 4);
      assert.equal(products[product].useCases.length, 3);
      if (product === "uptime") {
        const fallback = renderToStaticMarkup(React.createElement(ProductPage, { product }));
        const next = products[product].next;
        assert.ok(fallback.includes(`href="/products/${next}"`));
        assert.ok(fallback.includes(`Explore ${products[next].name}`));
        assert.equal((fallback.match(/href="\/products\/[^"]+"/g) ?? []).length, 1, "the generic fallback keeps its connected-product content link");
      }
      for (const other of productIds.filter((id) => id !== product)) assert.ok(!html.includes(products[other].title));
    }
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
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
  assert.match(hero, /aria-label="Public address connected through OutRay to localhost port 3000"/, "the portal retains a descriptive accessible label");
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
  assert.match(hero, /<figure\b[^>]*aria-label="Public address connected through OutRay to localhost port 3000"/);
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

test("the dedicated tunnel hero is isolated from the other product heroes", () => {
  for (const product of productIds.filter((id) => id !== "tunnels")) {
    const html = renderToStaticMarkup(productPage(product));
    if (product === "observability") assert.match(html, /Know what.*happened\..*And why\./);
    else if (product === "secrets") assert.match(html, /Your app needs.*secrets\..*Your codebase.*doesn[’']t\./);
    else if (product === "uptime") assert.match(html, /Catch downtime\..*Keep their.*trust\./);
    else assert.ok(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").includes(products[product].title));
    assert.doesNotMatch(html, /Localhost,.*meet the world\.|Start tunneling/);
    if (product === "uptime") assert.doesNotMatch(html, /Illustrative interface · sample data/);
  }
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
    assert.match(source, name === "sections" ? /bg-white/ : /bg-\[#(?:0[589]|11|15|19|1d|20|29)[0-9a-f]*\]/i,
      `${name} keeps explicit solid surface fills`);
  }
  assert.doesNotMatch(files.sections, /bg-\[(?:linear|radial)-gradient/, "the final CTA has no neutral wash");
  assert.match(files.network, /bg-\[radial-gradient\([^\]]*var\(--node-rgb\)/, "colored node glows remain decorative, not card shading");
  assert.match(files.network, /bg-\[linear-gradient\(/, "the colored connection track and packet trail remain intact");
  assert.doesNotMatch(files.address, /function LocalDevices\b/, "the refreshed local section no longer renders the removed device illustration");
  assert.match(files.hero, /<linearGradient\b/, "the decorative portal keeps its illustrated light");
});

test("Tunnels removes section eyebrows, including the hero product label, without removing other products' copy", () => {
  const html = renderToStaticMarkup(productPage("tunnels"));
  assert.doesNotMatch(html, /class="[^"]*\beyebrow\b/);
  for (const label of [
    "OutRay Tunnels", "STRAIGHT TO YOUR TERMINAL", "BUILT FOR YOUR WORKFLOW", "NO PORT FORWARDING. NO DEPLOYMENT.",
    "YOUR ADDRESS. YOUR NAME.", "BEYOND YOUR BROWSER", "NOT JUST WEBSITES", "OPEN SOURCE. NOT A BLACK BOX.", "LOCAL APP. PUBLIC POSSIBILITIES.",
  ]) assert.ok(!html.includes(label), `Removed section eyebrow: ${label}`);
  for (const product of productIds.filter((id) => id === "uptime")) {
    const other = renderToStaticMarkup(React.createElement(ProductPage, { product }));
    assert.ok(other.includes(`OUTRAY ${products[product].name.toUpperCase()}`));
  }
});

test("the Tunnels page removes demo disclaimers without changing addresses or other product sample captions", () => {
  const html = renderToStaticMarkup(productPage("tunnels"));
  assert.doesNotMatch(html, />(?:Example|EXAMPLE|Sample|SAMPLE|Demo|DEMO)</, "standalone demo badges are absent");
  assert.doesNotMatch(html, /Illustrative (?:traffic|connection|devices|configuration|interface)|sample data|not a live tunnel|Static preview|Example · capture enabled|Showing example/,
    "visible and announced demo disclaimers stay removed");
  assert.doesNotMatch(html, /capture enabled/i, "the removed capture badge has no replacement status label");
  assert.doesNotMatch(html, /aria-label="[^"]*\b(?:Example|Sample|Illustrative)\b/i, "accessible panel names describe their content without demo labels");
  assert.match(html, /preview\.example\.com/, "domain examples are not mistaken for removable UI labels");
  assert.match(html, /demo(?:<[^>]+>)*\.outray\.app/, "the public address remains part of the portal and terminal");
  for (const product of productIds.filter((id) => id === "uptime")) {
    const other = renderToStaticMarkup(React.createElement(ProductPage, { product }));
    assert.match(other, /Illustrative interface · sample data/, "sample captions on untouched product pages remain");
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
    if (component !== "TunnelNetworkDiagram") assert.equal((source.match(/<svg\b/g) ?? []).length, component === "TunnelHero" ? 1 : 0,
      `${component} keeps custom SVG only for the portal/device illustration, never a UI glyph`);
    assert.doesNotMatch(source, /styles\.eyebrow/);
  }
});

test("the request stream follows the tunnel hero with deterministic HTTP traffic and no demo disclaimers", () => {
  const first = renderToStaticMarkup(React.createElement(TunnelTerminalSection));
  assert.equal(first, renderToStaticMarkup(React.createElement(TunnelTerminalSection)), "SSR output does not depend on a clock or random traffic");
  assert.match(first, /Every request\. As it arrives\./);
  assert.match(first, /role="region" aria-label="Tunnel terminal"/);
  assert.doesNotMatch(first, />Example<|>Example<\/span>|Illustrative traffic · not a live tunnel\./);
  assert.match(first, /<table[^>]*aria-label="HTTP requests"[^>]*aria-live="off"/);
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

test("the request stream removes its outer divider without removing the terminal window borders or stream controls", () => {
  const html = renderToStaticMarkup(React.createElement(TunnelTerminalSection));
  const section = html.match(/<section\b[^>]*class="([^"]+)"[^>]*>/)?.[1];
  assert.ok(section);
  assert.doesNotMatch(section, /(?:^|\s)border-t(?:\s|$)|border-\[#202020\]/, "no divider remains above the request-stream heading");
  const panel = html.match(/<div\b[^>]*class="([^"]+)"[^>]*role="region"[^>]*aria-label="Tunnel terminal"/)?.[1];
  assert.ok(panel);
  assert.match(panel, /(?:^|\s)border(?:\s|$)/, "the terminal window retains its frame");
  assert.match(panel, /border-\[#3b3b3b\]/);
  assert.match(html, /border-b border-\[#363636\]/, "the terminal title bar retains its divider");
  assert.match(html, /border-t border-\[#292929\]/, "the terminal footer retains its divider");
  assert.match(html, /aria-label="Pause request stream"/, "only the separate connection-animation controls are removed");
});

test("the new request stream does not replace untouched product fallback workflows", () => {
  for (const product of productIds.filter((id) => id === "uptime")) {
    const html = renderToStaticMarkup(React.createElement(ProductPage, { product }));
    assert.ok(html.includes(products[product].workflow.title));
    assert.match(html, /<pre\b[^>]*tabindex="0"[^>]*aria-label=/);
    assert.match(html, /id="capabilities-title"|id="use-cases-title"/);
    assert.ok(html.includes(`Explore ${products[products[product].next].name}`));
    assert.doesNotMatch(html, /tunnel-developer-title|tunnel-domain-title|tunnel-local-title|tunnel-protocols-title|tunnel-open-source-title|tunnel-start-title/);
    assert.doesNotMatch(html, /Every request\. As it arrives\.|aria-label="Tunnel terminal"|Pause request stream/);
  }
});

test("the full Tunnels page presents its new feature sections in order and retains real action destinations", () => {
  const html = renderToStaticMarkup(productPage("tunnels"));
  const expected = [
    "tunnel-developer-title", "tunnel-connection-title", "tunnel-domain-title", "tunnel-local-title",
    "tunnel-protocols-title", "tunnel-start-title",
  ];
  const headings = [...html.matchAll(/<h2\b[^>]*id="(tunnel-[^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(headings, expected);
  assert.ok(html.indexOf("Every request. As it arrives.") < html.indexOf('id="tunnel-developer-title"'));
  assert.doesNotMatch(html, /id="capabilities-title"|id="use-cases-title"|id="connected-title"|id="start-title"/);
  for (const destination of ["/docs/tunnels", "/docs/custom-domains", "/docs/cli-reference#options", "/signup"]) {
    assert.ok(html.includes(`href="${destination}"`), `Missing destination: ${destination}`);
  }
  assert.doesNotMatch(html, /tunnel-open-source-title|Built in the open\.|Yours to run\.|Inspect every layer|Make it better, together|Run it on your terms/,
    "the removed open-source section no longer appears in the tunnel feature sequence");
  assert.match(html, /No deployment\.|doesn’t deploy your app/);
  const cta = html.match(/<section\b[^>]*aria-labelledby="tunnel-start-title"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(cta);
  assert.match(cta, /Keep building locally\..*Let the world in\./);
  assert.match(cta, /href="\/signup"[^>]*>Get started/);
  assert.match(cta, /href="\/docs\/tunnels"[^>]*>Read the docs/);
});

test("Tunnels has no section or protocol-column dividers while retaining the UI panel frames", () => {
  const html = renderToStaticMarkup(productPage("tunnels"));
  const sectionClasses = [...html.matchAll(/<section\b[^>]*class="([^"]+)"[^>]*>/g)].map((match) => match[1]);
  assert.ok(sectionClasses.length >= 8, "the hero, request stream, and feature sections remain");
  for (const classes of sectionClasses) {
    assert.doesNotMatch(classes, /(?:^|[\s:])(?:border(?:[-\s]|$)|divide-[xy](?:[-\s]|$))/,
      "top-level product sections no longer use separating borders or divide classes");
  }
  assert.doesNotMatch(html, /<hr\b/, "no standalone decorative divider replaces the removed section lines");

  const protocols = renderToStaticMarkup(React.createElement(TunnelProtocolsSection));
  const grid = protocols.match(/<div\b[^>]*class="([^"]*\bgrid-cols-3\b[^"]*)"[^>]*>/)?.[1];
  assert.ok(grid);
  const articleClasses = [...protocols.matchAll(/<article\b[^>]*class="([^"]+)"[^>]*>/g)].map((match) => match[1]);
  assert.equal(articleClasses.length, 3);
  assert.doesNotMatch(grid, /(?:^|[\s:])(?:border(?:[-\s]|$)|divide-[xy](?:[-\s]|$))/,
    "the protocol grid has no outer separator");
  for (const classes of articleClasses) {
    assert.doesNotMatch(classes, /(?:^|[\s:])(?:border-[tblryx](?:[-\s]|$)|divide-[xy](?:[-\s]|$))/,
      "protocol card outlines do not reintroduce directional or responsive separators");
  }

  const developer = renderToStaticMarkup(React.createElement(TunnelDeveloperExperience));
  assert.match(developer, /overflow-hidden rounded-\[9px\] border border-\[#363636\]/, "integration code windows retain their frames");
  assert.match(developer, /rounded-2xl border border-\[#353535\]/, "developer cards retain their frames");
  const local = renderToStaticMarkup(React.createElement(TunnelLocalSection));
  const localPanel = local.match(/<figure\b[^>]*class="([^"]+)"[^>]*aria-label="Local-network tunnel terminal"/)?.[1];
  assert.ok(localPanel);
  assert.match(localPanel, /(?:^|\s)border(?:\s|$)/, "the local terminal keeps its frame");
  assert.match(local, /border-b border-\[#242424\]/, "its title bar divider remains part of the terminal UI");
});

test("the connection section retains the four animated stages without their captions, addresses, or footer controls", async () => {
  const html = renderToStaticMarkup(productPage("tunnels"));
  const connection = html.match(/<section\b[^>]*aria-labelledby="tunnel-connection-title"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(connection);
  assert.match(connection, /It just works\./);
  const stages = [...connection.matchAll(/<h3\b[^>]*>([^<]+)<\/h3>/g)].map((match) => match[1]);
  assert.deepEqual(stages, ["Localhost", "Secure tunnel", "OutRay Edge", "Public Internet"]);
  for (const removed of [
    "Your local server, still on your machine.", "A TLS-protected outbound connection.",
    "Routes public traffic to your local app.", "A public address, ready to share.",
    "localhost:3000", "No port forwarding</span>", "The connection in between", "demo.outray.app",
    "Illustrative connection.", "Keep your app and CLI running to stay connected.",
    "How the connection works", "Pause connection animation", "Resume connection animation", "Static diagram",
  ]) assert.ok(!connection.includes(removed), `Removed connection content: ${removed}`);
  assert.doesNotMatch(connection, /<button\b|<a\b|href="\/docs\/architecture"/, "the diagram no longer has a footer link or manual motion controls");
  assert.match(connection, /Your app stays on your machine\. OutRay connects it to the world\./, "the section's introductory copy remains");
  const stageBodies = [...connection.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1]);
  assert.equal(stageBodies.length, 4);
  for (const stage of stageBodies) {
    assert.match(stage, /<svg\b/, "each stage retains its Hugeicons illustration");
    assert.doesNotMatch(stage, /<p\b|font-mono/, "stage descriptions and colored address labels stay removed");
  }
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
  assert.match(globalCss, /@keyframes packet-vertical/);
  assert.match(globalCss, /@keyframes node-glow/);
  assert.match(globalCss, /@keyframes node-pulse/);
  for (const animation of ["packet-horizontal", "node-glow", "node-pulse"]) assert.match(diagramSource, new RegExp(`animate-\\[${animation}_`));
  assert.match(diagramSource, /\[animation-play-state:paused\]/);
  assert.match(diagramSource, /data-motion=\{running \? "running" : "paused"\}/);
  assert.match(diagramSource, /motion-reduce:animate-none/);
  assert.doesNotMatch(diagramSource, /\bsetPaused\b|\[paused,/, "removed connection controls leave no unused manual-pause state");
  assert.match(diagramSource, /max-\[760px\]:h-\[calc\(100%-72px\)\]/, "the mobile connector ends at the final icon's center");
  assert.match(diagramSource, /max-\[760px\]:h-(?:\[72px\]|18)/, "mobile stages match their 72px icon height");
  assert.match(diagramSource, /max-\[760px\]:(?:self-center|items-center)/, "the mobile titles remain vertically centered beside their icons");
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

test("the network animation still pauses offscreen and in hidden tabs without a manual control or JS loop", async () => {
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
    assert.ok(!terminalElements(tree).some((element) => element.type === "button"), "connection animation has no manual controls");
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

test("the developer section explains its tools with accessible framework panels and request details", () => {
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
    assert.ok(!("install" in plugin), "removed installer rows leave no unused install-command metadata");
    assert.match(plugin.code, /process\.env\.OUTRAY_API_KEY/);
  }
  assert.doesNotMatch(html, /npm install (?:--save-dev )?@outray\/(?:vite|next|express)/);
  assert.doesNotMatch(html, /Use a server-side token with tunnel access\. Never expose it in client code\./);
  assert.doesNotMatch(html, /Example · capture enabled/);
  assert.match(html, /aria-label="Tunnel requests"/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /aria-label="Selected request"/);
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
    const plugin = TUNNEL_PLUGINS.find((plugin) => plugin.id === id)!;
    assert.ok(text.includes(plugin.file), "the selected integration's code window remains");
    assert.ok(text.includes(`href="${plugin.docs}"`), "the selected integration retains its setup guide");
    assert.match(text, /process\.env\.OUTRAY_API_KEY/, "examples still read the token from server-side environment variables");
    assert.doesNotMatch(text, /npm install/);
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
  assert.match(html, /aria-label="Selected request"[\s\S]*503 Unavailable/);
  assert.match(html, /aria-label="Selected request"[\s\S]*database/);
  assert.doesNotMatch(html, /payment\.completed/);
  assert.doesNotMatch(html, /Example · capture enabled|Showing example/);
  assert.match(html, /role="status">Showing GET \/api\/health, 503 Unavailable, 12 ms\./, "request selection still has an accessible status announcement");
});

test("the protocols use three concise flat cards with distinct Hugeicons accents, copy controls, and reduced-motion support", async () => {
  const html = renderToStaticMarkup(React.createElement(TunnelProtocolsSection));
  const cards = [...html.matchAll(/<article\b([^>]+)>([\s\S]*?)<\/article>/g)];
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map(([, , body]) => body.match(/<h3\b[^>]*>([^<]+)<\/h3>/)?.[1]), ["HTTP/HTTPS", "TCP Tunnels", "UDP Tunnels"]);
  assert.deepEqual(cards.map(([, , body]) => body.match(/<p\b[^>]*>([^<]+)<\/p>/)?.[1]), [
    "Secure URLs for local web servers, webhooks, and APIs.",
    "Expose databases, SSH, RDP, and other TCP services.",
    "Connect game servers, streaming, and real-time apps.",
  ]);
  const commands = ["outray http 3000", "outray tcp 5432", "outray udp 5000"];
  const copyLabels = ["Copy HTTP tunnel command", "Copy TCP tunnel command", "Copy UDP tunnel command"];
  cards.forEach(([, attributes, body], index) => {
    const classes = attributes.match(/\bclass="([^"]+)"/)?.[1];
    assert.ok(classes);
    assert.match(classes, /(?:^|\s)border(?:\s|$)/, "each protocol has its own full card outline");
    assert.match(classes, /rounded-(?:\[[\d.]+px\]|xl|2xl|3xl)/);
    assert.match(classes, /bg-\[#[\da-f]+\]/i, "protocol cards retain flat surface fills");
    assert.doesNotMatch(classes, /gradient/i, "card surfaces are not gradient-washed");
    assert.match(classes, /motion-reduce:transition-none/);
    assert.equal((body.match(/<p\b/g) ?? []).length, 1, "the short description replaces the old use-case sublabel and long paragraph");
    assert.ok(body.includes(commands[index]));
    assert.ok(body.includes(`aria-label="${copyLabels[index]}"`));

    const badge = body.match(/<span\b([^>]+)>(<svg\b[\s\S]*?)<\/span>/);
    assert.ok(badge, "each protocol retains one decorative Hugeicons badge");
    assert.match(badge[1] + badge[2], /aria-hidden="true"/, "decorative protocol glyphs do not duplicate their headings");
    const badgeClasses = badge[1].match(/\bclass="([^"]+)"/)?.[1];
    assert.ok(badgeClasses);
    assert.match(badgeClasses, /bg-\[#[\da-f]+\]/i, "each badge has a restrained accent surface");
    const hex = badgeClasses.match(/text-\[#([\da-f]{6})\]/i)?.[1];
    assert.ok(hex);
    const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    if (index === 0) assert.ok(blue > red + 30 && blue > green, "HTTP's badge is blue");
    if (index === 1) assert.ok(blue > green + 25 && red > green + 25, "TCP's badge is purple");
    if (index === 2) assert.ok(red > green + 25 && green > blue + 25, "UDP's badge is orange");
  });
  assert.match(html, /grid-cols-3/);
  assert.match(html, /max-\[760px\]:grid-cols-1/, "the cards stack on small screens");
  assert.doesNotMatch(html, /href="\/docs\/protocols"|Choose your protocol|Raw TCP and UDP services still need their own authentication and encryption/,
    "the removed protocol footer does not reappear below the cards");
  const source = await readFile(new URL("../src/landing/products/TunnelAddressSections.tsx", import.meta.url), "utf8");
  assert.match(source, /Gamepad01Icon/);
  assert.match(source, /<HugeiconsIcon icon=\{(?:icon|protocol\.icon)\}/, "the protocol glyphs use the shared Hugeicons rendering component");
  assert.doesNotMatch(source, /use: "Web apps, APIs, webhooks"|use: "Databases, SSH, socket services"|use: "Games, datagrams, real-time services"/,
    "removed use-case sublabels leave no dead metadata");
});

test("the custom-domain copy is concise with circular purple Hugeicons checks while its DNS example stays intact", async () => {
  const html = renderToStaticMarkup(React.createElement(TunnelDomainSection));
  const left = html.slice(0, html.indexOf("<figure"));
  assert.ok(left);
  const heading = left.match(/<h2\b[^>]*id="tunnel-domain-title"[^>]*>([\s\S]*?)<\/h2>/)?.[1];
  assert.ok(heading);
  assert.equal(heading.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, ""), "Bring your own domain.");
  const lead = left.match(/<p\b[^>]*>([^<]+)<\/p>/)?.[1];
  assert.equal(lead, "Connect your own domain and get automatic HTTPS.");
  const list = left.match(/<ul\b[^>]*>([\s\S]*?)<\/ul>/)?.[1];
  assert.ok(list);
  const benefits = [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1].replace(/<[^>]+>/g, ""));
  assert.deepEqual(benefits, [
    "Automatic SSL/TLS certificates",
    "Simple CNAME configuration",
    "The same address when you reconnect",
  ]);
  const badges = [...list.matchAll(/<span\b([^>]+)>([\s\S]*?)<\/span>/g)].filter((match) => /<svg\b/.test(match[2]));
  assert.equal(badges.length, 3, "each benefit has one check badge");
  for (const [, attributes, body] of badges) {
    const classes = attributes.match(/\bclass="([^"]+)"/)?.[1];
    assert.ok(classes);
    assert.match(classes, /(?:^|\s)rounded-full(?:\s|$)/);
    assert.match(classes, /border-\[#a78bfa\]\/25/);
    assert.match(classes, /bg-\[#a78bfa\]\/7/);
    assert.match(classes, /text-\[#b695ff\]/);
    assert.match(attributes, /aria-hidden="true"/, "decorative badges do not duplicate the benefit labels");
    assert.match(body, /<svg\b[^>]*width="20"[^>]*height="20"/);
  }
  const source = await readFile(new URL("../src/landing/products/TunnelAddressSections.tsx", import.meta.url), "utf8");
  assert.match(source, /import Tick02Icon from "@outray\/icons\/stroke\/Tick02Icon"/);
  const check = source.match(/function Check\(\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(check);
  assert.match(check, /<HugeiconsIcon icon=\{Tick02Icon\}/, "the check glyph comes from the shared Hugeicons package");
  assert.match(left, /href="\/docs\/custom-domains"[^>]*>Connect a domain/);
  const sectionClasses = html.match(/<section\b[^>]*class="([^"]+)"/)?.[1];
  assert.ok(sectionClasses);
  assert.doesNotMatch(sectionClasses, /(?:^|[\s:])(?:border(?:[-\s]|$)|divide-[xy](?:[-\s]|$))/);

  const figure = html.match(/<figure\b[^>]*aria-label="Custom-domain DNS configuration"[^>]*>([\s\S]*?)<\/figure>/)?.[1];
  assert.ok(figure, "the right-hand DNS configuration example remains");
  assert.match(figure, /border-b border-\[#353535\]/, "the DNS panel retains its own title-bar border");
  assert.match(figure, /<span>CNAME<\/span>Route visitors/);
  assert.match(figure, /<span>TXT<\/span>Verify ownership/);
  assert.match(figure, /_outray-challenge\.preview\.example\.com/);
  assert.match(figure, /Workspace-provided target/);
  assert.match(figure, /outray 3000 --domain preview\.example\.com/);
  assert.match(figure, /aria-label="Copy custom domain command"/);
  assert.doesNotMatch(figure, /<figcaption\b|>EXAMPLE</);
});

test("custom-domain, local-device and protocol sections use supported commands and describe their real boundaries", () => {
  const domain = renderToStaticMarkup(React.createElement(TunnelDomainSection));
  assert.match(domain, /id="tunnel-domain-title"/);
  assert.match(domain, /href="\/docs\/custom-domains"/);
  assert.match(domain, /outray 3000 --domain preview\.example\.com/);
  assert.match(domain, /aria-label="Copy custom domain command"/);
  assert.match(domain, /_outray-challenge\.preview\.example\.com/);
  assert.match(domain, /Workspace-provided target/);
  assert.doesNotMatch(domain, /Illustrative configuration\. Copy the exact DNS records from your workspace\./);
  const local = renderToStaticMarkup(React.createElement(TunnelLocalSection));
  assert.match(local, /id="tunnel-local-title"/);
  const localHeading = local.match(/<h2\b[^>]*id="tunnel-local-title"[^>]*>([\s\S]*?)<\/h2>/)?.[1];
  assert.ok(localHeading);
  assert.equal(localHeading.replace(/<[^>]+>/g, ""), "Unlimited .local domains");
  assert.match(local, /href="\/docs\/cli-reference#options"/);
  assert.match(local, /outray 3000 --local/);
  assert.match(local, /aria-label="Copy local network command"/);
  assert.match(local, /aria-label="Local-network tunnel terminal"/);
  assert.match(local, /https:\/\/my-app\.outray\.app/);
  assert.match(local, /https:\/\/my-app\.local/);
  const localFeatureTitles = [...local.matchAll(/<h3\b[^>]*>([^<]+)<\/h3>/g)].map((match) => match[1]);
  assert.deepEqual(localFeatureTitles, ["mDNS Discovery", "Trusted HTTPS", "Zero Config"]);
  assert.match(local, /Test on any device in your network\./);
  const localDescriptions = [...local.matchAll(/<li\b[^>]*>[\s\S]*?<p\b[^>]*>([^<]+)<\/p>[\s\S]*?<\/li>/g)].map((match) => match[1]);
  assert.deepEqual(localDescriptions, [
    "Auto-discovered by all devices via Bonjour/Avahi",
    "Automatic certificates with mkcert - no browser warnings",
    "No port forwarding, no firewall rules, no DNS setup",
  ]);
  assert.doesNotMatch(local, /Illustrative laptop, tablet, and phone|<figcaption\b|Hello, network\.|ONE APP, SAME NETWORK/);
  assert.doesNotMatch(local, /Illustrative devices\. Use the local address printed by the CLI\./);
  const protocols = renderToStaticMarkup(React.createElement(TunnelProtocolsSection));
  assert.match(protocols, /id="tunnel-protocols-title"/);
  assert.doesNotMatch(protocols, /href="\/docs\/protocols"|Choose your protocol/);
  for (const command of ["outray http 3000", "outray tcp 5432", "outray udp 5000"]) assert.ok(protocols.includes(command));
  assert.equal((protocols.match(/aria-label="Copy (?:HTTP|TCP|UDP) tunnel command"/g) ?? []).length, 3);
  assert.doesNotMatch(protocols, /Raw TCP and UDP services still need their own authentication and encryption/);
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

test("the terminal respects initial and changing reduced-motion preferences without extra preview labels or controls", async () => {
  const harness = await terminalHarness({ reduced: true });
  try {
    harness.render(); harness.commit(); harness.intersect(true);
    let tree = harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 0);
    assert.ok(!terminalElements(tree).some((element) => element.props.children === "Static preview"));
    assert.ok(!terminalElements(tree).some((element) => element.props["aria-label"] === "Pause request stream"));
    harness.setReduced(false); harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 1);
    harness.setReduced(true); tree = harness.render(); harness.commit();
    assert.equal(harness.intervals.size, 0);
    assert.ok(!terminalElements(tree).some((element) => element.props.children === "Static preview"));
    assert.ok(!terminalElements(tree).some((element) => element.props["aria-label"] === "Pause request stream"));
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
  for (const product of productIds) {
    const head = productPageHead(product, "https://outray.dev");
    const expectedTitle = `${products[product].name} — OutRay`;
    const expectedUrl = `https://outray.dev/products/${product}`;
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
    assert.doesNotMatch(source, /to=["']\/products["']/);
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
