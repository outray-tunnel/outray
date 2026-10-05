import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import { OnboardingShell } from "../src/components/onboarding/onboarding-shell";
import { SetupCodeBlock, SetupFlow, SetupStep } from "../src/components/onboarding/setup-ui";

Object.assign(globalThis, { React });

function renderShell() {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: ["/acme/get-started"] }) });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: React.createElement(OnboardingShell, { orgSlug: "acme", children: React.createElement("h1", null, "Get started") }) }));
}

const steps = [{ id: "01", title: "Install" }, { id: "02", title: "Sign in" }, { id: "03", title: "Connect" }];

function renderFlow() {
  return renderToStaticMarkup(React.createElement(SetupFlow, {
    steps,
    children: steps.map((step) => React.createElement(SetupStep, { key: step.id, number: step.id, title: step.title, children: React.createElement("input", { name: `input-${step.id}`, defaultValue: `kept-${step.id}` }) })),
  }));
}

test("onboarding has one compact branded header, workspace context, and an immediate console escape", () => {
  const html = renderShell();
  assert.match(html, /workspace-ui outray-arc/);
  // Inherit OutRay's Geom body font; Tailwind's default font-sans would override it.
  assert.doesNotMatch(html, /font-sans/);
  assert.match(html, /h-14/);
  assert.match(html, /size-6 object-contain/);
  assert.match(html, /max-w-\[1180px\]/);
  assert.match(html, /href="\/acme"[^>]*>Open console/);
  assert.match(html, /href="\/acme\/get-started"/);
  assert.match(html, /title="acme"/);
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
  assert.match(html, /href="#onboarding-content"/);
  assert.match(html, /id="onboarding-content" tabindex="-1"/);
  assert.doesNotMatch(html, /<aside|h-\[76px\]|size-9/);
});

test("setup is a real tab interface, with only one selected keyboard stop", () => {
  const html = renderFlow();
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map(([tab]) => tab);
  assert.equal(tabs.length, 3);
  assert.match(html, /role="tablist" aria-label="Setup steps" aria-orientation="horizontal"/);
  assert.match(tabs[0], /aria-selected="true"/);
  assert.match(tabs[0], /tabindex="0"/);
  for (const tab of tabs.slice(1)) {
    assert.match(tab, /aria-selected="false"/);
    assert.match(tab, /tabindex="-1"/);
  }
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
});

test("inactive setup panels remain mounted but hidden, preserving all form values", () => {
  const html = renderFlow();
  const panels = [...html.matchAll(/<div[^>]*role="tabpanel"[^>]*>/g)].map(([panel]) => panel);
  assert.equal(panels.length, 3);
  assert.doesNotMatch(panels[0], /hidden=/);
  assert.match(panels[1], /hidden=""/);
  assert.match(panels[2], /hidden=""/);
  for (const panel of panels) assert.match(panel, /min-h-\[220px\]/);
  for (const [index, step] of steps.entries()) {
    const tab = html.match(new RegExp(`<button[^>]*id="([^"]+-tab-${step.id})"[^>]*aria-controls="([^"]+)"`));
    assert.ok(tab);
    assert.ok(panels[index].includes(`id="${tab[2]}"`));
    assert.ok(panels[index].includes(`aria-labelledby="${tab[1]}"`));
    assert.ok(html.includes(`value="kept-${step.id}"`));
  }
  assert.match(html, /disabled=""[^>]*>[\s\S]*?Back/);
  assert.match(html, /Next step/);
  assert.doesNotMatch(html, /Completed|aria-checked|All steps complete/);
});

test("a single creation step is usable without extra navigation or invented completion", () => {
  const html = renderToStaticMarkup(React.createElement(SetupFlow, {
    steps: [{ id: "01", title: "Create a vault" }],
    children: React.createElement(SetupStep, { number: "01", title: "Create a vault", children: React.createElement("form", null, React.createElement("input", { name: "vault" })) }),
  }));
  assert.match(html, /role="tabpanel"/);
  assert.match(html, /<form/);
  assert.doesNotMatch(html, /hidden=""|Next step|>Back|Complete/);
});

test("connection verification replaces Next only on the final step, rather than adding a duplicate action", async () => {
  const html = renderToStaticMarkup(React.createElement(SetupFlow, {
    steps,
    onRecheck: () => {},
    children: steps.map((step) => React.createElement(SetupStep, { key: step.id, number: step.id, title: step.title, children: "Instructions" })),
  }));
  assert.match(html, /Next step/);
  assert.doesNotMatch(html, /Check connection|Check again/);
  const source = await readFile(new URL("../src/components/onboarding/setup-ui.tsx", import.meta.url), "utf8");
  assert.match(source, /const isFinalStep = selectedIndex === steps\.length - 1/);
  assert.match(source, /disabled=\{isFinalStep && !onRecheck\}/);
  assert.match(source, /onClick=\{isFinalStep \? onRecheck : \(\) => setSelectedId\(steps\[selectedIndex \+ 1\]\.id\)\}/);
  assert.match(source, /isFinalStep && onRecheck \? <>.*Check connection<\/> : <>Next step/);
  assert.equal((source.match(/Check connection/g) ?? []).length, 1);
  assert.doesNotMatch(source, /Check again/);
});

test("code examples keep full commands scrollable and use the existing animated copy control", () => {
  const command = "outray secrets use --org acme --vault customer-api --env development";
  const html = renderToStaticMarkup(React.createElement(SetupCodeBlock, { children: command }));
  assert.ok(html.includes(`<code>${command}</code>`));
  assert.match(html, /<pre tabindex="0" aria-label="Terminal command"[^>]*overflow-x-auto/);
  assert.match(html, /aria-label="Copy command" data-copy-state="idle"/);
  assert.doesNotMatch(html, /truncate|break-words|whitespace-pre-wrap/);
  const source = readFile(new URL("../src/components/onboarding/setup-ui.tsx", import.meta.url), "utf8");
  return source.then((value) => {
    assert.match(value, /import \{ CopyButton \} from "\.\.\/arc\/copy-button\/copy-button"/);
    assert.match(value, /<CopyButton value=\{children\} iconOnly variant="plain"/);
    assert.doesNotMatch(value, /navigator\.clipboard|setTimeout/);
  });
});

test("multiline code shows its file name, escapes content, and has a specific copy label", () => {
  const html = renderToStaticMarkup(React.createElement(SetupCodeBlock, { multiline: true, fileName: "instrumentation.ts", children: "const safe = '<script>';\nexport default safe;" }));
  assert.match(html, /instrumentation\.ts/);
  assert.match(html, /aria-label="Code for instrumentation\.ts"/);
  assert.match(html, /aria-label="Copy instrumentation\.ts"/);
  assert.match(html, /&lt;script&gt;/);
  assert.ok(html.includes("\nexport default safe;"));
  assert.doesNotMatch(html, /<script/);
});

test("setup tabs implement keyboard wrap, Home/End, focus return, and reduced motion", async () => {
  const source = await readFile(new URL("../src/components/onboarding/setup-ui.tsx", import.meta.url), "utf8");
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) assert.ok(source.includes(`event.key === "${key}"`));
  assert.match(source, /event\.preventDefault\(\);\s*setSelectedId\(steps\[next\]\.id\);\s*tabs\.current\[next\]\?\.focus\(\)/);
  assert.match(source, /onKeyDown=\{handleKeyDown\}/);
  assert.match(source, /reducedMotion \? \{ duration: 0 \}/);
  assert.match(source, /hidden=\{flow \? flow\.activeId !== number : undefined\}/);
  assert.doesNotMatch(source, /if \(flow.*return null|activeId.*&& children|aria-disabled.*step/);
});
