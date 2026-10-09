import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { initialAgentChatState, type AgentChatAction } from "../src/components/agent/agent-chat-data";

type Element = React.ReactElement<any>;
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

/** Evaluate the actual shell without mounting portals, importing the lazy body, or running a browser. */
async function hostHarness() {
  const source = await readFile(new URL("../src/components/agent/agent-chat-host.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const dialog = { ...Object.fromEntries(["Root", "Portal", "Overlay", "Content", "Title"].map((name) => [name, (props: any) => props.children])),
    Close: (props: any) => React.createElement("button", props),
  };
  const LazyPanel = () => null;
  let open = false, lazyRegistrations = 0;
  const events: AgentChatAction[] = [];
  const module = { exports: {} as typeof import("../src/components/agent/agent-chat-host") };
  runInNewContext(compiled, { React, module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "react") return { ...React, lazy: () => { lazyRegistrations++; return LazyPanel; } };
      if (specifier === "@radix-ui/react-dialog") return dialog;
      if (specifier === "lucide-react") return { X: () => null };
      if (specifier === "./agent-chat-context") return { useAgentChatState: () => ({
        state: { ...initialAgentChatState, panelOpen: open }, panelId: "agent-panel", returnFocusRef: { current: null },
        dispatch: (event: AgentChatAction) => events.push(event),
      }) };
      if (specifier === "./agent-chat-panel.module.css") return { panel: "agent-panel", overlay: "agent-overlay" };
      throw new Error(`Unexpected import ${specifier}`);
    },
  });
  return { dialog, LazyPanel, events, get lazyRegistrations() { return lazyRegistrations; },
    render(isOpen: boolean) { open = isOpen; return module.exports.AgentChatHost() as Element; } };
}

function cssBlock(css: string, selector: string) {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, `Missing CSS ${selector}`);
  const opening = css.indexOf("{", start);
  let depth = 1;
  for (let index = opening + 1; index < css.length; index++) {
    if (css[index] === "{") depth++;
    if (css[index] === "}" && --depth === 0) return css.slice(opening + 1, index);
  }
  assert.fail(`Unclosed CSS ${selector}`);
}

test("the same Radix shell remains available while closed so Presence can finish its exit", async () => {
  const harness = await hostHarness();
  const views = [false, true, false, true].map((open) => harness.render(open));
  for (const [index, tree] of views.entries()) {
    assert.equal(tree.type, harness.dialog.Root);
    assert.equal(tree.props.open, index % 2 === 1);
    const nodes = elements(tree);
    assert.equal(nodes.filter((node) => node.type === harness.dialog.Content).length, 1);
    assert.equal(nodes.filter((node) => node.type === harness.dialog.Overlay).length, 1);
    assert.equal(nodes.filter((node) => node.type === harness.LazyPanel).length, 1);
    for (const type of [harness.dialog.Content, harness.dialog.Overlay]) {
      const surface = nodes.find((node) => node.type === type)!;
      assert.equal(surface.props.style?.pointerEvents, index % 2 === 1 ? undefined : "none", "closed surfaces cannot intercept pointer events during exit");
    }
    for (const type of [harness.dialog.Portal, harness.dialog.Content, harness.dialog.Overlay]) {
      assert.equal(nodes.find((node) => node.type === type)!.props.forceMount, undefined, "Radix owns when portal content finally unmounts");
    }
  }
  assert.equal(harness.lazyRegistrations, 1, "reopening uses one stable lazy component identity");
  const lazyBody = elements(views[1]).find((node) => node.type === harness.LazyPanel)!;
  lazyBody.props.onClose();
  assert.equal(JSON.stringify(harness.events), JSON.stringify([{ type: "close" }]));
});

test("lazy loading stays inside the sole animated dialog and matches the body layout", async () => {
  const harness = await hostHarness();
  const tree = harness.render(true);
  const content = elements(tree).find((node) => node.type === harness.dialog.Content)!;
  const suspense = elements(content).find((node) => node.type === React.Suspense)!;
  assert.ok(suspense, "Suspense belongs inside Content, not around the dialog shell");
  const fallback = renderToStaticMarkup(suspense.props.fallback);
  assert.match(fallback, /aria-label="Loading Agent" aria-busy="true"/);
  assert.match(fallback, /role="status"[^>]*>Loading Agent…/);
  assert.match(fallback, /<button[^>]*aria-label="Close Agent"/);
  assert.match(fallback, /h-14.*lg:h-11/);
  assert.match(fallback, /min-h-0 flex-1/);
  assert.match(fallback, /shrink-0 border-t/);
  assert.match(fallback, /motion-reduce:animate-none/);
  assert.doesNotMatch(fallback, /<aside|role="dialog"|id="agent-panel"|\bfixed\b|\binset-y-0\b/);
  const bodySource = await readFile(new URL("../src/components/agent/agent-chat-panel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(bodySource, /@radix-ui\/react-dialog|<Dialog\./, "the loaded body cannot introduce a second modal or animation shell");
});

test("Agent panel slides a full width both ways without fading, blurring, or bouncing", async () => {
  const css = await readFile(new URL("../src/components/agent/agent-chat-panel.module.css", import.meta.url), "utf8");
  const enter = cssBlock(css, '.panel[data-state="open"]');
  const exit = cssBlock(css, '.panel[data-state="closed"]');
  assert.match(enter, /animation:\s*enter-panel 260ms cubic-bezier\(0\.22, 1, 0\.36, 1\) both/);
  assert.match(exit, /animation:\s*exit-panel 190ms cubic-bezier\(0\.4, 0, 1, 1\) both/);
  assert.match(exit, /pointer-events:\s*none/);
  const enterFrames = cssBlock(css, "@keyframes enter-panel");
  const exitFrames = cssBlock(css, "@keyframes exit-panel");
  assert.match(enterFrames, /from\s*\{\s*transform:\s*translate3d\(100%, 0, 0\)/);
  assert.match(enterFrames, /to\s*\{\s*transform:\s*translate3d\(0, 0, 0\)/);
  assert.match(exitFrames, /from\s*\{\s*transform:\s*translate3d\(0, 0, 0\)/);
  assert.match(exitFrames, /to\s*\{\s*transform:\s*translate3d\(100%, 0, 0\)/);
  assert.doesNotMatch([enter, exit, enterFrames, exitFrames].join("\n"), /opacity|filter|scale|rotate|spring|bounce/i);
  assert.match(cssBlock(css, '.overlay[data-state="open"]'), /enter-overlay 260ms/);
  const overlayExit = cssBlock(css, '.overlay[data-state="closed"]');
  assert.match(overlayExit, /exit-overlay 190ms/);
  assert.match(overlayExit, /pointer-events:\s*none/);
  assert.match(cssBlock(css, "@keyframes enter-overlay"), /from\s*\{\s*opacity:\s*0;\s*\}\s*to\s*\{\s*opacity:\s*1/);
  assert.match(cssBlock(css, "@keyframes exit-overlay"), /from\s*\{\s*opacity:\s*1;\s*\}\s*to\s*\{\s*opacity:\s*0/);
});

test("reduced motion disables both enter/exit and working shimmer without hiding the label", async () => {
  const css = await readFile(new URL("../src/components/agent/agent-chat-panel.module.css", import.meta.url), "utf8");
  const reduced = cssBlock(css, "@media (prefers-reduced-motion: reduce)");
  assert.match(reduced, /\.panel\[data-state\],\s*\.overlay\[data-state\],\s*\.workingLabel,\s*\.workingIcon\s*\{\s*animation:\s*none/);
  const label = cssBlock(reduced, ".workingLabel {");
  assert.match(label, /background:\s*none/);
  assert.match(label, /color:\s*#d4d4d8/);
  assert.match(label, /-webkit-text-fill-color:\s*currentColor/);
  assert.match(reduced, /\.workingIcon\s*\{\s*opacity:\s*1/);
});
