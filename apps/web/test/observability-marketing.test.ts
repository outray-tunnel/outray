import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Link, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { ProductPage, ProductsIndex } from "../src/landing/products/ProductPage";
import { ObservabilityHero, OBSERVABILITY_HERO_SPANS, heroSpanIndexFromKey } from "../src/landing/products/ObservabilityHero";
import { ObservabilityRequestStory, OBSERVABILITY_STORY_TRACE_ID, OBSERVABILITY_STORY_DURATION, OBSERVABILITY_STORY_SPANS, observabilityJourneyIndexFromKey } from "../src/landing/products/ObservabilityRequestStory";
import { ObservabilityFeatureSections } from "../src/landing/products/ObservabilityFeatureSections";
import { MetricChart, SignalTraceChart, METRIC_DURATION_SAMPLES, SIGNAL_TRACE_SPANS, signalChartIndexFromKey } from "../src/landing/products/ObservabilitySignalCharts";
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

function observabilityPage() {
  return React.createElement(ProductPage, {
    product: "observability",
    className: "[--accent:#888] [--accent-deep:#444] [--accent-light:#d4d4d4] [--accent-rgb:160_160_160]",
    hero: React.createElement(ObservabilityHero),
    workflow: React.createElement(ObservabilityRequestStory),
    sections: React.createElement(ObservabilityFeatureSections),
  });
}

type Element = React.ReactElement<Record<string, any>>;

function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

function animatedDuration(node: React.ReactNode): Element {
  const direct = elements(node).find((element) => typeof element.type === "function" && element.type.name === "NumberFlow");
  if (direct) return direct;
  const wrapper = elements(node).find((element) => typeof element.type === "function" && element.type.name === "DurationNumber");
  assert.ok(wrapper, "the duration uses the actual NumberFlow wrapper");
  const output = (wrapper.type as (props: Record<string, any>) => React.ReactNode)(wrapper.props);
  const number = elements(output).find((element) => typeof element.type === "function" && element.type.name === "NumberFlow");
  assert.ok(number);
  return number;
}

/** Execute real callbacks and state; only decorative rendering and NumberFlow's animation are inert. */
async function interactionHarness(file: "ObservabilityRequestStory" | "ObservabilityHero" | "ObservabilitySignalCharts", exportName: string = file) {
  const source = await readFile(new URL(`../src/landing/products/${file}.tsx`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
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
    useEffect() { slot++; },
    useMemo(callback: () => unknown) { slot++; return callback(); },
  };
  const module = { exports: {} as Record<string, () => React.ReactNode> };
  const Icon = () => null;
  const NumberFlow = ({ value }: { value: number }) => React.createElement("span", { "data-number-flow": true }, value);
  runInNewContext(compiled, {
    React: react, module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "react") return react;
      if (specifier === "@tanstack/react-router") return { Link };
      if (specifier === "@number-flow/react") return { default: NumberFlow, __esModule: true };
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: Icon };
      if (specifier.startsWith("@outray/icons/")) return { __esModule: true, default: [] };
      if (specifier.endsWith(".css")) return { default: new Proxy({}, { get: (_target, name) => String(name) }), __esModule: true };
      throw new Error(`Unexpected observability demo dependency: ${specifier}`);
    },
  });
  const component = module.exports[exportName];
  return {
    get focused() { return focused; },
    render() {
      slot = 0;
      const tree = component();
      for (const element of elements(tree)) {
        if (element.type === "button" && typeof element.props.ref === "function") element.props.ref({ focus() { focused = element.props.id ?? element.props["aria-label"] ?? elements(element).find((child) => child.type === "code")?.props.children; } });
      }
      return tree;
    },
  };
}

test("Observability replaces the generic product template with its own complete story without data requests", () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("Public marketing cannot request organization telemetry"); };
  try {
    const html = renderToStaticMarkup(observabilityPage());
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.match(html, /Know what.*happened\..*And why\./);
    assert.match(html, /One request\..*Every connection\./);
    assert.doesNotMatch(html, /Fits the way.*you build\.|observability-setup-title|Observability framework integration/);
    assert.doesNotMatch(html, /server instrumentation code|Copy .*observability setup|Copy .*install command/);
    assert.doesNotMatch(html, /npm install @outray\/(?:observability|express|tanstack-start)|OBSERVABILITY_TOKEN|startOutrayObservability|registerOutrayObservability|createOutrayTanStackServerEntry/);
    assert.doesNotMatch(html, /href="\/docs\/observability\/sdk-setup/);
    assert.ok(html.includes('href="/signup"'));
    assert.ok(html.includes('href="/docs/observability"'));
    assert.doesNotMatch(html, /id="workflow-title"|id="capabilities-title"|id="use-cases-title"|id="connected-title"|id="start-title"/);
    assert.doesNotMatch(html, /THE WORKFLOW|BUILT IN|IN PRACTICE|BETTER TOGETHER|YOUR NEXT STEP|OUTRAY OBSERVABILITY/);
    assert.doesNotMatch(html, /Illustrative|sample data|Static preview/);
    assert.doesNotMatch(html, /Localhost,.*meet the world\.|Every request\. As it arrives\.|Start tunneling/);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("the new Observability dependencies are scoped to its route, leaving shared fallback pages and overview previews untouched", async () => {
  const route = await readFile(new URL("../src/routes/products.observability.tsx", import.meta.url), "utf8");
  const shared = await readFile(new URL("../src/landing/products/ProductPage.tsx", import.meta.url), "utf8");
  assert.match(route, /<ProductPage\s+product="observability"/);
  assert.match(route, /hero=\{<ObservabilityHero\s*\/>\}/);
  assert.match(route, /workflow=\{<ObservabilityRequestStory\s*\/>\}/);
  assert.doesNotMatch(route, /ObservabilitySetup/);
  assert.match(route, /sections=\{<ObservabilityFeatureSections\s*\/>\}/);
  assert.doesNotMatch(shared, /from ["'][^"']*Observability(?:Hero|RequestStory|Setup|FeatureSections)["']/);
  for (const product of ["secrets", "uptime"] as const) {
    const html = renderToStaticMarkup(React.createElement(ProductPage, { product }));
    assert.ok(html.includes(products[product].title));
    assert.ok(html.includes(products[product].workflow.title));
    assert.match(html, /Illustrative interface · sample data/);
    assert.doesNotMatch(html, /Know what.*happened\.|One request\..*The whole picture\.|Fits the way.*you build\./);
  }
  const overview = renderToStaticMarkup(React.createElement(ProductsIndex));
  assert.equal((overview.match(/Illustrative interface · sample data/g) ?? []).length, 4);
});

test("Observability keeps whitespace between sections instead of decorative separating lines", () => {
  const html = renderToStaticMarkup(observabilityPage());
  const classes = [...html.matchAll(/<section\b[^>]*class="([^"]+)"[^>]*>/g)].map((match) => match[1]);
  assert.equal((html.match(/<section\b/g) ?? []).length, 5, "the five dedicated hero/story/feature sections remain");
  assert.ok(classes.length >= 1, "the Tailwind hero exposes its class names in the CSS-loader SSR harness");
  for (const value of classes) assert.doesNotMatch(value, /(?:^|[\s:])(?:border(?:[-\s]|$)|divide-[xy](?:[-\s]|$))/);
  assert.doesNotMatch(html, /<hr\b/);
});

test("the page follows one request into signal cards, controlled capture and a final signup", () => {
  const html = renderToStaticMarkup(observabilityPage());
  const headings = [...html.matchAll(/<h2\b[^>]*id="(observability-[^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(headings, ["observability-story-title", "observability-signals-title", "observability-capture-title", "observability-start-title"]);
  const features = renderToStaticMarkup(React.createElement(ObservabilityFeatureSections));
  const cards = features.match(/<section\b[^>]*aria-labelledby="observability-signals-title"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(cards);
  const signals = [...cards.matchAll(/<h3>([^<]+)<\/h3>/g)].map((match) => match[1]);
  assert.deepEqual(signals, ["Logs", "Metrics", "Traces"]);
  assert.equal((cards.match(/<article\b/g) ?? []).length, 3);
  assert.match(features, /Opt in to capture, with bounded sizes/);
  assert.match(features, /Default redaction for credentials and sensitive fields/);
  assert.match(features, /Your custom rules/);
  assert.match(features, /Capture securely/);
  assert.doesNotMatch(features, /Capture, with care\./);
  assert.match(features, /\[REDACTED\]/);
  assert.doesNotMatch(features, /automatically captures everything|all sensitive data|zero overhead|guaranteed|no setup required/i);
  const cta = features.match(/<section\b[^>]*aria-labelledby="observability-start-title"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(cta);
  assert.match(cta, /Less guessing\..*More understanding\./);
  assert.match(cta, /href="\/signup"[^>]*>Get started/);
  assert.match(cta, /href="\/docs\/observability"[^>]*>Read the docs/);
});

test("Observability UI glyphs use the shared Hugeicons package and resolve in the generated icon distribution", async () => {
  for (const component of ["ObservabilityHero", "ObservabilityRequestStory", "ObservabilityFeatureSections"]) {
    const source = await readFile(new URL(`../src/landing/products/${component}.tsx`, import.meta.url), "utf8");
    const file = ts.createSourceFile(`${component}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imports = file.statements.filter(ts.isImportDeclaration).map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text);
    const glyphs = imports.filter((path) => path.startsWith("@outray/icons/"));
    assert.ok(glyphs.length > 0, `${component} uses the established icon package`);
    assert.ok(imports.includes("@hugeicons/react"));
    assert.ok(!imports.includes("lucide-react"), `${component} does not introduce another UI icon style`);
    for (const glyph of glyphs) await assert.doesNotReject(() => readFile(new URL(`../../../packages/icons/generated/${glyph.replace("@outray/icons/", "")}.js`, import.meta.url)));
  }
});

test("the Observability hero renders a deterministic, connected waterfall with real action destinations", () => {
  const html = renderToStaticMarkup(React.createElement(ObservabilityHero));
  assert.equal(html, renderToStaticMarkup(React.createElement(ObservabilityHero)), "no clock or random output changes hydration content");
  assert.match(html, /aria-labelledby="product-title"/);
  assert.match(html, /Know what.*happened\..*And why\./);
  assert.match(html, /href="\/signup"[^>]*>Start observing/);
  assert.match(html, /href="\/docs\/observability"[^>]*>Read the docs/);
  assert.match(html, /aria-label="A 342 millisecond checkout request connected to database, inventory, and payment spans"/);
  assert.match(html, /aria-label="Request trace spans"/);
  const list = html.match(/<ol\b[^>]*aria-label="Request trace spans"[^>]*>([\s\S]*?)<\/ol>/)?.[1];
  assert.ok(list);
  assert.equal((list.match(/<li\b/g) ?? []).length, 4);
  for (const operation of ["POST /api/checkout", "SELECT products", "GET /inventory", "POST /payments"]) assert.ok(html.includes(operation));
  assert.match(html, /200 OK/);
  assert.doesNotMatch(html, /live traffic|requests per second|guaranteed|root cause identified|Illustrative|sample data/i);
});

test("the hero keeps purposeful colour and finite reduced-motion-aware animations without gradient surfaces", async () => {
  const source = await readFile(new URL("../src/landing/products/ObservabilityHero.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/landing/products/ObservabilityHero.module.css", import.meta.url), "utf8");
  assert.match(source, /#b691ff/);
  assert.match(source, /#22d3ee/);
  assert.match(source, /max-\[820px\]:grid-cols-1/);
  assert.match(source, /max-\[540px\]:/);
  assert.match(css, /background: #0d0d0d/);
  assert.match(css, /background: #141414/);
  for (const card of ["traceCard", "contextCard"]) {
    const fill = css.match(new RegExp(`\\.${card} \\{([^}]+)\\}`))?.[1];
    assert.ok(fill);
    assert.doesNotMatch(fill, /(?:linear|radial)-gradient\(/, "flat card surfaces keep the trace grid's purposeful marks separate");
  }
  assert.match(css, /animation: span-arrive/);
  assert.match(css, /animation: trace-sweep/);
  assert.doesNotMatch(css, /\binfinite\b/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  assert.doesNotMatch(source, /setInterval|setTimeout|Date\.|Math\.random|useEffect/);
});

test("hero trace rows preview full-row hover context, preserve selection, and support roving keyboard navigation", async () => {
  assert.deepEqual(OBSERVABILITY_HERO_SPANS.map(({ offset, duration }) => [offset, duration]), [[0, 342], [10, 84], [106, 123], [232, 108]]);
  for (const span of OBSERVABILITY_HERO_SPANS) assert.ok(span.offset + span.duration <= 342);
  for (let index = 0; index < 4; index++) {
    assert.equal(heroSpanIndexFromKey(index, "ArrowRight"), (index + 1) % 4);
    assert.equal(heroSpanIndexFromKey(index, "ArrowDown"), (index + 1) % 4);
    assert.equal(heroSpanIndexFromKey(index, "ArrowLeft"), (index + 3) % 4);
    assert.equal(heroSpanIndexFromKey(index, "ArrowUp"), (index + 3) % 4);
    assert.equal(heroSpanIndexFromKey(index, "Home"), 0);
    assert.equal(heroSpanIndexFromKey(index, "End"), 3);
    assert.equal(heroSpanIndexFromKey(index, "Tab"), null);
  }
  const harness = await interactionHarness("ObservabilityHero", "ObservabilityHeroTrace");
  let tree = harness.render();
  const rows = () => elements(tree).filter((element) => element.type === "button" && "aria-pressed" in element.props);
  const selected = () => rows().find((element) => element.props["aria-pressed"] === true)!;
  const context = () => elements(tree).find((element) => element.props["aria-label"] === "Selected hero span details")!;
  const animatedNumber = () => elements(context()).find((element) => typeof element.type === "function" && element.type.name === "NumberFlow")!;
  const assertContext = (index: number) => {
    const span = OBSERVABILITY_HERO_SPANS[index];
    const html = renderToStaticMarkup(context());
    assert.ok(html.includes(span.title));
    assert.ok(html.includes(span.detail));
    assert.equal(animatedNumber().props.value, span.duration);
    assert.equal(animatedNumber().props.respectMotionPreference, true);
  };
  assert.equal(rows().length, 4);
  assert.equal(selected(), rows()[1], "database context is selected by default");
  assertContext(1);
  rows().forEach((row, index) => {
    const span = OBSERVABILITY_HERO_SPANS[index];
    assert.equal(row.props["aria-label"], `Inspect ${span.service} span, ${span.duration} milliseconds`);
    assert.equal(row.props["aria-controls"], context().props.id);
    const bar = elements(row).find((element) => element.props.style?.left !== undefined)!;
    assert.ok(bar);
    assert.equal(parseFloat(bar.props.style.left), span.offset / 342 * 100);
    assert.equal(parseFloat(bar.props.style.width), span.duration / 342 * 100);
  });
  rows()[3].props.onPointerEnter(); tree = harness.render();
  assertContext(3);
  assert.equal(selected(), rows()[1], "hover does not change the committed choice");
  assert.equal(rows()[3].props["data-active"], true);
  rows()[3].props.onPointerLeave(); tree = harness.render();
  assertContext(1);
  rows()[2].props.onFocus(); tree = harness.render();
  assert.equal(selected(), rows()[2]);
  assertContext(2);
  rows()[0].props.onPointerEnter(); tree = harness.render();
  assertContext(0);
  rows()[0].props.onPointerLeave(); tree = harness.render();
  assertContext(2);
  rows()[3].props.onClick(); tree = harness.render();
  assert.equal(selected(), rows()[3]);
  assertContext(3);
  for (const [key, index] of [["ArrowRight", 0], ["ArrowUp", 3], ["Home", 0], ["End", 3], ["ArrowDown", 0], ["ArrowLeft", 3]] as const) {
    let prevented = false;
    selected().props.onKeyDown({ key, preventDefault() { prevented = true; } });
    tree = harness.render();
    assert.ok(prevented);
    assert.equal(selected(), rows()[index]);
    assert.equal(harness.focused, selected().props.id);
    assert.equal(selected().props.tabIndex, 0);
    assert.ok(rows().filter((row) => row !== selected()).every((row) => row.props.tabIndex === -1));
    assertContext(index);
  }
  let prevented = false;
  selected().props.onKeyDown({ key: "Tab", preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  const css = await readFile(new URL("../src/landing/products/ObservabilityHero.module.css", import.meta.url), "utf8");
  assert.match(css, /\.spanRow\s*\{[^}]*width: 100%[^}]*min-height: 55px/);
  assert.match(css, /\.spanRow:focus-visible/);
  assert.match(css, /\.spanRow\[data-active="true"\]/);
});

test("the request journey connects four stages and renders only the selected stage's evidence", () => {
  const html = renderToStaticMarkup(React.createElement(ObservabilityRequestStory));
  assert.equal(html, renderToStaticMarkup(React.createElement(ObservabilityRequestStory)));
  assert.equal(OBSERVABILITY_STORY_DURATION, 342);
  assert.match(OBSERVABILITY_STORY_TRACE_ID, /^[a-f0-9]{32}$/);
  assert.deepEqual(OBSERVABILITY_STORY_SPANS.map(({ offset, duration }) => [offset, duration]), [[0, 342], [10, 84], [106, 123], [232, 108]]);
  assert.match(html, /aria-labelledby="observability-story-title"/);
  assert.match(html, /One request\..*Every connection\./);
  assert.match(html, /aria-label="Checkout request journey"/);
  assert.match(html, /aria-label="Selected request stage details"/);
  assert.doesNotMatch(html, /role="(?:tablist|tab|tabpanel)"|Explore request telemetry|Checkout trace spans|Where the time went\./);
  for (const span of OBSERVABILITY_STORY_SPANS) {
    assert.ok(span.offset >= 0 && span.duration > 0 && span.offset + span.duration <= 342);
    assert.ok(html.includes(`aria-label="Explore ${span.service}"`));
  }
  assert.equal((html.match(/<button\b/g) ?? []).length, 4);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /200 OK/);
  assert.doesNotMatch(html, /201 Created|status=201/);
  assert.match(html, /aria-label="Logs related to POST \/api\/checkout"/);
  assert.match(html, /Checkout started/);
  assert.match(html, /Checkout completed/);
  assert.match(html, /aria-label="Request body for checkout-api"/);
  assert.match(html, /\[REDACTED\]/);
  assert.doesNotMatch(html, /aria-label="Logs (?:for|related to) postgres"|Cart loaded|Inventory reserved|Payment authorized/, "unselected stage evidence is not dumped into hidden console panels");
  assert.doesNotMatch(html, /aria-label="Logs for /, "correlated application logs are not attributed as emitted by dependency services");
  assert.ok(html.includes(OBSERVABILITY_STORY_TRACE_ID));

  const repeated = renderToStaticMarkup(React.createElement("div", null, React.createElement(ObservabilityRequestStory), React.createElement(ObservabilityRequestStory)));
  const controls = [...repeated.matchAll(/aria-controls="([^"]+-detail)"/g)].map((match) => match[1]);
  assert.equal(controls.length, 8);
  assert.equal(new Set(controls).size, 2, "each journey instance controls its own detail region");
  for (const id of controls) assert.ok(repeated.includes(`id="${id}"`));
  const stageIds = [...repeated.matchAll(/\bid="([^"]+-stage-[0-3])"/g)].map((match) => match[1]);
  assert.equal(stageIds.length, 8);
  assert.equal(new Set(stageIds).size, 8);
});

test("request journey hover previews, persistent selection and keyboard navigation keep evidence in context", async () => {
  for (let index = 0; index < 4; index++) {
    for (const key of ["ArrowDown", "ArrowRight"]) assert.equal(observabilityJourneyIndexFromKey(index, key), (index + 1) % 4);
    for (const key of ["ArrowUp", "ArrowLeft"]) assert.equal(observabilityJourneyIndexFromKey(index, key), (index + 3) % 4);
    assert.equal(observabilityJourneyIndexFromKey(index, "Home"), 0);
    assert.equal(observabilityJourneyIndexFromKey(index, "End"), 3);
    assert.equal(observabilityJourneyIndexFromKey(index, "Tab"), null);
  }
  const harness = await interactionHarness("ObservabilityRequestStory");
  let tree = harness.render();
  const stages = () => elements(tree).filter((element) => element.type === "button" && "aria-pressed" in element.props);
  const selected = () => stages().find((element) => element.props["aria-pressed"] === true)!;
  const list = () => elements(tree).find((element) => element.props["aria-label"] === "Checkout request journey")!;
  const detail = () => elements(tree).find((element) => element.props["aria-label"] === "Selected request stage details")!;
  const evidence = [
    { title: "Server request", logs: ["Checkout started", "Checkout completed"], at: [0, 342], payload: "Request body", fields: ["cart_id", "email", "payment_token", "[REDACTED]"] },
    { title: "Database query", logs: ["Cart loaded"], at: [94], payload: "Query attributes", fields: ["db.system", "postgresql", "db.operation"] },
    { title: "Inventory request", logs: ["Inventory reserved"], at: [229], payload: "Response body", fields: ["items", "available", "reserved"] },
    { title: "Payment request", logs: ["Payment authorized"], at: [340], payload: "Request body", fields: ["currency", "USD", "payment_token", "[REDACTED]"] },
  ];
  const assertDetail = (index: number) => {
    const span = OBSERVABILITY_STORY_SPANS[index], expected = evidence[index];
    const html = renderToStaticMarkup(detail());
    assert.ok(html.includes(span.service));
    assert.ok(html.includes(span.operation));
    assert.ok(html.includes(expected.title));
    const number = animatedDuration(detail());
    assert.equal(number.props.value, span.duration);
    assert.equal(number.props.respectMotionPreference, true);
    assert.ok(html.includes(`Starts at +${span.offset} ms`));
    const timing = elements(detail()).find((element) => element.props.role === "img")!;
    assert.equal(timing.props["aria-label"], `${span.operation}: starts at ${span.offset} ms, takes ${span.duration} ms of the 342 ms request`);
    const bar = elements(timing).find((element) => element.props.style?.marginLeft !== undefined)!;
    assert.equal(parseFloat(bar.props.style.marginLeft), span.offset / 342 * 100);
    assert.equal(parseFloat(bar.props.style.width), span.duration / 342 * 100);
    assert.ok(html.includes(`aria-label="Logs related to ${span.operation}"`));
    assert.doesNotMatch(html, /aria-label="Logs for /, "log context describes correlation with the operation, not the log emitter");
    for (const log of expected.logs) assert.ok(html.includes(log));
    const timestamps = elements(detail()).filter((element) => element.type === "time");
    assert.deepEqual(timestamps.map((timestamp) => timestamp.props.dateTime), expected.at.map((at) => `PT${at / 1000}S`));
    assert.ok(html.includes(`aria-label="${expected.payload} for ${span.service}"`));
    for (const field of expected.fields) assert.ok(html.includes(field));
    assert.equal(stages()[index].props["data-active"], true);
    assert.equal(detail().props.style["--stage-color"], span.color);
    const connections = elements(tree).filter((element) => element.type === "g" && "data-active" in element.props);
    assert.equal(connections.length, 3, "the server branches to three dependencies");
    assert.deepEqual(connections.map((connection) => connection.props["data-active"]), [0, 1, 2].map((branch) => index === 0 || index === branch + 1), "connector emphasis follows the stage being inspected");
  };
  assert.equal(stages().length, 4);
  assert.equal(selected(), stages()[0], "the server request is selected by default");
  assertDetail(0);
  stages().forEach((stage, index) => {
    assert.equal(stage.props["aria-label"], `Explore ${OBSERVABILITY_STORY_SPANS[index].service}`);
    assert.equal(stage.props["aria-controls"], detail().props.id);
  });
  stages()[1].props.onMouseEnter(); tree = harness.render();
  assertDetail(1);
  assert.equal(selected(), stages()[0], "hover previews do not change the committed stage");
  stages()[1].props.onMouseLeave(); tree = harness.render();
  assertDetail(0);
  stages()[3].props.onMouseEnter(); tree = harness.render();
  assertDetail(3);
  list().props.onMouseLeave(); tree = harness.render();
  assertDetail(0);
  stages()[2].props.onClick(); tree = harness.render();
  assert.equal(selected(), stages()[2]);
  assertDetail(2);
  stages()[0].props.onMouseEnter(); tree = harness.render();
  assertDetail(0);
  list().props.onMouseLeave(); tree = harness.render();
  assertDetail(2);
  stages()[3].props.onMouseEnter(); tree = harness.render();
  stages()[1].props.onFocus(); tree = harness.render();
  assert.equal(selected(), stages()[1], "focus clears a stale hover preview");
  assertDetail(1);
  for (const [key, index] of [["End", 3], ["ArrowRight", 0], ["ArrowLeft", 3], ["Home", 0], ["ArrowDown", 1], ["ArrowUp", 0]] as const) {
    let prevented = false;
    selected().props.onKeyDown({ key, preventDefault() { prevented = true; } }); tree = harness.render();
    assert.ok(prevented);
    assert.equal(selected(), stages()[index]);
    assert.equal(harness.focused, selected().props.id);
    assert.equal(selected().props.tabIndex, 0);
    assert.ok(stages().filter((stage) => stage !== selected()).every((stage) => stage.props.tabIndex === -1));
    assertDetail(index);
  }
  let prevented = false;
  selected().props.onKeyDown({ key: "Tab", preventDefault() { prevented = true; } });
  assert.equal(prevented, false, "native Tab movement is preserved");
});

test("metric columns animate the headline value on full-area hover and keyboard focus, then reset outside", async () => {
  assert.equal(METRIC_DURATION_SAMPLES.length, 12);
  for (const point of METRIC_DURATION_SAMPLES) assert.ok(point.duration > 0 && point.duration < 430);
  for (const count of [METRIC_DURATION_SAMPLES.length, SIGNAL_TRACE_SPANS.length]) {
    for (let index = 0; index < count; index++) {
      assert.equal(signalChartIndexFromKey(index, "ArrowRight", count), (index + 1) % count);
      assert.equal(signalChartIndexFromKey(index, "ArrowDown", count), (index + 1) % count);
      assert.equal(signalChartIndexFromKey(index, "ArrowLeft", count), (index + count - 1) % count);
      assert.equal(signalChartIndexFromKey(index, "ArrowUp", count), (index + count - 1) % count);
      assert.equal(signalChartIndexFromKey(index, "Home", count), 0);
      assert.equal(signalChartIndexFromKey(index, "End", count), count - 1);
      assert.equal(signalChartIndexFromKey(index, "Tab", count), null);
    }
  }
  assert.equal(signalChartIndexFromKey(0, "ArrowRight", 0), null);
  const initial = renderToStaticMarkup(React.createElement(MetricChart));
  assert.equal(initial, renderToStaticMarkup(React.createElement(MetricChart)));
  assert.match(initial, /aria-label="Request duration over time"/);
  assert.equal((initial.match(/<button\b/g) ?? []).length, 12);
  const harness = await interactionHarness("ObservabilitySignalCharts", "MetricChart");
  let tree = harness.render();
  const columns = () => elements(tree).filter((element) => element.type === "button");
  const group = () => elements(tree).find((element) => element.props["aria-label"] === "Request duration over time")!;
  const value = () => animatedDuration(tree).props.value;
  const current = () => columns().find((column) => column.props.tabIndex === 0)!;
  assert.equal(value(), 342);
  assert.equal(columns().filter((column) => column.props["aria-pressed"] === true).length, 0);
  assert.equal(current(), columns()[0]);
  columns().forEach((column, index) => {
    const point = METRIC_DURATION_SAMPLES[index];
    assert.equal(column.props["aria-label"], `Request at ${point.time}, ${point.duration} milliseconds`);
    const bar = elements(column).find((element) => element.props.style?.height !== undefined)!;
    assert.equal(parseFloat(bar.props.style.height), point.duration / 430 * 100);
    assert.ok([true, "true"].includes(bar.props["aria-hidden"]));
  });
  columns()[3].props.onPointerEnter({ pointerType: "mouse" }); tree = harness.render();
  assert.equal(value(), METRIC_DURATION_SAMPLES[3].duration);
  assert.equal(columns()[3].props["data-active"], true);
  group().props.onPointerLeave(); tree = harness.render();
  assert.equal(value(), 342);
  columns()[5].props.onFocus(); tree = harness.render();
  assert.equal(value(), METRIC_DURATION_SAMPLES[5].duration);
  columns()[2].props.onPointerEnter({ pointerType: "mouse" }); tree = harness.render();
  assert.equal(value(), METRIC_DURATION_SAMPLES[2].duration);
  group().props.onPointerLeave(); tree = harness.render();
  assert.equal(value(), METRIC_DURATION_SAMPLES[5].duration, "pointer leave restores keyboard focus context");
  group().props.onBlur({ currentTarget: { contains: () => true }, relatedTarget: {} }); tree = harness.render();
  assert.equal(value(), METRIC_DURATION_SAMPLES[5].duration, "moving focus within the chart does not reset its number");
  group().props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null }); tree = harness.render();
  assert.equal(value(), 342);
  columns()[1].props.onPointerEnter({ pointerType: "touch" }); tree = harness.render();
  assert.equal(value(), 342, "touch movement does not leave a stale hover preview");
  columns()[7].props.onClick(); tree = harness.render();
  assert.equal(value(), METRIC_DURATION_SAMPLES[7].duration);
  assert.equal(harness.focused, columns()[7].props["aria-label"]);
  columns()[3].props.onPointerEnter({ pointerType: "mouse" }); tree = harness.render();
  assert.equal(value(), METRIC_DURATION_SAMPLES[3].duration);
  for (const [key, index] of [["End", 11], ["ArrowRight", 0], ["ArrowLeft", 11], ["Home", 0], ["ArrowDown", 1], ["ArrowUp", 0]] as const) {
    let prevented = false;
    current().props.onKeyDown({ key, preventDefault() { prevented = true; } }); tree = harness.render();
    assert.ok(prevented);
    assert.equal(current(), columns()[index]);
    assert.equal(value(), METRIC_DURATION_SAMPLES[index].duration);
    assert.equal(harness.focused, columns()[index].props["aria-label"]);
  }
  let prevented = false;
  current().props.onKeyDown({ key: "Tab", preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  const number = animatedDuration(tree);
  assert.equal(number.props.respectMotionPreference, true);
  assert.equal(number.props.suffix, " ms");
  assert.equal(number.props.transformTiming.duration, 430);
});

test("signal trace targets select and preview whole service rows with bounded spans and a default reset", async () => {
  assert.deepEqual(SIGNAL_TRACE_SPANS.map(({ offset, duration }) => [offset, duration]), [[0, 342], [10, 84], [232, 108]]);
  for (const span of SIGNAL_TRACE_SPANS) assert.ok(span.offset + span.duration <= 342);
  const initial = renderToStaticMarkup(React.createElement(SignalTraceChart));
  assert.equal(initial, renderToStaticMarkup(React.createElement(SignalTraceChart)));
  assert.match(initial, /aria-label="Trace service durations"/);
  assert.equal((initial.match(/<button\b/g) ?? []).length, 3);
  const harness = await interactionHarness("ObservabilitySignalCharts", "SignalTraceChart");
  let tree = harness.render();
  const rows = () => elements(tree).filter((element) => element.type === "button");
  const group = () => elements(tree).find((element) => element.props["aria-label"] === "Trace service durations")!;
  const value = () => animatedDuration(tree).props.value;
  const current = () => rows().find((row) => row.props.tabIndex === 0)!;
  assert.equal(value(), 342);
  assert.equal(rows()[0].props["aria-pressed"], true);
  rows().forEach((row, index) => {
    const span = SIGNAL_TRACE_SPANS[index];
    assert.equal(row.props["aria-label"], `${span.service}, ${span.operation}, ${span.duration} milliseconds, starting at ${span.offset} milliseconds`);
    const bar = elements(row).find((element) => element.props.style?.marginLeft !== undefined)!;
    assert.equal(parseFloat(bar.props.style.marginLeft), span.offset / 342 * 100);
    assert.equal(parseFloat(bar.props.style.width), span.duration / 342 * 100);
  });
  rows()[1].props.onPointerEnter({ pointerType: "mouse" }); tree = harness.render();
  assert.equal(value(), 84);
  assert.equal(rows()[1].props["data-active"], true);
  group().props.onPointerLeave(); tree = harness.render();
  assert.equal(value(), 342);
  rows()[2].props.onFocus(); tree = harness.render();
  assert.equal(value(), 108);
  rows()[1].props.onPointerEnter({ pointerType: "mouse" }); tree = harness.render();
  assert.equal(value(), 84);
  group().props.onPointerLeave(); tree = harness.render();
  assert.equal(value(), 108);
  group().props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null }); tree = harness.render();
  assert.equal(value(), 342);
  rows()[1].props.onClick(); tree = harness.render();
  assert.equal(value(), 84);
  for (const [key, index] of [["End", 2], ["ArrowRight", 0], ["ArrowLeft", 2], ["Home", 0]] as const) {
    let prevented = false;
    current().props.onKeyDown({ key, preventDefault() { prevented = true; } }); tree = harness.render();
    assert.ok(prevented);
    assert.equal(value(), SIGNAL_TRACE_SPANS[index].duration);
    assert.equal(rows()[index].props["data-active"], true);
    assert.equal(harness.focused, rows()[index].props["aria-label"]);
  }
});

test("signal charts preserve full-height hover hitboxes, active styling and finite reduced-motion-aware motion", async () => {
  const source = await readFile(new URL("../src/landing/products/ObservabilitySignalCharts.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/landing/products/ObservabilitySignalCharts.module.css", import.meta.url), "utf8");
  const features = renderToStaticMarkup(React.createElement(ObservabilityFeatureSections));
  assert.match(features, /role="group" aria-label="Request duration over time"/);
  assert.match(features, /role="group" aria-label="Trace service durations"/);
  for (const Chart of [MetricChart, SignalTraceChart]) {
    const html = renderToStaticMarkup(React.createElement(Chart));
    assert.doesNotMatch(html, /^<div\b[^>]*aria-hidden="true"/, "interactive chart roots are not decorative hidden previews");
    assert.doesNotMatch(html, /role="group"[^>]*aria-hidden="true"/);
  }
  assert.match(source, /import NumberFlow from "@number-flow\/react"/);
  assert.match(source, /respectMotionPreference/);
  assert.doesNotMatch(source, /setInterval|setTimeout|useEffect|Date\.|Math\.random|fetch\(/);
  assert.match(css, /\.metricColumns\s*\{[^}]*height: 95px/);
  assert.match(css, /\.metricTarget\s*\{[^}]*height: 100%/);
  assert.match(css, /\.metricTarget\[data-active="true"\]/);
  assert.match(css, /\.traceTarget:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  assert.doesNotMatch(css, /\binfinite\b|(?:linear|radial)-gradient\(/);
});

test("signal cards retain their responsive, reduced-motion-safe flat surfaces", async () => {
  const features = await readFile(new URL("../src/landing/products/ObservabilityFeatureSections.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/landing/products/observability-sections.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(features, /setInterval|setTimeout|Date\.|Math\.random|fetch\(|dangerouslySetInnerHTML/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 440px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none/);
  assert.doesNotMatch(css, /\banimation:/, "the remaining feature surfaces have no autonomous animations");
  assert.doesNotMatch(css, /(?:linear|radial)-gradient\(/);
  const sectionFill = css.match(/\.featureSection \{([^}]+)\}/)?.[1];
  assert.ok(sectionFill);
  assert.doesNotMatch(sectionFill, /\bborder\b|\boutline\b/, "CSS modules do not reintroduce section dividers");
});

test("the request journey uses an open responsive graph, compact details and reduced-motion-safe connectors", async () => {
  const source = await readFile(new URL("../src/landing/products/ObservabilityRequestStory.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/landing/products/ObservabilityJourney.module.css", import.meta.url), "utf8");
  assert.match(source, /from "\.\/ObservabilityJourney\.module\.css"/);
  assert.doesNotMatch(source, /TracePanel|RequestPanel|LogsPanel|role="(?:tablist|tab|tabpanel)"|observabilityStoryIndexFromKey|observabilityTraceIndexFromKey/);
  assert.doesNotMatch(source, /setInterval|setTimeout|Date\.|Math\.random|fetch\(|dangerouslySetInnerHTML/);
  assert.match(source, /respectMotionPreference/);
  assert.match(css, /\.journey\s*\{[^}]*display: grid/);
  assert.match(css, /\.rootStage\s*\{[^}]*grid-row: 1 \/ 4/);
  assert.match(css, /\.stage\s*\{[^}]*width: 100%/);
  assert.match(css, /\.stage:focus-visible/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.journey\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /animation: follow-request 1350ms/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  assert.doesNotMatch(css, /\binfinite\b|(?:linear|radial)-gradient\(/);
  const section = css.match(/\.section\s*\{([^}]+)\}/)?.[1];
  const outerJourney = css.match(/\.journey\s*\{([^}]+)\}/)?.[1];
  assert.ok(section && outerJourney);
  assert.doesNotMatch(section + outerJourney, /\bborder(?:-top|-bottom)?:|\bbackground:/, "there is no giant console container or section divider");
  const minimums = [...css.matchAll(/(?:^|[;{])\s*min-height:\s*(\d+)px/g)].map((match) => Number(match[1]));
  assert.ok(minimums.every((height) => height < 400), "the replacement does not bring back the old 470–590px fixed tab pane");
});
