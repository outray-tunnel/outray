import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { ProductSetup } from "../src/components/onboarding/product-setup";
import { parseSetupProduct, type SetupProduct } from "../src/components/onboarding/setup-products";
import { observabilitySetupCode, setupCliCommand } from "../src/components/onboarding/setup-endpoints";

Object.assign(globalThis, { React });

function renderProduct(product: SetupProduct) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: [`/acme/setup?product=${product}`] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(React.createElement(QueryClientProvider, { client: queryClient, children: React.createElement(RouterContextProvider, {
    router,
    children: React.createElement(ProductSetup, { orgSlug: "acme", product }),
  }) }));
}

test("setup search accepts the four products and falls back safely for invalid URL values", () => {
  for (const product of ["tunnels", "observability", "secrets", "uptime"] as const) assert.equal(parseSetupProduct(product), product);
  for (const product of [undefined, null, "", "unknown", "UPTIME", ["secrets"], {}, true, 3]) assert.equal(parseSetupProduct(product), "tunnels");
});

test("all four setup pages server-render the compact branded workspace layout without making requests", () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("SSR must not make a setup request"); };
  try {
    for (const [product, title, consolePath] of [
      ["tunnels", "Connect your first tunnel", "/acme/tunnel"],
      ["observability", "Instrument your first service", "/acme/observability"],
      ["secrets", "Store your first secret", "/acme/secrets"],
      ["uptime", "Watch your first endpoint", "/acme/uptime"],
    ] as const) {
      const html = renderProduct(product);
      assert.ok(html.includes(title));
      assert.match(html, /text-\[20px\] font-normal/);
      assert.match(html, /lg:grid-cols-\[minmax\(0,1fr\)_280px\]/);
      assert.match(html, /aria-label="Connection verification"/);
      assert.match(html, /Checking your workspace/);
      assert.ok(html.includes(`href="${consolePath}"`));
      assert.match(html, /href="\/acme\/get-started"/);
      assert.equal((html.match(/<main\b/g) ?? []).length, 1);
      assert.doesNotMatch(html, /text-\[34px\]|text-\[42px\]|rounded-\[24px\]|Continue to console|Connection verified/);
    }
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tunnel setup retains every command in mounted compact panels", () => {
  const html = renderProduct("tunnels");
  assert.match(html, /npm install -g outray/);
  assert.match(html, /outray login/);
  assert.match(html, /outray 3000 --org acme/);
  assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 3);
  assert.equal((html.match(/hidden=""/g) ?? []).length, 2);
  assert.match(html, /Next step/);
  assert.doesNotMatch(html, /Check connection|Check again|Complete setup/);
});

test("observability setup retains scoped token creation, a custom framework menu, and copyable SDK instructions", () => {
  const html = renderProduct("observability");
  assert.match(html, /Create ingest token/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /aria-label="Framework" aria-haspopup="listbox" aria-expanded="false"/);
  const trigger = html.match(/<button[^>]*aria-label="Framework"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(trigger);
  assert.match(trigger, /<img src="https:\/\/svgl\.app\/library\/nodejs\.svg" alt="" draggable="false" class="size-4 object-contain"/);
  assert.match(html, /npm install @outray\/observability/);
  assert.match(html, /bootstrap\.ts/);
  assert.match(html, /captureConsole: true/);
  assert.match(html, /aria-label="Copy bootstrap\.ts"/);
  assert.doesNotMatch(html, /<select\b/);
});

test("Uptime setup creates monitors inline and keeps the optional status-page builder link", () => {
  const html = renderProduct("uptime");
  assert.match(html, /<form\b/);
  assert.match(html, /Monitor name/);
  assert.match(html, /Public URL/);
  assert.match(html, /Create monitor/);
  assert.doesNotMatch(html, /href="\/acme\/uptime\/monitors"/);
  assert.match(html, /href="\/acme\/uptime\/status-page"/);
  assert.match(html, /[Pp]rivate addresses are not supported/);
  assert.match(html, /state remains Unknown until a check completes/);
  assert.match(html, /stand alone or belong to a group/);
});

test("Secrets initial loading uses a matched skeleton instead of flashing a blank-vault creation form", () => {
  const html = renderProduct("secrets");
  assert.match(html, /aria-busy="true" aria-label="Loading vault setup"/);
  assert.match(html, /min-h-\[280px\]/);
  assert.match(html, /motion-reduce:animate-none/);
  assert.doesNotMatch(html, /Create vault|<form|Loading\.\.\./);
});

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<any>;
  return [element, ...elements(element.props.children)];
}

const environment = (slug: string, revision: number, secretCount = 2) => ({ slug, name: slug === "development" ? "Development" : "Production", revision, secretCount });
const project = (slug = "app") => ({ slug, name: slug === "app" ? "Application" : "Other", secretCount: 4, environments: [environment("production", 9), environment("development", 3)] });
const normalize = (value: unknown) => JSON.parse(JSON.stringify(value));

/** Run the real local handlers without importing server, auth, database, or network code. */
async function loadSetup(initialState: any[] = [], clients: Record<string, any> = {}) {
  const source = await readFile(new URL("../src/components/onboarding/product-setup.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(`${source}\nexport { SecretsSetup, useProductVerification };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const guideSource = await readFile(new URL("../src/components/onboarding/observability-setup.tsx", import.meta.url), "utf8");
  const guideCompiled = ts.transpileModule(guideSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const values = initialState.slice();
  const effects: Array<() => void | (() => void)> = [];
  const callbacks: Array<(...args: any[]) => any> = [];
  const timers: Array<{ callback: () => void; delay: number }> = [];
  const cleared: number[] = [];
  let index = 0;
  let verified = 0;
  const module = { exports: {} as Record<string, (...args: any[]) => any> };
  const guideModule = { exports: {} as Record<string, (...args: any[]) => any> };
  const secretsClient = {
    projects: async () => [],
    createProject: async () => project("new"),
    createSecret: async () => ({}),
    overview: async () => ({ secretCount: 0 }),
    ...clients.secrets,
  };
  const stubs = Object.fromEntries(["CreateTokenModal", "Button", "Select", "OnboardingShell", "SetupFlow", "SetupStep", "SetupCodeBlock", "UptimeMonitorForm", "DialogRoot", "DialogContent", "DialogTitle"].map((name) => [name, (props: any) => React.createElement("div", { "data-component": name }, props.children)]));
  const dependencies = {
    React, Error, Promise,
    fetch: clients.fetch ?? (async () => { throw new Error("Unexpected fetch"); }),
    window: {
      setTimeout: (callback: () => void, delay: number) => { timers.push({ callback, delay }); return timers.length; },
      clearTimeout: (timer: number) => { cleared.push(timer); },
    },
    require: (specifier: string) => {
      if (specifier === "react") return {
        useState: (initial: any) => {
          const slot = index++;
          if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
          return [values[slot], (next: any) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }];
        },
        useCallback: (callback: (...args: any[]) => any) => { callbacks.push(callback); return callback; },
        useEffect: (effect: () => void | (() => void)) => { effects.push(effect); },
        useRef: (initial: unknown) => ({ current: initial }),
      };
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: () => null };
      if (specifier === "@radix-ui/react-dialog") return { Root: stubs.DialogRoot, Content: stubs.DialogContent, Title: stubs.DialogTitle };
      if (specifier.startsWith("@hugeicons-pro/")) return { __esModule: true, default: [] };
      if (specifier === "@tanstack/react-router") return { Link: (props: any) => React.createElement("a", { href: props.to }, props.children) };
      if (specifier === "@/lib/secrets-client") return { secretsClient };
      if (specifier === "@/lib/app-client") return { appClient: clients.app ?? { tunnels: { list: async () => ({ tunnels: [] }) } } };
      if (specifier === "./setup-products") return { parseSetupProduct };
      if (specifier === "./observability-setup") return guideModule.exports;
      if (specifier === "./setup-endpoints") return { observabilitySetupCode, setupCliCommand };
      if (specifier.endsWith("ui/workspace-input")) return { WorkspaceInput: "input", WorkspaceTextarea: "textarea" };
      if (specifier.startsWith("@/components/") || specifier === "./setup-ui" || specifier === "./onboarding-shell" || specifier === "./uptime-monitor-form") return stubs;
      throw new Error(`Unexpected setup dependency: ${specifier}`);
    },
  };
  runInNewContext(guideCompiled, { ...dependencies, module: guideModule, exports: guideModule.exports });
  runInNewContext(compiled, { ...dependencies, module, exports: module.exports });
  return {
    values, effects, callbacks, timers, cleared, stubs,
    get verified() { return verified; },
    renderSecrets() {
      index = 0; callbacks.length = 0; effects.length = 0;
      return module.exports.SecretsSetup({ orgSlug: "acme", onSecretCreated: () => { verified++; } });
    },
    renderFramework() {
      index = 0;
      return guideModule.exports.ObservabilitySetup({ orgSlug: "acme", onRecheck: () => {} });
    },
    renderProduct(product: SetupProduct) {
      index = 0; callbacks.length = 0; effects.length = 0;
      return module.exports.ProductSetup({ orgSlug: "acme", product });
    },
    verification(product: SetupProduct, orgSlug = "acme", targetMonitorId?: string) {
      index = 0;
      return module.exports.useProductVerification(orgSlug, product, 0, targetMonitorId);
    },
  };
}

const secretState = (overrides: Record<number, unknown> = {}) => Object.assign([
  [project(), project("other")], false, "app", "development", "", "API_KEY", "example-value", false, false, null, null, null,
], overrides);
const event = () => ({ preventDefault() {} });
function submit(tree: React.ReactNode) {
  const form = elements(tree).find((element) => element.type === "form");
  assert.ok(form);
  return form.props.onSubmit(event());
}

test("vault creation errors retain the entered name; successful creation selects Development and clears it", async () => {
  let fail = true;
  const calls: any[] = [];
  const created = project("created");
  const setup = await loadSetup(secretState({ 0: [], 4: "  Customer API  " }), {
    secrets: { createProject: async (...args: any[]) => { calls.push(args); if (fail) throw new Error("Vault rejected"); return created; } },
  });
  await submit(setup.renderSecrets());
  assert.equal(setup.values[4], "  Customer API  ");
  assert.equal(setup.values[9], "Vault rejected");
  assert.equal(setup.values[7], false);
  assert.equal(setup.values[0].length, 0);
  fail = false;
  await submit(setup.renderSecrets());
  assert.deepEqual(normalize(calls[1]), ["acme", { name: "Customer API" }]);
  assert.equal(setup.values[4], "");
  assert.equal(setup.values[2], "created");
  assert.equal(setup.values[3], "development");
  assert.equal(setup.values[0].length, 1);
  assert.equal(setup.values[9], null);
});

test("secret errors preserve inputs and revisions; success clears inputs and increments only its destination", async () => {
  let fail = true;
  const calls: any[] = [];
  const setup = await loadSetup(secretState(), {
    secrets: { createSecret: async (...args: any[]) => { calls.push(args); if (fail) throw new Error("Revision conflict"); return {}; } },
  });
  await submit(setup.renderSecrets());
  assert.equal(setup.values[5], "API_KEY");
  assert.equal(setup.values[6], "example-value");
  assert.equal(setup.values[9], "Revision conflict");
  assert.equal(setup.values[0][0].environments[1].revision, 3);
  assert.equal(setup.verified, 0);
  fail = false;
  await submit(setup.renderSecrets());
  assert.deepEqual(normalize(calls[1]), ["acme", "app", "development", {
    key: "API_KEY", value: "example-value", environmentSlugs: ["development"], expectedRevisions: { development: 3 }, expectedRevision: 3,
  }]);
  assert.equal(setup.values[5], "");
  assert.equal(setup.values[6], "");
  assert.equal(setup.values[8], false);
  assert.equal(setup.values[9], null);
  assert.equal(setup.values[11], "Saved to Application / Development.");
  assert.equal(setup.values[0][0].secretCount, 5);
  assert.equal(setup.values[0][0].environments[1].revision, 4);
  assert.equal(setup.values[0][0].environments[1].secretCount, 3);
  assert.equal(setup.values[0][0].environments[0].revision, 9);
  assert.deepEqual(normalize(setup.values[0][1]), project("other"));
  assert.equal(setup.verified, 1);
});

test("invalid keys, missing destinations, and pending saves cannot submit duplicate mutations", async () => {
  let mutations = 0;
  for (const overrides of [{ 5: "" }, { 5: "1_BAD" }, { 5: "bad-key" }, { 2: "missing" }, { 0: [{ ...project(), environments: [] }] }, { 8: true }]) {
    const setup = await loadSetup(secretState(overrides), { secrets: { createSecret: async () => { mutations++; } } });
    await submit(setup.renderSecrets());
    assert.equal(setup.verified, 0);
  }
  for (const overrides of [{ 4: "   " }, { 4: "Application", 7: true }]) {
    const setup = await loadSetup(secretState({ 0: [], ...overrides }), { secrets: { createProject: async () => { mutations++; return project(); } } });
    await submit(setup.renderSecrets());
  }
  assert.equal(mutations, 0);
});

test("pending Secrets forms retain text but lock destination selectors and editing", async () => {
  const setup = await loadSetup(secretState({ 8: true }));
  const tree = elements(setup.renderSecrets());
  const selectors = tree.filter((element) => element.type === setup.stubs.Select);
  assert.equal(selectors.length, 2);
  for (const selector of selectors) assert.equal(selector.props.disabled, true);
  for (const input of tree.filter((element) => element.type === "input" || element.type === "textarea")) assert.equal(input.props.readOnly, true);
  const vault = await loadSetup(secretState({ 0: [], 4: "Example", 7: true }));
  assert.equal(elements(vault.renderSecrets()).find((element) => element.type === "input")?.props.readOnly, true);
});

test("vault-load errors show their own retry state and never masquerade as an empty vault list", async () => {
  let fail = true;
  const setup = await loadSetup(secretState({ 0: [] }), { secrets: { projects: async () => { if (fail) throw new Error("Vault service unavailable"); return [project()]; } } });
  setup.renderSecrets();
  await setup.callbacks[0]();
  assert.equal(setup.values[1], false);
  assert.equal(setup.values[10], "Vault service unavailable");
  const failed = setup.renderSecrets();
  assert.equal(failed.props.role, "alert");
  assert.equal(elements(failed).some((element) => element.type === "form"), false);
  assert.ok(elements(failed).some((element) => element.props.children === "Could not load vaults"));
  fail = false;
  await setup.callbacks[0]();
  assert.equal(setup.values[10], null);
  assert.equal(setup.values[0].length, 1);
});

test("all framework adapters retain their package, file, selected logo, and aligned description", async () => {
  for (const [framework, packageName, fileName, logo] of [
    ["node", "@outray/observability", "bootstrap.ts", "nodejs.svg"], ["express", "@outray/express", "server.ts", "expressjs_dark.svg"],
    ["nestjs", "@outray/nest", "main.ts", "nestjs.svg"], ["nextjs", "@outray/next", "instrumentation.ts", "nextjs_icon_dark.svg"],
    ["hono", "@outray/hono", "server.ts", "hono.svg"], ["tanstack-start", "@outray/tanstack-start", "src/server.ts", "tanstack_dark.svg"],
  ]) {
    const setup = await loadSetup([false, framework]);
    const tree = elements(setup.renderFramework());
    const blocks = tree.filter((element) => element.type === setup.stubs.SetupCodeBlock);
    assert.ok(blocks.some((block) => block.props.children === `npm install ${packageName}`));
    assert.ok(blocks.some((block) => block.props.fileName === fileName && block.props.children.includes("captureConsole: true")));
    const menu = tree.find((element) => element.type === setup.stubs.Select);
    assert.ok(menu);
    assert.equal(menu?.props.options.length, 6);
    assert.equal(menu?.props.value, framework);
    const selectedLogo = menu.props.icon as React.ReactElement<any>;
    assert.equal(selectedLogo.type, "img");
    assert.equal(selectedLogo.props.src, `https://svgl.app/library/${logo}`);
    assert.equal(selectedLogo.props.alt, "");
    assert.equal(selectedLogo.props.draggable, false);
    assert.equal(selectedLogo.props.className, "size-4 object-contain");
    const selectedOption = menu.props.options.find((option: any) => option.value === framework);
    assert.equal(selectedLogo.props.src, selectedOption.icon.props.src);
    const row = tree.find((element) => element.type === "div" && Array.isArray(element.props.children) && element.props.children[0] === menu);
    assert.ok(row, "the dropdown is a direct column, not a label-plus-dropdown wrapper");
    assert.match(row.props.className, /grid items-center/);
    assert.match(row.props.className, /sm:grid-cols-\[240px_minmax\(0,1fr\)\]/);
    assert.equal(row.props.children.length, 2);
    assert.equal(row.props.children[1].type, "p");
    assert.equal(row.props.children[1].props.children, selectedOption.description);
    const installStep = tree.find((element) => element.type === setup.stubs.SetupStep && element.props.number === "02");
    assert.ok(installStep);
    const siblings = installStep.props.children;
    const rowIndex = siblings.indexOf(row);
    assert.ok(rowIndex > 0);
    assert.equal(siblings[rowIndex - 1].type, "p");
    assert.equal(siblings[rowIndex - 1].props.children, "Framework", "the label stays above both aligned columns");
    menu?.props.onChange("invalid-framework");
    assert.equal(setup.values[1], framework);
    assert.equal(tree.some((element) => element.type === setup.stubs.CreateTokenModal), false, "the closed token dialog does not retain plaintext or mounted forms");
    const createToken = tree.find((element) => element.type === setup.stubs.Button && element.props["aria-haspopup"] === "dialog");
    assert.ok(createToken);
    createToken.props.onClick();
    const modal = elements(setup.renderFramework()).find((element) => element.type === setup.stubs.CreateTokenModal);
    assert.deepEqual(normalize(modal?.props.defaultScopes), ["observability:write"]);
    assert.equal(modal?.props.orgSlug, "acme");
  }
});

test("verification completes only on actual product evidence and is workspace-scoped", async () => {
  for (const product of ["tunnels", "observability", "secrets", "uptime"] as const) {
    const calls: any[] = [];
    const setup = await loadSetup([], {
      app: { tunnels: { list: async (slug: string) => { calls.push(slug); return { tunnels: [{ name: "API" }] }; } } },
      secrets: { overview: async (slug: string) => { calls.push(slug); return { secretCount: 3 }; } },
      fetch: async (path: string, options: object) => {
        calls.push([path, options]);
        return { ok: true, json: async () => product === "observability" ? { services: ["API"] } : { monitors: [{ name: "Uninitialized", lastCheckedAt: null }, { name: "API", lastCheckedAt: "2026-10-05T12:00:00Z" }] } };
      },
    });
    setup.verification(product, "team /?");
    setup.effects[0]();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(setup.values[0], "complete");
    assert.equal(setup.values[2], null);
    assert.equal(setup.timers.length, 0);
    if (product === "uptime" || product === "observability") {
      assert.ok(calls[0][0].startsWith("/api/team%20%2F%3F/"));
      assert.deepEqual(normalize(calls[0][1]), { credentials: "same-origin", cache: "no-store" });
    } else assert.equal(calls[0], "team /?");
  }
});

test("uninitialized Uptime monitors stay waiting, and failed verification retries without claiming success", async () => {
  for (const ok of [true, false]) {
    const setup = await loadSetup([], { fetch: async () => ({ ok, json: async () => ({ monitors: [{ name: "Not checked", lastCheckedAt: null }] }) }) });
    setup.verification("uptime");
    const cleanup = setup.effects[0]();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(setup.values[0], "waiting");
    assert.equal(setup.values[1], null);
    assert.equal(setup.timers.length, 1);
    assert.equal(setup.timers[0].delay, 4000);
    assert.equal(setup.values[2], ok ? null : "Verification is temporarily unavailable. Retrying…");
    assert.equal(typeof cleanup, "function");
    cleanup?.();
    assert.deepEqual(setup.cleared, [1]);
  }
});

test("a newly created monitor must have its own completed check even if an existing monitor was checked", async () => {
  for (const includeNew of [false, true]) {
    let checked = false;
    const setup = await loadSetup([], { fetch: async () => ({
      ok: true,
      json: async () => ({ monitors: [
        { id: "old", name: "Existing API", lastCheckedAt: "2026-10-05T12:00:00Z" },
        ...(includeNew ? [{ id: "new", name: "New API", lastCheckedAt: checked ? "2026-10-05T12:01:00Z" : null }] : []),
      ] }),
    }) });
    setup.verification("uptime", "acme", "new");
    const cleanup = setup.effects[0]();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(setup.values[0], "waiting", "an old or unrelated check is not evidence for the newly created monitor");
    assert.notEqual(setup.values[1], "Existing API");
    if (includeNew) {
      checked = true;
      setup.timers[0].callback();
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(setup.values[0], "complete");
      assert.equal(setup.values[1], "New API");
    }
    cleanup?.();
  }
});

test("inline monitor creation records the new verification target and rechecks without leaving setup", async () => {
  const setup = await loadSetup();
  const tree = elements(setup.renderProduct("uptime"));
  const uptime = tree.find((element) => typeof element.type === "function" && element.type.name === "UptimeSetup");
  assert.ok(uptime);
  const monitorForm = elements((uptime.type as React.FunctionComponent<any>)(uptime.props)).find((element) => element.type === setup.stubs.UptimeMonitorForm);
  assert.ok(monitorForm);
  assert.equal(monitorForm.props.orgSlug, "acme");
  assert.equal(typeof monitorForm.props.onCreated, "function");
  const monitor = { id: "new", name: "New API", url: "https://example.com/health", lastCheckedAt: null };
  monitorForm.props.onCreated(monitor);
  assert.equal(setup.values[0], 1, "saving increments the explicit verification refresh");
  assert.ok(setup.values.some((value) => value?.id === "new"), "saving records the created monitor rather than accepting any existing check");
});

test("switching verification to a new monitor hides a completed result before the next effect runs", async () => {
  const setup = await loadSetup(["complete", "Existing API", null, "acme:uptime:0:old"]);
  const result = setup.verification("uptime", "acme", "new");
  assert.deepEqual(normalize(result), { state: "checking", detail: null, error: null });
});
