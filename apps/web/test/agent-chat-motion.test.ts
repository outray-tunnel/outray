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
  const motion = { div: Object.assign(() => null, { displayName: "motion.div" }) };
  const AnimatePresence = Object.assign(() => null, { displayName: "AnimatePresence" });
  const LazyPanel = () => null;
  let open = false, reduced = false, lazyRegistrations = 0;
  const events: AgentChatAction[] = [];
  const module = { exports: {} as typeof import("../src/components/agent/agent-chat-host") };
  runInNewContext(compiled, { React, module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "react") return { ...React, lazy: () => { lazyRegistrations++; return LazyPanel; } };
      if (specifier === "@radix-ui/react-dialog") return dialog;
      if (specifier === "motion/react") return { motion, AnimatePresence, useReducedMotion: () => reduced };
      if (specifier === "lucide-react") return { X: () => null };
      if (specifier === "../ui/workspace-scope") return { workspaceScopeClassName: "workspace-scope" };
      if (specifier === "./agent-chat-context") return { useAgentChatState: () => ({
        state: { ...initialAgentChatState, panelOpen: open }, panelId: "agent-panel", returnFocusRef: { current: null },
        dispatch: (event: AgentChatAction) => events.push(event),
      }) };
      throw new Error(`Unexpected import ${specifier}`);
    },
  });
  return { dialog, motion, AnimatePresence, LazyPanel, events, get lazyRegistrations() { return lazyRegistrations; },
    render(isOpen: boolean, reduce = false) { open = isOpen; reduced = reduce; return module.exports.AgentChatHost() as Element; } };
}

test("the same Radix root and Motion Presence remain mounted across close and reopen", async () => {
  const harness = await hostHarness();
  const views = [false, true, false, true].map((open) => harness.render(open));
  for (const [index, tree] of views.entries()) {
    assert.equal(tree.type, harness.dialog.Root);
    assert.equal(tree.props.open, index % 2 === 1);
    const nodes = elements(tree);
    assert.equal(nodes.filter((node) => node.type === harness.AnimatePresence).length, 1, "Presence receives the close removal signal without being unmounted itself");
    const expected = index % 2;
    for (const type of [harness.dialog.Content, harness.dialog.Overlay, harness.LazyPanel]) {
      assert.equal(nodes.filter((node) => node.type === type).length, expected);
    }
    if (expected) {
      for (const type of [harness.dialog.Portal, harness.dialog.Content, harness.dialog.Overlay]) {
        assert.equal(nodes.find((node) => node.type === type)!.props.forceMount, true, "Motion, not Radix CSS Presence, owns final unmounting");
      }
      for (const node of nodes.filter((node) => node.type === harness.motion.div)) assert.match(
        String(node.props.className), /data-\[state=closed\]:pointer-events-none/,
        "closed surfaces cannot intercept pointer events during exit",
      );
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

test("Motion slides the full-width Agent panel without CSS keyframes, fading, blurring, or bouncing", async () => {
  const harness = await hostHarness();
  const nodes = elements(harness.render(true));
  const animated = nodes.filter((node) => node.type === harness.motion.div);
  assert.equal(animated.length, 2, "one backdrop and one moving panel");
  const [overlay, panel] = animated;
  for (const node of animated) {
    assert.doesNotMatch(String(node.props.className), /animate-|translate-x-|starting:|transition-/);
    assert.equal(node.props.transition.type, "tween", "fixed-duration movement cannot settle on a slow spring");
    assert.equal(node.props.exit.transition.type, "tween");
    assert.ok(node.props.transition.duration <= .24 && node.props.transition.duration > 0);
    assert.ok(node.props.exit.transition.duration <= .18 && node.props.exit.transition.duration > 0);
  }
  assert.equal(panel.props.initial.x, "100%");
  assert.equal(panel.props.animate.x, 0);
  assert.equal(panel.props.exit.x, "100%");
  assert.ok(panel.props.exit.transition.duration < panel.props.transition.duration, "closing is shorter than opening");
  for (const state of [panel.props.initial, panel.props.animate, panel.props.exit]) {
    for (const property of ["opacity", "filter", "scale", "rotate"]) assert.equal(property in state, false, "the panel only slides, without fading or bouncing");
  }
  assert.equal(overlay.props.initial.opacity, 0);
  assert.equal(overlay.props.animate.opacity, 1);
  assert.equal(overlay.props.exit.opacity, 0);
  const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /@keyframes\s+agent-(?:panel|overlay)-|--animate-agent-(?:panel|overlay)-/);
});

test("reduced motion disables both enter/exit and working shimmer without hiding the label", async () => {
  const harness = await hostHarness();
  const nodes = elements(harness.render(true, true));
  for (const node of nodes.filter((node) => node.type === harness.motion.div)) {
    assert.equal(node.props.initial, false, "reduced motion renders the final position immediately");
    assert.equal(node.props.transition.duration, 0);
    assert.equal(node.props.exit.transition.duration, 0);
    assert.ok(node.props.exit.x === undefined || node.props.exit.x === 0, "closing never slides in reduced motion");
  }
  const body = await readFile(new URL("../src/components/agent/agent-chat-panel.tsx", import.meta.url), "utf8");
  assert.match(body, /animate-\[pulse_2\.6s_ease-in-out_infinite\] text-\[#beb7cc\] motion-reduce:animate-none motion-reduce:opacity-100/);
  assert.doesNotMatch(body, /(?:^|[\s"])animate-pulse(?:[\s"]|$)/);
  assert.match(body, />\{working \? "Agent working…" : "Agent"\}<\/h2>/);
  assert.doesNotMatch(body, /motion-reduce:(?:hidden|invisible|opacity-0)/);
});
