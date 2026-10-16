import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Link, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { ProductPage } from "../src/landing/products/ProductPage";
import { UptimeHero } from "../src/landing/products/UptimeHero";
import { UptimeFeatureSections, UptimeIncidentFlow, UptimeStatusPagePreview, UptimeNotificationPreview, UPTIME_INCIDENT_STAGES, UPTIME_PUBLIC_COMPONENTS, uptimeIncidentIndexFromKey } from "../src/landing/products/UptimeFeatureSections";
import { products } from "../src/landing/products/content";

Object.assign(globalThis, { React });

function renderToStaticMarkup(component: React.ReactNode) {
  const root = createRootRoute();
  const signup = createRoute({ getParentRoute: () => root, path: "signup" });
  const docs = createRoute({ getParentRoute: () => root, path: "docs/$" });
  const product = createRoute({ getParentRoute: () => root, path: "products/$" });
  const router = createRouter({ routeTree: root.addChildren([signup, docs, product]), history: createMemoryHistory({ initialEntries: ["/"] }), isServer: true });
  return renderMarkup(React.createElement(RouterContextProvider, { router, children: component }));
}

function uptimePage() {
  return React.createElement(ProductPage, {
    product: "uptime",
    className: "[--accent:#888] [--accent-deep:#444] [--accent-light:#d4d4d4] [--accent-rgb:160_160_160]",
    hero: React.createElement(UptimeHero),
    workflow: React.createElement(React.Fragment),
    sections: React.createElement(UptimeFeatureSections),
  });
}

type Element = React.ReactElement<Record<string, any>>;

function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

function textContent(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  return React.isValidElement(node) ? textContent((node as Element).props.children) : "";
}

/** Execute actual feature state and handlers; only icons remain inert. */
async function interactionHarness(file: "UptimeFeatureSections", exportName: string) {
  const source = await readFile(new URL(`../src/landing/products/${file}.tsx`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const hooks: unknown[] = [];
  let slot = 0, focused: string | undefined;
  const react = {
    ...React,
    useId: () => `test-${file.toLowerCase()}`,
    useState(initial: unknown) {
      const index = slot++;
      if (!(index in hooks)) hooks[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks[index], (value: unknown) => { hooks[index] = typeof value === "function" ? (value as (previous: unknown) => unknown)(hooks[index]) : value; }];
    },
    useRef(initial: unknown) { const index = slot++; return hooks[index] ??= { current: initial }; },
    useMemo(callback: () => unknown) { slot++; return callback(); },
  };
  const module = { exports: {} as Record<string, () => React.ReactNode> };
  const Icon = () => null;
  runInNewContext(compiled, {
    React: react, module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "react") return react;
      if (specifier === "@tanstack/react-router") return { Link };
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: Icon };
      if (specifier.startsWith("@outray/icons/")) return { __esModule: true, default: [] };
      if (specifier.endsWith(".css")) return { default: new Proxy({}, { get: (_target, name) => String(name) }), __esModule: true };
      throw new Error(`Unexpected Uptime marketing dependency: ${specifier}`);
    },
  });
  return {
    get focused() { return focused; },
    render() {
      slot = 0;
      const tree = module.exports[exportName]();
      for (const element of elements(tree)) {
        if (element.type === "button" && typeof element.props.ref === "function") element.props.ref({ focus() { focused = element.props.id ?? element.props["aria-label"]; } });
      }
      return tree;
    },
  };
}

test("the dedicated Uptime route composes its complete story without fetching organization data", (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("Public marketing cannot request live monitors"); });
  const html = renderToStaticMarkup(uptimePage());
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /Catch downtime\..*Keep their.*trust\./);
  assert.deepEqual([...html.matchAll(/<h2\b[^>]*id="(uptime-[^"]+)"/g)].map((match) => match[1]), ["uptime-incident-title", "uptime-status-title", "uptime-notifications-title", "uptime-start-title"]);
  for (const destination of ["/signup", "/docs/uptime", "/docs/uptime/incidents", "/docs/uptime/status-page", "/docs/uptime/notifications"]) assert.ok(html.includes(`href="${destination}"`));
  assert.doesNotMatch(html, /id="(?:workflow|capabilities|use-cases|connected|start)-title"|THE WORKFLOW|BUILT IN|IN PRACTICE|BETTER TOGETHER|OUTRAY UPTIME/);
  assert.doesNotMatch(html, /Illustrative interface|sample data|Static preview|<pre\b|TCP|UDP|SMS|PagerDuty|multi.region|instant alert|guaranteed/i);
  assert.equal(requests, 0);
});

test("dedicated Uptime dependencies stay in its route and preserve generic fallback previews", async () => {
  const route = await readFile(new URL("../src/routes/products.uptime.tsx", import.meta.url), "utf8");
  const shared = await readFile(new URL("../src/landing/products/ProductPage.tsx", import.meta.url), "utf8");
  const preview = await readFile(new URL("../src/landing/products/ProductPreview.tsx", import.meta.url), "utf8");
  assert.match(route, /hero=\{<UptimeHero\s*\/>\}/);
  assert.match(route, /workflow=\{<>\s*<\/\s*>\}/);
  assert.match(route, /sections=\{<UptimeFeatureSections\s*\/>\}/);
  assert.match(route, /className="\[--accent:#888\][^"]+"/);
  assert.doesNotMatch(shared + preview, /from ["'][^"']*Uptime(?:Hero|FeatureSections)/);
  for (const product of ["tunnels", "observability", "secrets"]) {
    const other = await readFile(new URL(`../src/routes/products.${product}.tsx`, import.meta.url), "utf8");
    assert.doesNotMatch(other, /UptimeHero|UptimeFeatureSections/);
  }
  const fallback = renderToStaticMarkup(React.createElement(ProductPage, { product: "uptime" }));
  assert.ok(fallback.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").includes(products.uptime.title));
  assert.match(fallback, /Illustrative interface · sample data|id="workflow-title"/);
  assert.doesNotMatch(fallback, /Catch downtime\.|uptime-incident-title/);
});

test("Uptime glyphs use resolvable shared Hugeicons wrappers", async () => {
  for (const component of ["UptimeHero", "UptimeFeatureSections"]) {
    const source = await readFile(new URL(`../src/landing/products/${component}.tsx`, import.meta.url), "utf8");
    const ast = ts.createSourceFile(`${component}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imports = ast.statements.filter(ts.isImportDeclaration).map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text);
    const glyphs = imports.filter((path) => path.startsWith("@outray/icons/"));
    assert.ok(glyphs.length > 0);
    assert.ok(imports.includes("@hugeicons/react"));
    assert.ok(!imports.includes("lucide-react"));
    for (const glyph of glyphs) await assert.doesNotReject(() => readFile(new URL(`../../../packages/icons/generated/${glyph.replace("@outray/icons/", "")}.js`, import.meta.url)));
  }
});

test("the illustration-free Uptime hero preserves its headline, copy and real destinations", () => {
  const html = renderToStaticMarkup(React.createElement(UptimeHero));
  assert.equal(html, renderToStaticMarkup(React.createElement(UptimeHero)));
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /Catch downtime\..*Keep their.*trust\./);
  assert.match(html, /Know when your endpoints stop answering\. Keep your team informed and your users in the loop\./);
  assert.match(html, /href="\/signup"/);
  assert.match(html, /href="\/docs\/uptime"/);
  assert.match(html, /One-minute checks\. No SDK required\./);
  assert.doesNotMatch(html, /<figure\b|<button\b|Selected monitor response history|Choose a monitor|Payments API recovered|Your services|Last 24 checks|monitors up|number-flow-react/);
  assert.doesNotMatch(html, /multi.region|worldwide|every second|instant alert|zero false positives|guaranteed|POST|TCP|UDP|SMS|PagerDuty/i);
});

test("the static Uptime hero centers its copy and actions with responsive, reduced-motion-safe styling", async () => {
  const source = await readFile(new URL("../src/landing/products/UptimeHero.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/landing/products/UptimeHero.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(source, /useId|useRef|useState|useEffect|setTimeout|setInterval|fetch\(|Date\.|Math\.random|navigator\.clipboard|NumberFlow|UPTIME_HERO_MONITORS|UptimeMonitorPreview|uptimeIndexFromKey|<figure\b|<button\b/);
  assert.match(css, /\.copy\s*\{[^}]*text-align:\s*center/);
  assert.match(css, /\.lead\s*\{[^}]*margin:\s*[^;]*auto/);
  assert.match(css, /\.actions\s*\{[^}]*justify-content:\s*center/);
  assert.match(css, /\.setupNote\s*\{[^}]*justify-content:\s*center/);
  assert.match(css, /\.primaryButton:focus-visible/);
  assert.match(css, /\.textLink:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*[^)]+\)[\s\S]*\.hero\s*\{[^}]*min-height:\s*0/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*transition:\s*none/);
  assert.doesNotMatch(css, /\.(?:preview|monitorRow|checkTarget|chart|recovery)\b|grid-template-columns:|\banimation(?:-name)?:|@keyframes|\binfinite\b|(?:linear|radial)-gradient\(/);
  const section = css.match(/\.hero\s*\{([^}]+)\}/)?.[1];
  assert.ok(section);
  assert.match(section, /display:\s*flex/);
  assert.match(section, /align-items:\s*center/);
  assert.match(section, /justify-content:\s*center/);
  assert.doesNotMatch(section, /\bborder(?:-top|-bottom)?:|\bbackground:/);
});

test("incident steps show only the selected written update and confirmed evidence with keyboard and focus support", async () => {
  assert.deepEqual(UPTIME_INCIDENT_STAGES.map((stage) => stage.label), ["Investigating", "Identified", "Resolved"]);
  for (let index = 0; index < 3; index++) {
    for (const key of ["ArrowDown", "ArrowRight"]) assert.equal(uptimeIncidentIndexFromKey(index, key), (index + 1) % 3);
    for (const key of ["ArrowUp", "ArrowLeft"]) assert.equal(uptimeIncidentIndexFromKey(index, key), (index + 2) % 3);
    assert.equal(uptimeIncidentIndexFromKey(index, "Home"), 0);
    assert.equal(uptimeIncidentIndexFromKey(index, "End"), 2);
    assert.equal(uptimeIncidentIndexFromKey(index, "Tab"), null);
  }
  const html = renderToStaticMarkup(React.createElement(UptimeIncidentFlow));
  assert.equal(html, renderToStaticMarkup(React.createElement(UptimeIncidentFlow)));
  assert.match(html, /role="tablist" aria-label="Explore the incident timeline" aria-orientation="vertical"/);
  const harness = await interactionHarness("UptimeFeatureSections", "UptimeIncidentFlow");
  let tree = harness.render();
  const tabs = () => elements(tree).filter((element) => element.props.role === "tab");
  const panel = () => elements(tree).find((element) => element.props.role === "tabpanel")!;
  const selected = () => tabs().find((tab) => tab.props["aria-selected"])!;
  const assertStage = (index: number) => {
    const stage = UPTIME_INCIDENT_STAGES[index];
    assert.equal(tabs().length, 3);
    assert.equal(selected(), tabs()[index]);
    assert.equal(panel().props["aria-labelledby"], selected().props.id);
    assert.equal(panel().props.tabIndex, 0);
    assert.ok(tabs().every((tab, offset) => tab.props["aria-controls"] === panel().props.id && tab.props.tabIndex === (offset === index ? 0 : -1)));
    const text = textContent(panel());
    for (const value of [stage.title, stage.message, stage.evidenceTitle, stage.evidence, stage.response, stage.state]) assert.ok(text.includes(value));
    for (const other of UPTIME_INCIDENT_STAGES.filter((_, offset) => offset !== index)) assert.ok(!text.includes(other.message));
    assert.equal(elements(panel()).find((element) => element.type === "time")?.props.dateTime, stage.dateTime);
    assert.equal(elements(panel()).find((element) => element.props.className === "updateContent")?.key, stage.id);
  };
  assertStage(0);
  tabs()[2].props.onClick(); tree = harness.render();
  assertStage(2);
  tabs()[1].props.onFocus(); tree = harness.render();
  assertStage(1);
  for (const [key, index] of [["ArrowDown", 2], ["ArrowRight", 0], ["ArrowUp", 2], ["ArrowLeft", 1], ["Home", 0], ["End", 2]] as const) {
    let prevented = false;
    selected().props.onKeyDown({ key, preventDefault() { prevented = true; } }); tree = harness.render();
    assert.ok(prevented);
    assert.equal(harness.focused, selected().props.id);
    assertStage(index);
  }
  let prevented = false;
  selected().props.onKeyDown({ key: "Tab", preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  const repeated = renderToStaticMarkup(React.createElement("div", null, React.createElement(UptimeIncidentFlow), React.createElement(UptimeIncidentFlow)));
  const controls = [...repeated.matchAll(/aria-controls="([^"]+-incident-panel)"/g)].map((match) => match[1]);
  assert.equal(controls.length, 6);
  assert.equal(new Set(controls).size, 2);
  for (const id of controls) assert.ok(repeated.includes(`id="${id}"`));
});

test("the public status preview keeps missing observations distinct from operational and incident days", () => {
  const preview = UptimeStatusPagePreview();
  const html = renderToStaticMarkup(preview);
  assert.equal(html, renderToStaticMarkup(React.createElement(UptimeStatusPagePreview)));
  assert.match(html, /status\.acme\.example/);
  assert.match(html, /Custom domain/);
  assert.match(html, /History legend/);
  assert.match(html, /No data/);
  assert.equal(UPTIME_PUBLIC_COMPONENTS.length, 3);
  const histories = elements(preview).filter((element) => element.props.role === "img");
  assert.equal(histories.length, 3);
  UPTIME_PUBLIC_COMPONENTS.forEach((component, index) => {
    assert.equal(component.history.length, 90);
    assert.deepEqual(component.history.slice(0, 8), Array(8).fill("unknown"));
    const bars = elements(histories[index]).filter((element) => element.type === "i");
    assert.deepEqual(bars.map((bar) => bar.props["data-state"]), component.history);
    assert.match(histories[index].props["aria-label"], /90 day history.*8 days without observations/);
  });
  assert.doesNotMatch(html, /100%|99\.99|<button\b|<form\b|<input\b/, "the preview does not invent uptime totals or fake subscription controls");
});

test("team and subscriber notification copy preserves their different triggers and supported destinations", () => {
  const notification = renderToStaticMarkup(React.createElement(UptimeNotificationPreview));
  assert.equal(notification, renderToStaticMarkup(React.createElement(UptimeNotificationPreview)));
  assert.match(notification, /Team notification for a confirmed monitor failure/);
  for (const text of ["3 consecutive checks failed.", "GET /health · HTTP 503", "Recovery notifications, too.", "Email", "Slack", "Discord"]) assert.ok(notification.includes(text));
  assert.doesNotMatch(notification, /<button\b|<input\b|SMS|PagerDuty|instant|guaranteed/i);
  const features = renderToStaticMarkup(React.createElement(UptimeFeatureSections));
  assert.match(features, /Send confirmed Down and recovery notifications to email, Slack, or Discord/);
  assert.match(features, /Publish a written update when you’re ready to notify status-page subscribers/);
  assert.match(features, /Your custom subdomain/);
  assert.doesNotMatch(features, /automatic.*(?:email|subscribers)|all subscribers.*(?:instantly|automatically)|apex domain|unlimited status pages/i);
});

test("Uptime feature surfaces stay responsive, finite-motion-safe and disconnected from live APIs", async () => {
  const source = await readFile(new URL("../src/landing/products/UptimeFeatureSections.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/landing/products/UptimeFeatureSections.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(source, /useEffect|setTimeout|setInterval|fetch\(|Date\.|Math\.random|dangerouslySetInnerHTML/);
  assert.match(css, /\.incidentStep:focus-visible/);
  assert.match(css, /\.incidentVisual:focus-visible/);
  assert.match(css, /\.updateContent\s*\{[^}]*animation:\s*update-enter\s+[\d.]+m?s/);
  assert.match(css, /@media\s*\(max-width:\s*[^)]+\)[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*transition:\s*none/);
  assert.doesNotMatch(css, /\binfinite\b|(?:linear|radial)-gradient\(/);
  const section = css.match(/\.section\s*\{([^}]+)\}/)?.[1];
  assert.ok(section);
  assert.doesNotMatch(section, /\bborder(?:-top|-bottom)?:|\bbackground:/);
  const html = renderToStaticMarkup(uptimePage());
  assert.doesNotMatch(html, /<hr\b/);
  for (const section of html.matchAll(/<section\b[^>]*class="([^"]+)"/g)) assert.doesNotMatch(section[1], /(?:^|[\s:])(?:border(?:[-\s]|$)|divide-[xy](?:[-\s]|$))/);
});
