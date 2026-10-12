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
      if (specifier === "../ui/workspace-scope") return { workspaceScopeClassName: "workspace-scope" };
      if (specifier === "./agent-chat-context") return { useAgentChatState: () => ({
        state: { ...initialAgentChatState, panelOpen: open }, panelId: "agent-panel", returnFocusRef: { current: null },
        dispatch: (event: AgentChatAction) => events.push(event),
      }) };
      throw new Error(`Unexpected import ${specifier}`);
    },
  });
  return { dialog, LazyPanel, events, get lazyRegistrations() { return lazyRegistrations; },
    render(isOpen: boolean) { open = isOpen; return module.exports.AgentChatHost() as Element; } };
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
    for (const type of [harness.dialog.Content, harness.dialog.Overlay]) assert.match(
      String(nodes.find((node) => node.type === type)!.props.className),
      /data-\[state=closed\]:pointer-events-none/,
      "closed surfaces cannot intercept pointer events during exit",
    );
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
  const harness = await hostHarness();
  const nodes = elements(harness.render(true));
  const panel = String(nodes.find((node) => node.type === harness.dialog.Content)!.props.className);
  const overlay = String(nodes.find((node) => node.type === harness.dialog.Overlay)!.props.className);
  assert.match(panel, /translate-x-0/);
  assert.match(panel, /data-\[state=closed\]:translate-x-full/);
  assert.match(panel, /data-\[state=open\]:duration-\[260ms\]/);
  assert.match(panel, /data-\[state=open\]:ease-\[cubic-bezier\(\.22,1,\.36,1\)\]/);
  assert.match(panel, /data-\[state=closed\]:duration-\[190ms\]/);
  assert.match(panel, /data-\[state=closed\]:ease-\[cubic-bezier\(\.4,0,1,1\)\]/);
  assert.doesNotMatch(panel, /opacity|blur|scale|rotate|spring|bounce/i);
  assert.match(overlay, /opacity-100/);
  assert.match(overlay, /data-\[state=closed\]:opacity-0/);
  assert.match(overlay, /data-\[state=open\]:duration-\[260ms\]/);
  assert.match(overlay, /data-\[state=closed\]:duration-\[190ms\]/);
});

test("reduced motion disables both enter/exit and working shimmer without hiding the label", async () => {
  const harness = await hostHarness();
  const nodes = elements(harness.render(true));
  for (const type of [harness.dialog.Content, harness.dialog.Overlay]) assert.match(
    String(nodes.find((node) => node.type === type)!.props.className), /motion-reduce:transition-none/,
  );
  const body = await readFile(new URL("../src/components/agent/agent-chat-panel.tsx", import.meta.url), "utf8");
  assert.match(body, /animate-\[pulse_2\.6s_ease-in-out_infinite\] text-\[#beb7cc\] motion-reduce:animate-none motion-reduce:opacity-100/);
  assert.doesNotMatch(body, /(?:^|[\s"])animate-pulse(?:[\s"]|$)/);
  assert.match(body, />\{working \? "Agent working…" : "Agent"\}<\/h2>/);
  assert.doesNotMatch(body, /motion-reduce:(?:hidden|invisible|opacity-0)/);
});
