import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Link, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { ProductPage, ProductsIndex } from "../src/landing/products/ProductPage";
import { SecretsHero } from "../src/landing/products/SecretsHero";
import { SecretsEnvironmentSection, SECRET_ENVIRONMENTS, SECRET_ENVIRONMENT_KEYS, secretsEnvironmentIndexFromKey, secretsCommandForEnvironment } from "../src/landing/products/SecretsEnvironmentSection";
import { SecretsProblemSection } from "../src/landing/products/SecretsProblemSection";
import { SecretsFeatureSections, SecretShareVisual, SecretHistoryVisual, SECRET_HISTORY_VERSIONS, secretHistoryIndexFromKey, SecretMachineTokenVisual, SecretAuditVisual, SECRET_AUDIT_EVENTS } from "../src/landing/products/SecretsFeatureSections";
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

function secretsPage() {
  return React.createElement(ProductPage, {
    product: "secrets",
    className: "[--accent:#888] [--accent-deep:#444] [--accent-light:#d4d4d4] [--accent-rgb:160_160_160]",
    hero: React.createElement(SecretsHero),
    workflow: React.createElement(React.Fragment, null, React.createElement(SecretsProblemSection), React.createElement(SecretsEnvironmentSection)),
    sections: React.createElement(SecretsFeatureSections),
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

/** Real handlers and hook state run unchanged; icons/clipboard animation remain inert. */
async function interactionHarness(file: "SecretsEnvironmentSection" | "SecretsFeatureSections" | "SecretsHero", exportName: string = file) {
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
  const CopyButton = () => null;
  const NumberFlow = ({ value }: { value: number }) => React.createElement("span", null, value);
  runInNewContext(compiled, {
    React: react, module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "react") return react;
      if (specifier === "@tanstack/react-router") return { Link };
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: Icon };
      if (specifier.startsWith("@outray/icons/")) return { __esModule: true, default: [] };
      if (specifier.endsWith("copy-button/copy-button")) return { CopyButton };
      if (specifier === "@number-flow/react") return { default: NumberFlow, __esModule: true };
      if (specifier.endsWith(".css")) return { default: new Proxy({}, { get: (_target, name) => String(name) }), __esModule: true };
      throw new Error(`Unexpected Secrets marketing dependency: ${specifier}`);
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

test("Secrets renders its dedicated landing page without requesting any organization data", () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("Marketing demos cannot fetch or mutate real secrets"); };
  try {
    const html = renderToStaticMarkup(secretsPage());
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.match(html, /aria-labelledby="product-title"/);
    assert.ok(html.includes('href="/signup"'));
    assert.ok(html.includes('href="/docs/secrets"'));
    assert.match(html, /Get started/);
    assert.doesNotMatch(html, /id="workflow-title"|id="capabilities-title"|id="use-cases-title"|id="connected-title"|id="start-title"/);
    assert.doesNotMatch(html, /OUTRAY SECRETS|THE WORKFLOW|BUILT IN|IN PRACTICE|BETTER TOGETHER|YOUR NEXT STEP/);
    assert.doesNotMatch(html, /Illustrative|sample data|Static preview/);
    assert.doesNotMatch(html, /Localhost,.*meet the world\.|Know what.*happened\.|One request\..*Every connection\./);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("Secrets uses the reference content without the omitted database or zero-knowledge claims", () => {
  const html = renderToStaticMarkup(secretsPage());
  const visible = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(visible, /Your app needs secrets\. Your codebase doesn[’']t\./);
  assert.match(html, /Delete your.*\.env.*file today\./);
  assert.doesNotMatch(visible, /database never gets (?:the )?actual secret|zero[- ]knowledge|server (?:cannot|can[’']t) decrypt|end.to.end encrypted vault/i);
});

test("the dedicated Secrets dependencies are scoped to its route and do not replace shared fallback pages", async () => {
  const route = await readFile(new URL("../src/routes/products.secrets.tsx", import.meta.url), "utf8");
  const shared = await readFile(new URL("../src/landing/products/ProductPage.tsx", import.meta.url), "utf8");
  assert.match(route, /<ProductPage\s+product="secrets"/);
  assert.match(route, /hero=\{<SecretsHero\s*\/>\}/);
  assert.match(route, /workflow=\{<>\s*<SecretsProblemSection\s*\/>\s*<SecretsEnvironmentSection\s*\/>\s*<\/\s*>\}/);
  assert.match(route, /sections=\{<SecretsFeatureSections\s*\/>\}/);
  assert.doesNotMatch(shared, /from ["'][^"']*Secrets(?:Hero|ProblemSection|EnvironmentSection|FeatureSections)["']/);
  for (const product of ["secrets", "uptime"] as const) {
    const html = renderToStaticMarkup(React.createElement(ProductPage, { product }));
    assert.ok(html.includes(products[product].title));
    assert.ok(html.includes(products[product].workflow.title));
    assert.match(html, /Illustrative interface · sample data/);
  }
  const overview = renderToStaticMarkup(React.createElement(ProductsIndex));
  assert.equal((overview.match(/Illustrative interface · sample data/g) ?? []).length, 4);
});

test("Secrets keeps whitespace between sections instead of decorative separating lines", () => {
  const html = renderToStaticMarkup(secretsPage());
  const sections = [...html.matchAll(/<section\b[^>]*>/g)].map((match) => match[0]);
  assert.ok(sections.length >= 5);
  for (const section of sections) {
    const classes = section.match(/class="([^"]+)"/)?.[1] ?? "";
    assert.doesNotMatch(classes, /(?:^|[\s:])(?:border(?:[-\s]|$)|divide-[xy](?:[-\s]|$))/);
  }
  assert.doesNotMatch(html, /<hr\b/);
});

test("Secrets UI glyphs use the established Hugeicons wrappers", async () => {
  for (const component of ["SecretsHero", "SecretsProblemSection", "SecretsEnvironmentSection", "SecretsFeatureSections"]) {
    const source = await readFile(new URL(`../src/landing/products/${component}.tsx`, import.meta.url), "utf8");
    const file = ts.createSourceFile(`${component}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imports = file.statements.filter(ts.isImportDeclaration).map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text);
    const glyphs = imports.filter((path) => path.startsWith("@outray/icons/"));
    assert.ok(glyphs.length > 0);
    assert.ok(imports.includes("@hugeicons/react"));
    assert.ok(!imports.includes("lucide-react"));
    for (const glyph of glyphs) await assert.doesNotReject(() => readFile(new URL(`../../../packages/icons/generated/${glyph.replace("@outray/icons/", "")}.js`, import.meta.url)));
  }
});

test("the Secrets hero keeps its copy and destinations without the removed illustration", () => {
  const html = renderToStaticMarkup(React.createElement(SecretsHero));
  assert.equal(html, renderToStaticMarkup(React.createElement(SecretsHero)));
  assert.match(html, /Your app needs.*secrets\..*Your codebase.*doesn[’']t\./);
  assert.match(html, /href="\/signup"[^>]*>Get started/);
  assert.match(html, /Keep credentials out of repos, group chats, and shell history/);
  assert.match(html, /href="\/docs\/secrets"[^>]*>Read the docs/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<figure\b|<button\b|<h2\b|DATABASE_URL|STRIPE_SECRET_KEY|SESSION_SECRET/);
  assert.doesNotMatch(html, /Environment vault|Protected|Selected secret metadata|Ready for your runtime|Configuration, without the handoff/);
});

test("the illustration-free hero centers its content and supports narrow screens and reduced motion", async () => {
  const source = await readFile(new URL("../src/landing/products/SecretsHero.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/landing/products/SecretsHero.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(source, /SecretsVaultStack|SECRETS_HERO_KEYS|secretsHeroKeyIndexFromKey|useState|useRef|useId|setInterval|setTimeout|useEffect|fetch\(/);
  assert.doesNotMatch(css, /\.artwork\b|\.vaultDocument\b|\.lockEmblem\b|\.deliveryReceipt\b|grid-template-columns|@keyframes/);
  assert.match(css, /\.hero\s*\{[^}]*display: flex/);
  assert.match(css, /\.copy\s*\{[^}]*text-align: center/);
  assert.match(css, /\.actions\s*\{[^}]*justify-content: center/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*min-height: 0/);
  assert.doesNotMatch(css, /white-space: nowrap/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none/);
});

test("environment selection keeps keys masked and copies the exact target-specific runtime command", async () => {
  assert.deepEqual(SECRET_ENVIRONMENTS.map(({ slug }) => slug), ["development", "staging", "production"]);
  for (let index = 0; index < 3; index++) {
    for (const key of ["ArrowRight", "ArrowDown"]) assert.equal(secretsEnvironmentIndexFromKey(index, key), (index + 1) % 3);
    for (const key of ["ArrowLeft", "ArrowUp"]) assert.equal(secretsEnvironmentIndexFromKey(index, key), (index + 2) % 3);
    assert.equal(secretsEnvironmentIndexFromKey(index, "Home"), 0);
    assert.equal(secretsEnvironmentIndexFromKey(index, "End"), 2);
    assert.equal(secretsEnvironmentIndexFromKey(index, "Tab"), null);
  }
  const harness = await interactionHarness("SecretsEnvironmentSection");
  let tree = harness.render();
  const tabs = () => elements(tree).filter((element) => element.props.role === "tab");
  const selected = () => tabs().find((tab) => tab.props["aria-selected"] === true)!;
  const panel = () => elements(tree).find((element) => element.props.role === "tabpanel")!;
  const assertEnvironment = (index: number) => {
    const environment = SECRET_ENVIRONMENTS[index];
    assert.equal(selected(), tabs()[index]);
    assert.deepEqual(tabs().map((tab) => tab.props.title), SECRET_ENVIRONMENTS.map((item) => item.description), "compact tabs retain their environment descriptions");
    assert.equal(panel().props["aria-labelledby"], selected().props.id);
    assert.equal(selected().props["aria-controls"], panel().props.id);
    assert.equal(panel().props.style["--environment-color"], environment.color);
    const keyList = elements(tree).find((element) => element.props["aria-label"] === `${environment.label} secret keys`)!;
    const keys = elements(keyList).filter((element) => element.type === "code").map((element) => textContent(element));
    assert.deepEqual(keys, [...SECRET_ENVIRONMENT_KEYS]);
    assert.equal(elements(keyList).filter((element) => element.props["aria-label"] === "Value hidden").length, SECRET_ENVIRONMENT_KEYS.length);
    const hidden = elements(keyList).filter((element) => element.props["aria-label"] === "Value hidden");
    assert.ok(hidden.every((element) => element.props.children === "••••••••••••"));
    const pre = elements(tree).find((element) => element.props["aria-label"] === `${environment.label} runtime injection command`)!;
    const visible = textContent(pre).replace(/^\$ /, "");
    const command = secretsCommandForEnvironment(index);
    assert.equal(visible, command, "clipboard command must match the displayed shell command");
    assert.match(command, /^outray secrets run/);
    assert.match(command, /--org acme/);
    assert.match(command, /--vault checkout/);
    assert.ok(command.includes(`--env ${environment.slug}`));
    assert.ok(command.endsWith(`-- ${environment.command}`));
    assert.doesNotMatch(command, /^\s*\+/m, "patch markers must never leak into the copied command");
    if (environment.slug === "development") assert.match(command, /--watch/);
    else assert.doesNotMatch(command, /--watch/, "staging and production examples do not promise development watch behavior");
    if (environment.protected) {
      assert.match(command, /--confirm-production/);
      assert.match(renderToStaticMarkup(panel()), /Production confirmation required/);
    } else assert.doesNotMatch(command, /--confirm-production/);
    const copy = elements(tree).find((element) => typeof element.type === "function" && element.type.name === "CopyButton")!;
    assert.equal(copy.props.value, command);
    assert.equal(copy.props.label, `Copy ${environment.label} run command`);
    assert.match(renderToStaticMarkup(panel()), /6 values delivered to the child process/);
    const handoff = elements(panel()).find((element) => element.props.className === "handoff")!;
    assert.ok(handoff);
    assert.equal(handoff.props["aria-hidden"], "true", "the connector is decorative, not a live transfer indicator");
    assert.equal(elements(handoff).filter((element) => element.props.className === "flowTrack").length, 2);
    assert.doesNotMatch(renderToStaticMarkup(handoff), /<(?:button|a|input)\b|tabIndex="(?:0|[1-9]\d*)"|aria-live=|role="(?:status|alert)"/, "the handoff adds no controls, tab stops, or live announcements");
    const receipt = elements(panel()).find((element) => element.props.className === "terminalReceipt")!;
    assert.match(textContent(receipt), /6 values delivered to the child process/);
    const receiptKeys = elements(receipt).find((element) => element.props.className === "receiptKeys")!;
    assert.equal(receiptKeys.props["aria-hidden"], "true");
    assert.equal(elements(receiptKeys).filter((element) => element.type === "i").length, SECRET_ENVIRONMENT_KEYS.length);
    const process = elements(panel()).find((element) => element.props.className === "process")!;
    assert.equal(textContent(elements(process).find((element) => element.type === "code")), environment.command);
    assert.ok(textContent(process).includes(environment.watch ? "Watching for changes" : "Injected at startup"));
    assert.ok(!textContent(process).includes(environment.watch ? "Injected at startup" : "Watching for changes"));
    for (const className of ["vault", "handoff", "terminal", "process"]) {
      const animated = elements(panel()).find((element) => element.props.className === className)!;
      assert.ok(animated.key?.includes(environment.slug), "finite entrance animations remount for the selected environment");
    }
    if (environment.slug === "development") {
      const markup = renderToStaticMarkup(panel());
      assert.match(markup, /poll|check/i);
      assert.match(markup, /restart/i, "watch mode describes process restarts rather than in-place secret updates");
      assert.doesNotMatch(markup, /instant.*(?:sync|reload)|without.*restart/i);
    }
  };
  assert.equal(tabs().length, 3);
  assertEnvironment(0);
  tabs()[1].props.onClick(); tree = harness.render();
  assertEnvironment(1);
  tabs()[2].props.onClick(); tree = harness.render();
  assertEnvironment(2);
  for (const [key, index] of [["ArrowRight", 0], ["ArrowRight", 1], ["ArrowLeft", 0], ["ArrowLeft", 2], ["Home", 0], ["End", 2], ["ArrowDown", 0], ["ArrowUp", 2]] as const) {
    let prevented = false;
    selected().props.onKeyDown({ key, preventDefault() { prevented = true; } }); tree = harness.render();
    assert.ok(prevented);
    assert.equal(harness.focused, selected().props.id);
    assert.equal(selected().props.tabIndex, 0);
    assert.ok(tabs().filter((tab) => tab !== selected()).every((tab) => tab.props.tabIndex === -1));
    assertEnvironment(index);
  }
  let prevented = false;
  selected().props.onKeyDown({ key: "Tab", preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
});

test("the environment section is deterministic, accessible and scoped to separate target identities", () => {
  const html = renderToStaticMarkup(React.createElement(SecretsEnvironmentSection));
  assert.equal(html, renderToStaticMarkup(React.createElement(SecretsEnvironmentSection)));
  assert.match(html, /Secrets change\..*Your workflow keeps moving\./);
  assert.match(html, /role="tablist" aria-label="Choose a secrets environment"/);
  assert.match(html, /href="\/docs\/secrets\/cli"/);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
  assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /sk_live_|postgres(?:ql)?:\/\/|Reveal all|copies values between/i);
  const repeated = renderToStaticMarkup(React.createElement("div", null, React.createElement(SecretsEnvironmentSection), React.createElement(SecretsEnvironmentSection)));
  const controls = [...repeated.matchAll(/aria-controls="([^"]+-panel)"/g)].map((match) => match[1]);
  assert.equal(controls.length, 6);
  assert.equal(new Set(controls).size, 2);
  for (const id of controls) assert.ok(repeated.includes(`id="${id}"`));
});

test("the feature story uses real docs and bounded encryption, sharing and per-secret history claims", () => {
  const html = renderToStaticMarkup(secretsPage());
  const headings = [...html.matchAll(/<h2\b[^>]*id="(secrets-[^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(headings, ["secrets-problem-title", "secrets-environments-title", "secrets-share-title", "secrets-history-title", "secrets-start-title"]);
  const features = renderToStaticMarkup(React.createElement(SecretsFeatureSections));
  for (const destination of ["/docs/secrets/shares", "/docs/secrets/snapshots-and-history", "/docs/secrets/access-and-tokens", "/docs/secrets/trash-and-audit", "/signup", "/docs/secrets"]) assert.ok(features.includes(`href="${destination}"`));
  assert.match(features, /without inviting someone to your organization/);
  assert.match(features, /Encrypted snapshots, not your live vault/);
  assert.match(features, /Set an expiry and a reveal limit/);
  assert.match(features, /Revoke access to future reveals/);
  assert.match(features, /permissions it needs, scoped to a vault or environment/);
  assert.match(features, /Restore individual secret versions/);
  assert.match(features, /Previous versions stay in your history/);
  assert.match(features, /actor, target, and time\. Not the secret value/);
  assert.doesNotMatch(features, /zero.knowledge|end.to.end encrypted vault|server cannot decrypt|erase.*copied|restore (?:the )?(?:entire|whole) environment|instant.*rotation/i);
  const cta = features.match(/<section\b[^>]*aria-labelledby="secrets-start-title"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(cta);
  assert.match(cta, /href="\/signup"[^>]*>Get started/);
  assert.match(cta, /href="\/docs\/secrets"[^>]*>Read the docs/);
  assert.match(cta, /Delete your \.env file today\./);
});

test("the environment-file problem is a stacked, alternating avatar chat with deterministic masked content", async () => {
  const component = SecretsProblemSection();
  const nodes = elements(component);
  const html = renderToStaticMarkup(component);
  assert.equal(html, renderToStaticMarkup(React.createElement(SecretsProblemSection)));
  assert.match(html, /Stop passing.*\.env.*files around\./);
  const headingIndex = nodes.findIndex((element) => element.type === "h2" && element.props.id === "secrets-problem-title");
  const descriptionIndex = nodes.findIndex((element) => element.type === "p");
  const chatIndex = nodes.findIndex((element) => element.type === "ol");
  assert.ok(headingIndex >= 0 && headingIndex < descriptionIndex && descriptionIndex < chatIndex, "the heading and description precede the full-width chat");
  assert.equal(textContent(nodes[descriptionIndex]), "One quick ask turns into a credential in a group chat. Now nobody knows which version is current.");
  assert.equal(elements(nodes[headingIndex]).filter((element) => element.type === "br").length, 0, "the heading wraps naturally");
  assert.match(html, /aria-label="Team chat about environment secrets"/);
  const messages = nodes.filter((element) => element.type === "li");
  assert.equal(messages.length, 4);
  assert.deepEqual(messages.map((message) => message.props["data-side"]), ["sent", "received", "received", "sent"]);
  assert.deepEqual(messages.map((message) => {
    const paragraph = elements(message).find((element) => element.type === "p");
    assert.ok(paragraph);
    return React.Children.toArray(paragraph.props.children).filter((child) => typeof child === "string").join("");
  }), [
    "Anyone got the latest production Stripe key? Mine stopped working after the rotation.",
    "This one? Delete it when you’re done.",
    "Wait. Is that production or staging?",
    "My .env has a different value…",
  ], "the updated visual layout retains the original conversation");
  const senders = ["Amara Okafor", "Tobi Oladele", "Nneka Eze", "Amara Okafor"];
  const avatars = messages.map((message, index) => {
    assert.ok(textContent(message).includes(senders[index]), "each avatar has an adjacent sender name");
    const images = elements(message).filter((element) => element.type === "img");
    assert.equal(images.length, 1, "every message uses a real profile image");
    const avatar = images[0];
    assert.equal(avatar.props.alt, "", "adjacent sender names make profile images decorative");
    assert.ok(Number(avatar.props.width) > 0 && Number(avatar.props.height) > 0, "profile images reserve explicit dimensions");
    return avatar.props.src;
  });
  assert.deepEqual(avatars, ["/landing/secrets/avatars/amara.svg", "/landing/secrets/avatars/tobi.svg", "/landing/secrets/avatars/nneka.svg", "/landing/secrets/avatars/amara.svg"]);
  assert.equal(new Set(avatars).size, 3, "Amara reuses her deterministic local avatar");
  assert.deepEqual([...html.matchAll(/<time\b[^>]*dateTime="([^"]+)"/g)].map((match) => match[1]), ["22:24", "22:25", "22:26", "22:27"]);
  assert.match(html, /production\.env/);
  assert.deepEqual(nodes.filter((element) => element.type === "code").map((element) => textContent(element)), ["STRIPE_SECRET_KEY=sk_live_••••••••"]);
  assert.doesNotMatch(html, /sk_live_[a-z0-9]{5,}/i, "the problem example never embeds a usable-looking key");
  assert.match(textContent(messages[2]), /(?:production|new key).*staging/i);
  assert.match(html, /aria-label="3 people reacted with eyes"/);
  assert.doesNotMatch(html, /<button\b|Multiple copies\. No source of truth/, "the chat reaction is decorative, not a fake control or caption");
  const source = await readFile(new URL("../src/landing/products/SecretsProblemSection.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/landing/products/SecretsProblemSection.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(source, /useEffect|setTimeout|setInterval|fetch\(|Date\.|Math\.random/);
  assert.match(css, /animation:\s*message-arrive\s+[\d.]+m?s\b/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  assert.match(css, /@media\s*\(max-width:\s*[^)]+\)[\s\S]*\.message\s*\{[^}]*max-width:/);
  assert.doesNotMatch(css, /\binfinite\b|(?:linear|radial)-gradient\(/);
  const section = css.match(/\.section\s*\{([^}]+)\}/)?.[1];
  assert.ok(section);
  assert.doesNotMatch(section, /display:\s*(?:grid|flex)|grid-template-columns:/, "the copy and chat stay in stacked block flow at desktop widths");
  assert.doesNotMatch(section, /\bborder(?:-top|-bottom)?:|\bbackground:/);
  assert.match(css, /\.message\[data-side="sent"\]\s*\{[^}]*flex-direction:\s*row-reverse;[^}]*margin-left:\s*auto/);
  assert.match(css, /\.message\[data-side="received"\]\s*\{[^}]*margin-right:\s*auto/);
});

test("scoped-token and audit previews show permission boundaries and attributable actions rather than secret values", () => {
  const token = renderToStaticMarkup(React.createElement(SecretMachineTokenVisual));
  assert.equal(token, renderToStaticMarkup(React.createElement(SecretMachineTokenVisual)));
  assert.match(token, /role="group" aria-label="Scoped machine token"/);
  for (const value of ["Production deploy", "secrets:read", "Read only", "checkout", "Production", "30 days", "No write or delete permissions"]) assert.ok(token.includes(value));
  const tokenMetadata = elements(SecretMachineTokenVisual()).filter((element) => element.type === "dd").map((element) => textContent(element));
  assert.deepEqual(tokenMetadata, ["checkout", "Production", "30 days"], "machine access uses the same vault name as the CLI target");
  assert.doesNotMatch(token, /secrets:write|secrets:delete|<button\b|outray_[a-z0-9]{10,}/i);
  const audit = renderToStaticMarkup(React.createElement(SecretAuditVisual));
  assert.equal(audit, renderToStaticMarkup(React.createElement(SecretAuditVisual)));
  assert.match(audit, /role="group" aria-label="Recorded secret actions"/);
  assert.equal((audit.match(/<li\b/g) ?? []).length, SECRET_AUDIT_EVENTS.length);
  assert.equal(SECRET_AUDIT_EVENTS.length, 3);
  assert.equal(SECRET_AUDIT_EVENTS.find((event) => event.machine)?.action, "Read", "a server read event does not claim the child process was launched");
  for (const event of SECRET_AUDIT_EVENTS) {
    for (const value of [event.actor, event.action, event.target, event.time]) assert.ok(audit.includes(value));
    assert.match(event.dateTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    assert.ok(audit.includes(`dateTime="${event.dateTime}"`));
  }
  assert.doesNotMatch(audit, /sk_live_|password=|postgres(?:ql)?:\/\/|<button\b/i);
});

test("share snapshots enforce reveals and revocation without pretending to erase already revealed values", async () => {
  const html = renderToStaticMarkup(React.createElement(SecretShareVisual));
  assert.equal(html, renderToStaticMarkup(React.createElement(SecretShareVisual)));
  assert.match(html, /3 reveals left/);
  assert.match(html, /An encrypted snapshot\. Not a live connection to your vault\./);
  assert.doesNotMatch(html, /https:\/\/api\.example\.com/);
  const harness = await interactionHarness("SecretsFeatureSections", "SecretShareVisual");
  let tree = harness.render();
  const button = (label: string) => {
    const result = elements(tree).find((element) => element.type === "button" && textContent(element) === label);
    assert.ok(result, `The ${label} action is available`);
    return result;
  };
  const assertState = (remaining: number, revealed: boolean) => {
    const markup = renderToStaticMarkup(tree);
    assert.ok(markup.includes(`${remaining} reveals left`));
    const values = elements(tree).filter((element) => element.type === "dd");
    assert.equal(values.length, 3);
    assert.ok(values.every((value) => value.props["data-revealed"] === revealed));
    if (revealed) assert.ok(markup.includes("https://api.example.com"));
    else assert.ok(values.every((value) => value.props.children === "••••••••••••"));
  };
  assertState(3, false);
  button("Reveal snapshot").props.onClick(); tree = harness.render();
  assertState(2, true);
  assert.equal(button("Hide values").props["aria-pressed"], true);
  button("Hide values").props.onClick(); tree = harness.render();
  assertState(2, false);
  button("Reveal snapshot").props.onClick(); tree = harness.render();
  assertState(1, true);
  button("Revoke link").props.onClick(); tree = harness.render();
  assertState(1, true);
  assert.match(renderToStaticMarkup(tree), /Future reveals are blocked\. Values already revealed are not erased\./);
  assert.equal(button("Hide values").props.disabled, false, "a revoked link still lets the viewer hide the values already displayed");
  button("Hide values").props.onClick(); tree = harness.render();
  assertState(1, false);
  assert.equal(button("Link revoked").props.disabled, true);
  button("Link revoked").props.onClick(); tree = harness.render();
  assertState(1, false);
  button("Create another link").props.onClick(); tree = harness.render();
  assertState(3, false);
  for (const remaining of [2, 1, 0]) {
    button("Reveal snapshot").props.onClick(); tree = harness.render();
    assertState(remaining, true);
    assert.equal(button("Hide values").props.disabled, false);
    button("Hide values").props.onClick(); tree = harness.render();
    assertState(remaining, false);
  }
  assert.equal(button("Reveal limit reached").props.disabled, true);
  button("Reveal limit reached").props.onClick(); tree = harness.render();
  assertState(0, false);
  button("Create another link").props.onClick(); tree = harness.render();
  assertState(3, false);
});

test("secret version controls inspect masked per-secret metadata without changing the current version", async () => {
  const html = renderToStaticMarkup(React.createElement(SecretHistoryVisual));
  assert.equal(html, renderToStaticMarkup(React.createElement(SecretHistoryVisual)));
  assert.match(html, /aria-label="Secret version history"/);
  assert.match(html, /aria-label="Selected secret version"/);
  assert.equal(SECRET_HISTORY_VERSIONS.filter((version) => version.current).length, 1);
  for (let index = 0; index < 3; index++) {
    for (const key of ["ArrowDown", "ArrowRight"]) assert.equal(secretHistoryIndexFromKey(index, key), (index + 1) % 3);
    for (const key of ["ArrowUp", "ArrowLeft"]) assert.equal(secretHistoryIndexFromKey(index, key), (index + 2) % 3);
    assert.equal(secretHistoryIndexFromKey(index, "Home"), 0);
    assert.equal(secretHistoryIndexFromKey(index, "End"), 2);
    assert.equal(secretHistoryIndexFromKey(index, "Tab"), null);
  }
  const harness = await interactionHarness("SecretsFeatureSections", "SecretHistoryVisual");
  let tree = harness.render();
  const rows = () => elements(tree).filter((element) => element.type === "button" && "aria-pressed" in element.props);
  const selected = () => rows().find((row) => row.props["aria-pressed"] === true)!;
  const detail = () => elements(tree).find((element) => element.props["aria-label"] === "Selected secret version")!;
  const assertVersion = (index: number) => {
    const version = SECRET_HISTORY_VERSIONS[index];
    const markup = renderToStaticMarkup(detail());
    for (const value of [`Version ${version.version}`, version.action, version.actor, version.date, "Value hidden"]) assert.ok(markup.includes(value));
    assert.match(markup, /••••••••••••••••••••••••/);
    assert.doesNotMatch(markup, /postgres(?:ql)?:\/\/|sk_live_|password=/i);
    assert.equal(selected(), rows()[index]);
    assert.deepEqual(SECRET_HISTORY_VERSIONS.map(({ current }) => current), [true, false, false], "preview selection does not restore or mutate a historical version");
  };
  assert.equal(rows().length, 3);
  assertVersion(0);
  rows().forEach((row, index) => {
    const version = SECRET_HISTORY_VERSIONS[index];
    assert.equal(row.props["aria-label"], `Inspect version ${version.version}${version.current ? ", current" : ""}`);
    assert.equal(row.props["aria-controls"], detail().props.id);
  });
  rows()[2].props.onClick(); tree = harness.render();
  assertVersion(2);
  rows()[1].props.onFocus(); tree = harness.render();
  assertVersion(1);
  for (const [key, index] of [["End", 2], ["ArrowRight", 0], ["ArrowLeft", 2], ["Home", 0], ["ArrowDown", 1], ["ArrowUp", 0]] as const) {
    let prevented = false;
    selected().props.onKeyDown({ key, preventDefault() { prevented = true; } }); tree = harness.render();
    assert.ok(prevented);
    assert.equal(harness.focused, selected().props["aria-label"]);
    assert.equal(selected().props.tabIndex, 0);
    assert.ok(rows().filter((row) => row !== selected()).every((row) => row.props.tabIndex === -1));
    assertVersion(index);
  }
  let prevented = false;
  selected().props.onKeyDown({ key: "Tab", preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  const repeated = renderToStaticMarkup(React.createElement("div", null, React.createElement(SecretHistoryVisual), React.createElement(SecretHistoryVisual)));
  const controls = [...repeated.matchAll(/aria-controls="([^"]+-version-detail)"/g)].map((match) => match[1]);
  assert.equal(controls.length, 6);
  assert.equal(new Set(controls).size, 2);
});

test("Secrets environment and feature surfaces are responsive, motion-safe and do not call live APIs", async () => {
  for (const component of ["SecretsEnvironmentSection", "SecretsFeatureSections"]) {
    const source = await readFile(new URL(`../src/landing/products/${component}.tsx`, import.meta.url), "utf8");
    const css = await readFile(new URL(`../src/landing/products/${component}.module.css`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /setInterval|setTimeout|useEffect|Date\.|Math\.random|fetch\(|navigator\.clipboard|dangerouslySetInnerHTML/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /animation: none/);
    assert.doesNotMatch(css, /\binfinite\b|(?:linear|radial)-gradient\(/);
    const section = css.match(/\.section\s*\{([^}]+)\}/)?.[1];
    assert.ok(section);
    assert.doesNotMatch(section, /\bborder(?:-top|-bottom)?:|\bbackground:/);
    assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  }
  const environment = await readFile(new URL("../src/landing/products/SecretsEnvironmentSection.module.css", import.meta.url), "utf8");
  assert.match(environment, /\.command\s*\{[^}]*min-height:\s*[\d.]+(?:px|rem|em)/);
  assert.match(environment, /\.command:focus-visible/);
  assert.match(environment, /@media \(max-width: 540px\)/);
  assert.match(environment, /\.environmentTab:focus-visible/);
  assert.match(environment, /\.environmentTabs\s*\{[^}]*display:\s*flex/);
  assert.match(environment, /\.flowTrack i\s*\{[^}]*animation:\s*secret-handoff\s+[\d.]+m?s\b/);
  const mobileEnvironment = [...environment.matchAll(/@media\s*\(max-width:\s*[^)]+\)\s*\{([\s\S]*?)\n\}/g)].map((match) => match[1]);
  assert.ok(mobileEnvironment.some((css) => /\.environmentGrid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(css) && /\.handoff\s*\{[^}]*flex-direction:\s*column/.test(css)), "the connector follows the stacked mobile vault-to-process layout");
  assert.match(environment, /\.flowTrack i\s*\{[^}]*animation-name:\s*secret-handoff-down/);
  const reducedEnvironment = environment.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(reducedEnvironment);
  for (const selector of ["\\.keys li", "\\.flowTrack i", "\\.receiptKeys i", "\\.process", "\\.watchIcon"]) {
    assert.match(reducedEnvironment, new RegExp(`${selector}[^{}]*\\{[^}]*animation:\\s*none`), "reduced motion disables every added entrance, handoff and watch animation");
  }
  assert.match(reducedEnvironment, /\.flowTrack i\s*\{[^}]*display:\s*none/);
  const features = await readFile(new URL("../src/landing/products/SecretsFeatureSections.module.css", import.meta.url), "utf8");
  assert.match(features, /\.versionButton:focus-visible/);
  assert.match(features, /\.revealButton:focus-visible/);
  assert.match(features, /@media \(max-width: 760px\)/);
  assert.match(features, /@media \(max-width: 440px\)/);
});
