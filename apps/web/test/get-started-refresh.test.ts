import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  RouterContextProvider,
} from "@tanstack/react-router";
import ts from "typescript";

Object.assign(globalThis, { React });

/** Render the restored route itself while keeping route params isolated. */
async function render(orgSlug = "acme") {
  const source = await readFile(new URL("../src/routes/$orgSlug/get-started.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const module = { exports: {} as { Route: { options: { component: React.ComponentType } } } };
  runInNewContext(compiled, {
    module, exports: module.exports, React,
    require: (specifier: string) => {
      if (specifier === "@tanstack/react-router") return {
        Link,
        createFileRoute: () => (options: object) => ({ options, useParams: () => ({ orgSlug }) }),
      };
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: () => null };
      if (specifier.startsWith("@hugeicons-pro/")) return { default: [] };
      throw new Error(`Unexpected Get started dependency: ${specifier}`);
    },
  });
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({
    routeTree: root.addChildren([org.addChildren([rest])]),
    history: createMemoryHistory({ initialEntries: [`/${orgSlug}/get-started`] }),
  });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, {
    router,
    children: React.createElement(module.exports.Route.options.component),
  }));
}

test("Get started restores the original branded header and product-choice introduction", async () => {
  const html = await render();
  assert.match(html, /h-\[76px\]/);
  assert.match(html, /src="\/logo\.png"/);
  assert.match(html, /Workspace ready/);
  assert.match(html, /What do you want to do first\?/);
  assert.match(html, /text-\[34px\] font-semibold/);
  assert.match(html, /this choice does not lock you in/);
  assert.doesNotMatch(html, /Choose a product to set up first/);
});

test("all four original product cards retain their improved setup destinations", async () => {
  const html = await render();
  const cards = [...html.matchAll(/<a\b[^>]*href="\/acme\/setup\?product=([^"]+)"[^>]*>[\s\S]*?<\/a>/g)];
  assert.deepEqual(cards.map(([, product]) => product), ["tunnels", "observability", "secrets", "uptime"]);
  for (const [card] of cards) {
    assert.match(card, /Set up /);
    assert.match(card, /<h2 class="[^"]*text-\[19px\] font-semibold/);
  }
});

test("Get started restores the original responsive four-card presentation", async () => {
  const html = await render();
  assert.match(html, /grid gap-4 md:grid-cols-2 xl:grid-cols-4/);
  assert.equal((html.match(/min-h-\[310px\]/g) ?? []).length, 4);
  assert.equal((html.match(/rounded-\[24px\]/g) ?? []).length, 4);
  assert.match(html, /aria-label="Choose an OutRay product"/);
});

test("restored product cards retain the original CLI, telemetry, vault and status-page guidance", async () => {
  const html = await render();
  for (const detail of [
    "Install the CLI and start your first tunnel in a few commands.",
    "Instrument a service and see what it is doing in production.",
    "Create a vault, add environments, and inject secrets with the CLI.",
    "Create a monitor, then build a public status page from its checks.",
  ]) assert.ok(html.includes(detail));
});

test("skip navigation and setup links remain scoped to the current workspace", async () => {
  const html = await render("outray-tunnel");
  assert.match(html, /href="\/outray-tunnel"[^>]*>Skip and continue to console/);
  assert.match(html, /href="\/outray-tunnel\/setup\?product=uptime"/);
  assert.doesNotMatch(html, /href="\/acme/);
});

test("restoring Get started does not revert the focused Setup flows or inline monitor creation", async () => {
  const route = await readFile(new URL("../src/routes/$orgSlug/get-started.tsx", import.meta.url), "utf8");
  assert.match(route, /Choose a product - OutRay/);
  assert.doesNotMatch(route, /GetStartedContent|OnboardingShell/);
  const setupRoute = await readFile(new URL("../src/routes/$orgSlug/setup.tsx", import.meta.url), "utf8");
  const setup = await readFile(new URL("../src/components/onboarding/product-setup.tsx", import.meta.url), "utf8");
  assert.match(setupRoute, /<ProductSetup/);
  assert.match(setup, /<OnboardingShell orgSlug=\{orgSlug\}>/);
  assert.match(setup, /<SetupFlow steps=/);
  assert.match(setup, /<UptimeMonitorForm orgSlug=\{orgSlug\} onCreated=\{onMonitorCreated\}/);
  assert.match(setup, /text-\[20px\] font-normal/);
});
