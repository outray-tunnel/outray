import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { SecretsDialog, SecretsSheet } from "../src/components/secrets/secrets-ui";

Object.assign(globalThis, { React });
const requireModule = createRequire(import.meta.url);
type ElementProps = { children?: React.ReactNode; [key: string]: any };
type OverlayName = "SecretsDialog" | "SecretsSheet";
type Effect = { deps?: readonly unknown[]; cleanup?: () => void };

function elements(node: React.ReactNode): React.ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function keyboard(key: string, shiftKey = false) {
  return {
    key, shiftKey, prevented: 0, stopped: 0,
    preventDefault() { this.prevented++; },
    stopPropagation() { this.stopped++; },
  };
}

/** Run real overlay hooks and callbacks, preserving effect cleanup and commit ordering. */
async function controller(name: OverlayName, initiallyOpen = true) {
  const source = await readFile(new URL("../src/components/secrets/secrets-ui.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const state: any[] = [];
  const refs: { current: any }[] = [];
  const previousEffects: Effect[] = [];
  let effects: { index: number; deps?: readonly unknown[]; run: () => void | (() => void) }[] = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  let changed = false;
  let closed = 0;
  const listeners = new Map<string, Set<(event: any) => void>>();
  const frames = new Map<number, () => void>();
  const cancelledFrames: number[] = [];
  let nextFrame = 0;
  const bodyWrites: string[] = [];
  const body = {
    className: "existing-body-theme", dataset: {}, style: {},
    setAttribute: (attribute: string) => { bodyWrites.push(attribute); },
    removeAttribute: (attribute: string) => { bodyWrites.push(attribute); },
    classList: {
      add: (...classes: string[]) => { bodyWrites.push(...classes); },
      remove: (...classes: string[]) => { bodyWrites.push(...classes); },
    },
  };
  class FakeHTMLElement {
    focused = 0;
    isConnected = true;
    constructor(public visible = true) {}
    focus() { this.focused++; document.activeElement = this; }
    getClientRects() { return this.visible ? [{}] : []; }
  }
  const trigger = new FakeHTMLElement();
  const first = new FakeHTMLElement();
  const last = new FakeHTMLElement();
  const hidden = new FakeHTMLElement(false);
  const queries: string[] = [];
  const panel = {
    items: [hidden, first, last],
    querySelectorAll(selector: string) { queries.push(selector); return this.items; },
    contains(element: unknown) { return this.items.includes(element as FakeHTMLElement); },
  };
  const document = {
    body, activeElement: trigger as FakeHTMLElement | null,
    addEventListener(type: string, listener: (event: any) => void) {
      const entries = listeners.get(type) ?? new Set();
      entries.add(listener); listeners.set(type, entries);
    },
    removeEventListener(type: string, listener: (event: any) => void) { listeners.get(type)?.delete(listener); },
  };
  function AnimatePresence({ children }: ElementProps) { return React.createElement(React.Fragment, null, children); }
  function PortalBoundary({ children }: ElementProps) { return React.createElement(React.Fragment, null, children); }
  const motion = Object.fromEntries(["div", "button", "aside"].map((tag) => [tag, ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: ElementProps) => React.createElement(tag, props, children)]));
  type CapturedPortal = { children: React.ReactNode; target: unknown; node: React.ReactElement<ElementProps> };
  let portals: CapturedPortal[] = [];
  const module = { exports: {} as Record<OverlayName, (props: ElementProps) => React.ReactNode> };
  runInNewContext(compiled, {
    React, module, exports: module.exports, HTMLElement: FakeHTMLElement, document,
    window: {
      requestAnimationFrame(callback: () => void) { const id = ++nextFrame; frames.set(id, callback); return id; },
      cancelAnimationFrame(id: number) { cancelledFrames.push(id); frames.delete(id); },
    },
    require: (specifier: string) => {
      if (specifier === "react") return {
        ...React,
        useState(initial: any) {
          const index = stateIndex++;
          if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
          return [state[index], (next: any) => {
            const value = typeof next === "function" ? next(state[index]) : next;
            if (!Object.is(value, state[index])) { state[index] = value; changed = true; }
          }];
        },
        useRef(initial: any) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
        useEffect(run: () => void | (() => void), deps?: readonly unknown[]) {
          const index = effectIndex++;
          const previous = previousEffects[index];
          if (!previous || !deps || !previous.deps || deps.length !== previous.deps.length || deps.some((value, slot) => !Object.is(value, previous.deps![slot]))) effects.push({ index, deps, run });
        },
      };
      if (specifier === "react-dom") return {
        createPortal(children: React.ReactNode, target: unknown) {
          const node = React.createElement(PortalBoundary, { children });
          portals.push({ children, target, node }); return node;
        },
      };
      if (specifier === "motion/react") return { AnimatePresence, motion };
      if (specifier === "@/components/ui/select") return { Select: () => null };
      if (specifier === "@/components/arc/button/button") return { Button: () => null };
      if (specifier.endsWith(".css")) return {};
      if (specifier.startsWith("@hugeicons") || specifier.startsWith("@outray/icons/")) return requireModule(specifier);
      throw new Error(`Unexpected secrets overlay import: ${specifier}`);
    },
  });
  const props: ElementProps = {
    open: initiallyOpen, onClose: () => { closed++; }, title: "Private secret details",
    description: "Only reveal values deliberately.",
    children: React.createElement("input", { "aria-label": "Secret value", defaultValue: "private-test-value" }),
  };
  function render(update: ElementProps = {}) {
    Object.assign(props, update);
    stateIndex = 0; refIndex = 0; effectIndex = 0; effects = []; changed = false; portals = [];
    const node = module.exports[name](props);
    for (const element of elements(node)) {
      if (element.props.role === "dialog" && element.props.ref) element.props.ref.current = panel;
    }
    return { node, portals: [...portals] };
  }
  function flushEffects() {
    const pending = effects; effects = [];
    for (const effect of pending) {
      previousEffects[effect.index]?.cleanup?.();
      const cleanup = effect.run();
      previousEffects[effect.index] = { deps: effect.deps, cleanup: typeof cleanup === "function" ? cleanup : undefined };
    }
    return changed;
  }
  function settle(update: ElementProps = {}) {
    let rendered = render(update);
    for (let pass = 0; pass < 5; pass++) {
      if (!flushEffects()) return rendered;
      rendered = render();
    }
    throw new Error("Secrets overlay effects did not settle");
  }
  return {
    render, flushEffects, settle, body, bodyWrites, AnimatePresence, PortalBoundary,
    first, last, hidden, trigger, panel, queries, document, frames, cancelledFrames,
    closed: () => closed,
    listenerCount: () => listeners.get("keydown")?.size ?? 0,
    dispatch(event: ReturnType<typeof keyboard>) { for (const listener of [...listeners.get("keydown") ?? []]) listener(event); },
    runFrames() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(); },
    unmount() { for (const effect of previousEffects) effect?.cleanup?.(); },
  };
}

function portalRoot(rendered: ReturnType<Awaited<ReturnType<typeof controller>>["render"]>) {
  assert.equal(rendered.portals.length, 1, "the complete overlay has one portal boundary");
  const portal = rendered.portals[0];
  const roots = elements(portal.children).filter((element) => element.props["data-private-product"] === "secrets");
  assert.equal(roots.length, 1, "the portal owns one secrets privacy and theme root");
  assert.equal(rendered.node, portal.node, "no overlay is left inline under the caller's query container");
  return { portal, root: roots[0] };
}

test("secrets overlays are SSR-safe and render no inline or portaled content before mount", () => {
  assert.equal(typeof globalThis.document, "undefined");
  assert.equal(typeof globalThis.window, "undefined");
  for (const Component of [SecretsDialog, SecretsSheet]) {
    for (const open of [false, true]) {
      const html = renderToStaticMarkup(React.createElement(Component, {
        open, onClose: () => {}, title: "Server-rendered private secret",
        children: React.createElement("input", { defaultValue: "do-not-serialize" }),
      }));
      assert.equal(html, "", `${Component.name} stays empty until its body target is mounted`);
    }
  }
});

test("body targeting mounts before dialog focus or sheet Escape listeners are installed", async () => {
  for (const name of ["SecretsDialog", "SecretsSheet"] as const) {
    const overlay = await controller(name);
    const initial = overlay.render();
    assert.equal(initial.portals.length, 0);
    assert.equal(overlay.listenerCount(), 0);
    assert.equal(overlay.frames.size, 0);
    assert.equal(overlay.flushEffects(), true, "mount resolves the body target through state");
    assert.equal(overlay.listenerCount(), 0, "no keyboard handling runs against an unmounted overlay");
    assert.equal(overlay.frames.size, 0, "dialog focus waits for the target's committed render");
    const mounted = overlay.render();
    assert.equal(portalRoot(mounted).portal.target, overlay.body);
    overlay.flushEffects();
    assert.equal(overlay.listenerCount(), 1);
    assert.equal(overlay.frames.size, name === "SecretsDialog" ? 1 : 0);
    overlay.unmount();
  }
});

test("both body portals carry their own workspace theme and secrets capture protection outside query containers", async () => {
  for (const name of ["SecretsDialog", "SecretsSheet"] as const) {
    const overlay = await controller(name);
    const { portal, root } = portalRoot(overlay.settle());
    assert.equal(portal.target, overlay.body);
    assert.ok(React.isValidElement<ElementProps>(portal.children));
    assert.equal(portal.children.type, overlay.AnimatePresence, "presence and its exit animation remain inside the portal");
    const classes = root.props.className.split(/\s+/);
    for (const className of ["workspace-ui", "outray-arc", "ph-no-capture", "fixed", "inset-0", "z-[100]"]) assert.ok(classes.includes(className), `${name} root includes ${className}`);
    assert.doesNotMatch(root.props.className, /@container|overflow-hidden|\btransform\b|contain-/);
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, portal.children));
    assert.match(html, /data-private-product="secrets"/);
    assert.match(html, /role="dialog" aria-modal="true"/);
    assert.match(html, /Private secret details/);
    assert.match(html, /Only reveal values deliberately\./);
    assert.match(html, /aria-label="Secret value"/);
    assert.match(html, /value="private-test-value"/);
    assert.deepEqual(overlay.bodyWrites, [], "theme/privacy scopes are local, never global body mutations");
    assert.equal(overlay.body.className, "existing-body-theme");
    assert.deepEqual(overlay.body.dataset, {});
    assert.deepEqual(overlay.body.style, {});
    overlay.unmount();
  }
});

test("closed overlays have no visible root or listeners and can open, close, and reopen in the same body portal", async () => {
  for (const name of ["SecretsDialog", "SecretsSheet"] as const) {
    const overlay = await controller(name, false);
    let rendered = overlay.settle();
    assert.equal(elements(rendered.node).filter((element) => element.props.role === "dialog").length, 0);
    assert.equal(overlay.listenerCount(), 0);
    assert.equal(overlay.frames.size, 0);
    rendered = overlay.settle({ open: true });
    assert.equal(portalRoot(rendered).portal.target, overlay.body);
    assert.equal(overlay.listenerCount(), 1);
    rendered = overlay.settle({ open: false });
    assert.equal(elements(rendered.node).filter((element) => element.props["data-private-product"] === "secrets").length, 0);
    assert.equal(overlay.listenerCount(), 0);
    assert.equal(overlay.frames.size, 0);
    overlay.dispatch(keyboard("Escape"));
    assert.equal(overlay.closed(), 0);
    rendered = overlay.settle({ open: true });
    assert.equal(portalRoot(rendered).portal.target, overlay.body);
    assert.equal(overlay.listenerCount(), 1, "reopening does not duplicate the keyboard listener");
    overlay.unmount();
    assert.equal(overlay.listenerCount(), 0);
    assert.equal(overlay.frames.size, 0);
  }
});

test("portaling preserves backdrop and explicit close actions for dialogs and sheets", async () => {
  for (const [name, backdropLabel] of [["SecretsDialog", "Close dialog"], ["SecretsSheet", "Close panel"]] as const) {
    const overlay = await controller(name);
    const { root } = portalRoot(overlay.settle());
    const backdrop = elements(root).find((element) => element.props["aria-label"] === backdropLabel);
    const close = elements(root).find((element) => element.props.label === "Close");
    assert.ok(backdrop, `${name} has its accessible backdrop close control`);
    assert.ok(close, `${name} has its explicit close button`);
    backdrop.props.onClick(); close.props.onClick();
    assert.equal(overlay.closed(), 2);
    overlay.unmount();
  }
});

test("the dialog focuses visible controls after mounting and keeps forward, backward, and outside Tab focus inside", async () => {
  const overlay = await controller("SecretsDialog");
  overlay.settle();
  assert.equal(overlay.document.activeElement, overlay.trigger);
  overlay.runFrames();
  assert.equal(overlay.document.activeElement, overlay.first);
  assert.equal(overlay.hidden.focused, 0, "hidden controls are not initial focus candidates");
  assert.match(overlay.queries[0], /button:not\(\[disabled\]\)/);
  assert.match(overlay.queries[0], /input:not\(\[disabled\]\)/);
  assert.match(overlay.queries[0], /\[tabindex\]:not\(\[tabindex="-1"\]\)/);
  for (const [active, shiftKey, expected] of [
    [overlay.last, false, overlay.first], [overlay.first, true, overlay.last],
    [overlay.trigger, false, overlay.first], [overlay.trigger, true, overlay.last],
  ] as const) {
    overlay.document.activeElement = active;
    const event = keyboard("Tab", shiftKey); overlay.dispatch(event);
    assert.equal(event.prevented, 1);
    assert.equal(overlay.document.activeElement, expected);
  }
  overlay.document.activeElement = overlay.first;
  const normalTab = keyboard("Tab"); overlay.dispatch(normalTab);
  assert.equal(normalTab.prevented, 0, "native Tab remains usable between interior controls");
  overlay.panel.items = [];
  const emptyTab = keyboard("Tab"); overlay.dispatch(emptyTab);
  assert.equal(emptyTab.prevented, 1, "an empty dialog does not release Tab to its caller");
  overlay.settle({ open: false });
  assert.equal(overlay.document.activeElement, overlay.trigger);
  assert.equal(overlay.trigger.focused, 1, "closing restores the pre-portal trigger");
  assert.equal(overlay.listenerCount(), 0);
});

test("Escape closes both overlays with the current callback and dialog callback updates do not restart focus", async () => {
  for (const name of ["SecretsDialog", "SecretsSheet"] as const) {
    const overlay = await controller(name);
    overlay.settle(); overlay.runFrames();
    let latestClosed = 0;
    overlay.settle({ onClose: () => { latestClosed++; } });
    assert.equal(overlay.listenerCount(), 1);
    assert.equal(overlay.frames.size, 0, "updating a close callback does not move dialog focus again");
    const unrelated = keyboard("Enter"); overlay.dispatch(unrelated);
    assert.equal(latestClosed, 0);
    const escape = keyboard("Escape"); overlay.dispatch(escape);
    assert.equal(latestClosed, 1);
    assert.equal(overlay.closed(), 0, "the callback captured before portaling is not stale");
    assert.equal(escape.stopped, name === "SecretsDialog" ? 1 : 0);
    overlay.unmount();
    overlay.dispatch(keyboard("Escape"));
    assert.equal(latestClosed, 1, "an unmounted body portal no longer handles Escape");
  }
});

test("unmounting an open dialog cancels pending focus, removes Escape handling, and restores the prior trigger", async () => {
  const overlay = await controller("SecretsDialog");
  overlay.settle();
  assert.equal(overlay.frames.size, 1);
  overlay.unmount();
  assert.equal(overlay.frames.size, 0);
  assert.equal(overlay.cancelledFrames.length, 1);
  assert.equal(overlay.listenerCount(), 0);
  assert.equal(overlay.trigger.focused, 1);
  overlay.runFrames(); overlay.dispatch(keyboard("Escape"));
  assert.equal(overlay.first.focused, 0, "a removed portal cannot receive deferred focus");
  assert.equal(overlay.closed(), 0);
});
