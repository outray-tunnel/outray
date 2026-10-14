import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import type { ConfirmMorphProps } from "../src/components/arc/confirm-morph/confirm-morph";
import { motionTokens } from "../src/components/arc/lib/motion-tokens";

type Element = React.ReactElement<Record<string, any>>;
type Effect = { slot: number; run: () => void | (() => void); deps?: unknown[]; layout: boolean };

function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (React.isValidElement(node)) return text((node as Element).props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((fulfill, fail) => { resolve = fulfill; reject = fail; });
  return { promise, resolve, reject };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Execute the actual UIArc-derived control; replace only React scheduling, Motion, and DOM primitives. */
async function confirmHarness(initial: Partial<ConfirmMorphProps> = {}, reduced = false) {
  const source = await readFile(new URL("../src/components/arc/confirm-morph/confirm-morph.tsx", import.meta.url), "utf8");
  const compile = (value: string) => ts.transpileModule(value, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const primitive = (name: string) => Object.assign(() => null, { displayName: name });
  const values: any[] = [];
  const committed = new Map<number, { deps?: unknown[]; cleanup?: () => void }>();
  const listeners = new Map<string, Set<(event: any) => void>>();
  const animations: Array<{ finish: () => void; stopped: boolean; paused: boolean; options: any; from: unknown; target: unknown }> = [];
  let cursor = 0, now = 0, effects: Effect[] = [], afterUnmountUpdates = 0, mounted = true;
  const same = (before?: unknown[], after?: unknown[]) => before !== undefined && after !== undefined
    && before.length === after.length && before.every((value, index) => Object.is(value, after[index]));
  const effect = (run: Effect["run"], deps: unknown[] | undefined, layout: boolean) => {
    effects.push({ slot: cursor++, run, deps, layout });
  };
  const hooks = {
    ...React,
    useState(initialValue: any) {
      const slot = cursor++;
      if (!(slot in values)) values[slot] = typeof initialValue === "function" ? initialValue() : initialValue;
      return [values[slot], (next: any) => {
        if (!mounted) afterUnmountUpdates++;
        values[slot] = typeof next === "function" ? next(values[slot]) : next;
      }];
    },
    useRef(initialValue: any) { const slot = cursor++; return values[slot] ?? (values[slot] = { current: initialValue }); },
    useId() { const slot = cursor++; return values[slot] ?? (values[slot] = `confirm-${slot}`); },
    useCallback(callback: unknown, deps?: unknown[]) {
      const slot = cursor++;
      if (!values[slot] || !same(values[slot].deps, deps)) values[slot] = { value: callback, deps };
      return values[slot].value;
    },
    useEffect(run: Effect["run"], deps?: unknown[]) { effect(run, deps, false); },
    useLayoutEffect(run: Effect["run"], deps?: unknown[]) { effect(run, deps, true); },
    useSyncExternalStore(_subscribe: unknown, snapshot: () => unknown) { cursor++; return snapshot(); },
    useImperativeHandle(ref: any, handle: () => unknown, deps?: unknown[]) {
      effect(() => {
        if (typeof ref === "function") { ref(handle()); return () => ref(null); }
        if (ref) { ref.current = handle(); return () => { ref.current = null; }; }
      }, deps, true);
    },
  };
  const document = {
    body: {} as object,
    activeElement: null as object | null,
    hidden: false,
    addEventListener(name: string, listener: (event: any) => void) {
      const group = listeners.get(name) ?? new Set(); group.add(listener); listeners.set(name, group);
    },
    removeEventListener(name: string, listener: (event: any) => void) { listeners.get(name)?.delete(listener); },
  };
  document.activeElement = document.body;
  class NodeStub {
    children: NodeStub[] = [];
    props: Record<string, any>;
    constructor(props: Record<string, any>) { this.props = props; }
    contains(target: object): boolean { return target === this || this.children.some((child) => child.contains(target)); }
    focus() { document.activeElement = this; }
    getBoundingClientRect() { return { width: 220 }; }
    querySelector(selector: string): NodeStub | undefined {
      const match = (item: NodeStub) => selector.startsWith("[data-face=")
        ? item.props["data-face"] === selector.match(/"([^"]+)"/)?.[1]
        : item.props["data-autofocus"] !== undefined && !item.props.disabled;
      for (const child of this.children) {
        if (match(child)) return child;
        const nested = child.querySelector(selector);
        if (nested) return nested;
      }
      return undefined;
    }
  }
  class ButtonStub extends NodeStub {}
  const motionValue = (initialValue: unknown) => {
    const ref = hooks.useRef(null);
    if (!ref.current) {
      let value = initialValue;
      ref.current = { get: () => value, jump: (next: unknown) => { value = next; }, set: (next: unknown) => { value = next; } };
    }
    return ref.current;
  };
  const motion = { div: primitive("motion.div"), span: primitive("motion.span"), circle: primitive("motion.circle"), path: primitive("motion.path") };
  const module = { exports: {} as typeof import("../src/components/arc/confirm-morph/confirm-morph") };
  runInNewContext(compile(source), {
    React, module, exports: module.exports, document, performance: { now: () => now },
    HTMLButtonElement: ButtonStub, HTMLElement: NodeStub,
    require(specifier: string) {
      if (specifier === "react") return hooks;
      if (specifier === "motion/react") return {
        AnimatePresence: primitive("AnimatePresence"), motion, useIsPresent: () => true,
        useReducedMotion: () => reduced, useMotionValue: motionValue,
        useMotionValueEvent() {}, useTransform(value: any, transform: (value: any) => unknown) { return transform(value.get()); },
        animate(value: any, target: unknown, options: any) {
          const callbacks: Array<() => void> = [];
          const control = {
            options, from: value.get(), target, stopped: false, paused: false,
            then(callback: () => void) { callbacks.push(callback); return control; },
            stop() { control.stopped = true; }, pause() { control.paused = true; }, play() { control.paused = false; },
            finish() { if (control.stopped || control.paused) return; value.jump(target); callbacks.forEach((callback) => callback()); },
          };
          animations.push(control); return control;
        },
      };
      if (specifier === "lucide-react") return { CircleAlert: primitive("CircleAlert"), LoaderCircle: primitive("LoaderCircle") };
      if (specifier === "../lib/motion-tokens" || specifier === "../motion-tokens") return { motionTokens };
      if (specifier === "./confirm-morph.module.css") return new Proxy({}, { get: (_target, name) => name === "__esModule" ? false : String(name) });
      throw new Error(`Unexpected ConfirmMorph import: ${specifier}`);
    },
  });
  const props: ConfirmMorphProps = { label: "Remove domain", confirmTimeout: 0, resultTimeout: 0, ...initial };
  const domByElement = new Map<Element, NodeStub>();
  const mountDom = (node: React.ReactNode): NodeStub[] => {
    if (Array.isArray(node)) return node.flatMap(mountDom);
    if (!React.isValidElement(node)) return [];
    const element = node as Element;
    const nodeProps = typeof element.type === "function" && element.type.name === "Face"
      ? { ...element.props, "data-face": element.props.id }
      : element.props;
    const dom = element.type === "button" ? new ButtonStub(nodeProps) : new NodeStub(nodeProps);
    dom.children = mountDom(element.props.children);
    domByElement.set(element, dom);
    if (element.props.ref && typeof element.props.ref === "object") element.props.ref.current = dom;
    return [dom];
  };
  return {
    document, animations, listeners, motion,
    advance(milliseconds = 300) { now += milliseconds; },
    dispatch(name: string, event: object) { for (const listener of [...(listeners.get(name) ?? [])]) listener(event); },
    render(next: Partial<ConfirmMorphProps> = {}) {
      Object.assign(props, next); cursor = 0; effects = []; domByElement.clear();
      const tree = module.exports.ConfirmMorph(props);
      mountDom(tree);
      for (const current of [...effects].sort((left, right) => Number(right.layout) - Number(left.layout))) {
        const previous = committed.get(current.slot);
        if (previous && same(previous.deps, current.deps)) continue;
        previous?.cleanup?.();
        committed.set(current.slot, { deps: current.deps ? [...current.deps] : undefined, cleanup: current.run() ?? undefined });
      }
      const nodes = elements(tree);
      const root = nodes[0];
      const buttons = nodes.filter((node) => node.type === "button");
      const status = nodes.find((node) => node.props.role === "status" || node.props.role === "alert")!;
      return {
        tree, root, nodes, buttons, status,
        button(label: string) {
          const found = buttons.find((button) => text(button) === label || button.props["aria-label"] === label);
          assert.ok(found, `button ${label} exists in ${root.props["data-state"]}`);
          return found;
        },
        focus(button: Element) { domByElement.get(button)!.focus(); },
        dom(element: Element) { return domByElement.get(element)!; },
      };
    },
    dispose() { for (const current of committed.values()) current.cleanup?.(); committed.clear(); mounted = false; },
    get afterUnmountUpdates() { return afterUnmountUpdates; },
  };
}

test("inline confirmation has two deliberate stages and cannot submit twice during one pending promise", async () => {
  const operation = deferred();
  let calls = 0;
  const harness = await confirmHarness({ onConfirm: () => { calls++; return operation.promise; } });
  let result = harness.render();
  assert.equal(result.root.props["data-state"], "idle");
  result.button("Remove domain").props.onClick();
  result = harness.render();
  assert.equal(result.root.props["data-state"], "confirming");
  assert.equal(calls, 0, "opening inline confirmation never deletes the resource");
  result.button("Delete").props.onClick();
  assert.equal(calls, 0, "the opening click's tail is ignored by the arming window");
  harness.advance();
  const submit = result.button("Delete").props.onClick;
  submit(); submit();
  result = harness.render();
  assert.equal(calls, 1);
  assert.equal(result.root.props["data-state"], "pending");
  assert.equal(result.root.props["aria-busy"], true);
  assert.equal(result.buttons.length, 0, "there is no second delete or cancel action during an irreversible request");
  assert.equal(text(result.status), "Deleting");
  operation.resolve(); await settle();
  result = harness.render();
  assert.equal(result.root.props["data-state"], "done");
  assert.equal(text(result.status), "Deleted");
  assert.equal(result.nodes.some((node) => node.props.role === "dialog"), false);
  assert.equal(result.buttons.length, 0, "irreversible deletion does not invent an Undo action");
  harness.dispose();
});

test("a rejected deletion stays visible with retry and awaits the next real promise", async () => {
  const first = deferred(), retry = deferred();
  const reason = new Error("Domain is currently in use");
  const errors: unknown[] = [];
  let calls = 0;
  const harness = await confirmHarness({
    onConfirm: () => { calls++; return calls === 1 ? first.promise : retry.promise; },
    onError: (error) => errors.push(error),
  });
  harness.render().button("Remove domain").props.onClick();
  let result = harness.render(); harness.advance(); result.button("Delete").props.onClick();
  first.reject(reason); await settle();
  result = harness.render();
  assert.equal(result.root.props["data-state"], "error");
  assert.equal(result.status.props.role, "alert");
  assert.equal(text(result.status), "Couldn’t finish");
  assert.deepEqual(errors, [reason]);
  const submit = result.button("Retry").props.onClick;
  submit(); submit();
  result = harness.render();
  assert.equal(calls, 2, "retry also prevents same-tick duplicate submissions");
  assert.equal(result.root.props["data-state"], "pending");
  retry.resolve(); await settle();
  assert.equal(harness.render().root.props["data-state"], "done");
  harness.dispose();
});

test("Cancel, Escape, and outside presses dismiss confirmation but cannot cancel a pending request", async () => {
  const operation = deferred();
  let cancelled = 0, calls = 0;
  const harness = await confirmHarness({ onCancel: () => cancelled++, onConfirm: () => { calls++; return operation.promise; } });
  harness.render().button("Remove domain").props.onClick();
  let result = harness.render();
  result.button("Cancel").props.onClick();
  assert.equal(harness.render().root.props["data-state"], "idle");
  harness.render().button("Remove domain").props.onClick();
  result = harness.render();
  let prevented = false;
  result.root.props.onKeyDown({ key: "Escape", preventDefault() { prevented = true; }, stopPropagation() {} });
  assert.equal(prevented, true);
  assert.equal(harness.render().root.props["data-state"], "idle");
  harness.render().button("Remove domain").props.onClick(); harness.render();
  harness.dispatch("pointerdown", { target: {} });
  assert.equal(harness.render().root.props["data-state"], "idle");
  assert.equal(cancelled, 3); assert.equal(calls, 0);
  harness.render().button("Remove domain").props.onClick(); result = harness.render(); harness.advance();
  result.button("Delete").props.onClick(); result = harness.render();
  result.root.props.onKeyDown({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  harness.dispatch("pointerdown", { target: {} });
  assert.equal(harness.render().root.props["data-state"], "pending");
  assert.equal(cancelled, 3); assert.equal(calls, 1);
  operation.resolve(); await settle(); harness.dispose();
});

test("disabled controls cannot open confirmation even through a stale handler", async () => {
  let calls = 0;
  const harness = await confirmHarness({ disabled: true, onConfirm: () => { calls++; } });
  const result = harness.render();
  assert.equal(result.button("Remove domain").props.disabled, true);
  result.button("Remove domain").props.onClick();
  assert.equal(harness.render().root.props["data-state"], "idle");
  assert.equal(calls, 0);
  harness.dispose();
});

test("pending result callbacks do not update state after the deleted row unmounts", async () => {
  const operation = deferred();
  const harness = await confirmHarness({ onConfirm: () => operation.promise });
  harness.render().button("Remove domain").props.onClick();
  const result = harness.render(); harness.advance(); result.button("Delete").props.onClick();
  harness.render(); harness.dispose(); operation.resolve(); await settle();
  assert.equal(harness.afterUnmountUpdates, 0);
  assert.ok([...harness.listeners.values()].every((listeners) => listeners.size === 0));
});

test("focus follows the inline question, pending face, and trigger without stealing focus from elsewhere", async () => {
  const operation = deferred();
  const harness = await confirmHarness({ onConfirm: () => operation.promise });
  let result = harness.render();
  result.focus(result.button("Remove domain"));
  result.button("Remove domain").props.onClick();
  result = harness.render();
  assert.equal(harness.document.activeElement, result.dom(result.button("Cancel")), "the safe action receives initial focus");
  result.button("Cancel").props.onClick();
  result = harness.render();
  assert.equal(harness.document.activeElement, result.dom(result.button("Remove domain")));
  const elsewhere = {};
  harness.document.activeElement = elsewhere;
  result.button("Remove domain").props.onClick();
  result = harness.render();
  assert.equal(harness.document.activeElement, elsewhere, "programmatic state changes never steal unrelated focus");
  result.focus(result.button("Delete"));
  harness.advance(); result.button("Delete").props.onClick();
  result = harness.render();
  assert.equal(harness.document.activeElement, result.dom(result.root), "the stable inline root owns focus while buttons are absent");
  operation.resolve(); await settle(); harness.dispose();
});

test("Enter answers the question from its root but not from Cancel or repeated key events", async () => {
  let calls = 0;
  const harness = await confirmHarness({ onConfirm: () => { calls++; } });
  harness.render().button("Remove domain").props.onClick();
  let result = harness.render(); harness.advance();
  const event = (target: unknown, repeat = false) => ({ key: "Enter", target, repeat, preventDefault() {}, stopPropagation() {} });
  result.root.props.onKeyDown(event(result.dom(result.button("Cancel"))));
  result.root.props.onKeyDown(event(result.dom(result.root), true));
  assert.equal(calls, 0);
  result.root.props.onKeyDown(event(result.dom(result.root)));
  await settle(); result = harness.render();
  assert.equal(calls, 1);
  assert.equal(result.root.props["data-state"], "done");
  harness.dispose();
});

test("synchronous deletion failures produce inline error feedback and remain retryable", async () => {
  const reason = new Error("Permission denied");
  const errors: unknown[] = [];
  const harness = await confirmHarness({ onConfirm: () => { throw reason; }, onError: (error) => errors.push(error) });
  harness.render().button("Remove domain").props.onClick();
  let result = harness.render(); harness.advance(); result.button("Delete").props.onClick();
  result = harness.render();
  assert.equal(result.root.props["data-state"], "error");
  assert.deepEqual(errors, [reason]);
  assert.equal(result.button("Retry").props.type, "button");
  harness.dispose();
});

test("reduced motion preserves inline actions and switches faces without width animation", async () => {
  const harness = await confirmHarness({}, true);
  const idle = harness.render();
  const firstFace = idle.nodes.find((node) => typeof node.type === "function" && node.type.name === "Face")!;
  assert.equal(firstFace.props.reduced, true);
  firstFace.props.onSize("idle", 80);
  idle.button("Remove domain").props.onClick();
  const question = harness.render();
  const askingFace = question.nodes.find((node) => typeof node.type === "function" && node.type.name === "Face")!;
  askingFace.props.onSize("confirming", 220);
  assert.equal(harness.animations.length, 0);
  assert.equal(question.buttons.length, 2);
  question.button("Cancel").props.onClick();
  assert.equal(harness.render().root.props["data-state"], "idle");
  harness.dispose();
});

test("face CSS measures intrinsic content instead of inheriting the previous animated pill width", async () => {
  const css = await readFile(new URL("../src/components/arc/confirm-morph/confirm-morph.module.css", import.meta.url), "utf8");
  const face = css.match(/(?:^|\n)\.face\s*\{([^}]*)\}/)?.[1];
  assert.ok(face, "the independently measured face has its own CSS rule");
  assert.match(face, /(?:^|;)\s*width:\s*max-content\s*;/);
  assert.match(face, /(?:^|;)\s*flex:\s*none\s*;/);
  assert.doesNotMatch(face, /(?:^|;)\s*(?:max-)?width:\s*100%\s*(?:;|$)/,
    "a percentage face width recreates the icon-size measurement lock");
  // This asserts the CSS contract only. Actual browser geometry is verified
  // separately; Node's DOM stubs cannot establish layout or responsive sizing.
});

test("the actual Face observes its own natural box only while present and disconnects on exit", async () => {
  const source = await readFile(new URL("../src/components/arc/confirm-morph/confirm-morph.tsx", import.meta.url), "utf8");
  const module = { exports: {} as { __testFace: (props: Record<string, unknown>) => Element } };
  const refs: Array<{ current: unknown }> = [];
  const observed: Array<{ callback: () => void; node?: unknown; disconnected: boolean }> = [];
  const reports: Array<{ id: string; width: number }> = [];
  let cursor = 0, present = true;
  let effect: (() => void | (() => void)) | undefined;
  let cleanup: (() => void) | undefined;
  let ownReads = 0, parentReads = 0, width = 324.75;
  const node = {
    getBoundingClientRect() { ownReads++; return { width }; },
    parentElement: { getBoundingClientRect() { parentReads++; return { width: 37 }; } },
  };
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText + "\nexports.__testFace = Face;\n", {
    React, module, exports: module.exports,
    ResizeObserver: class {
      record: (typeof observed)[number];
      constructor(callback: () => void) { this.record = { callback, disconnected: false }; observed.push(this.record); }
      observe(target: unknown) { this.record.node = target; }
      disconnect() { this.record.disconnected = true; }
    },
    require(specifier: string) {
      if (specifier === "react") return {
        ...React,
        useRef(initial: unknown) { const slot = cursor++; return refs[slot] ?? (refs[slot] = { current: initial }); },
        useLayoutEffect(run: () => void | (() => void)) { effect = run; },
      };
      if (specifier === "motion/react") return { motion: { div: () => null }, useIsPresent: () => present };
      if (specifier === "lucide-react") return {};
      if (specifier === "../lib/motion-tokens" || specifier === "../motion-tokens") return { motionTokens };
      if (specifier === "./confirm-morph.module.css") return {};
      throw new Error(`Unexpected Face measurement import: ${specifier}`);
    },
  });
  const render = () => {
    cursor = 0; effect = undefined;
    const tree = module.exports.__testFace({ id: "confirming", reduced: false, children: "Remove api.example.com?", onSize: (id: string, measured: number) => reports.push({ id, width: measured }) });
    (tree.props.ref as { current: unknown }).current = node;
    cleanup?.(); cleanup = effect?.() ?? undefined;
    return tree;
  };
  const incoming = render();
  assert.equal(incoming.props.inert, undefined);
  assert.deepEqual(reports, [{ id: "confirming", width: 324.75 }]);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].node, node, "the current face, not its animated ancestor, is observed");
  width = 351.5; observed[0].callback();
  assert.deepEqual(reports[1], { id: "confirming", width: 351.5 });
  assert.equal(ownReads, 2);
  assert.equal(parentReads, 0);
  present = false;
  const leaving = render();
  assert.equal(leaving.props.inert, true);
  assert.equal(observed[0].disconnected, true);
  assert.equal(observed.length, 1, "the leaving face never opens another observer");
  assert.equal(reports.length, 2, "the leaving face cannot replace the current width measurement");
  cleanup?.();
});

test("mobile face caps derive from the row content box and sibling actions, never the animated pill", async () => {
  const source = await readFile(new URL("../src/components/arc/confirm-morph/confirm-morph.tsx", import.meta.url), "utf8");
  const module = { exports: {} as { __testFace: (props: Record<string, unknown>) => Element } };
  const refs: Array<{ current: unknown }> = [];
  const reports: number[] = [];
  const observers: Array<{ callback: () => void; nodes: unknown[]; disconnected: boolean }> = [];
  let cursor = 0, present = true, rowWidth = 340, siblingWidth = 84, hiddenWidth = 0, gap = 4, pillReads = 0;
  let effect: (() => void | (() => void)) | undefined;
  let cleanup: (() => void) | undefined;
  const rowStyle = { paddingLeft: "16px", paddingRight: "16px", borderLeftWidth: "0px", borderRightWidth: "0px" };
  const boundary = { getBoundingClientRect: () => ({ width: rowWidth }) };
  const sibling = { getBoundingClientRect: () => ({ width: siblingWidth }) };
  const hiddenSibling = { getBoundingClientRect: () => ({ width: hiddenWidth }) };
  const group = { children: [] as unknown[] };
  const root = {
    parentElement: group,
    closest: () => boundary,
    getBoundingClientRect() { pillReads++; return { width: 37 }; },
  };
  group.children = [sibling, hiddenSibling, root];
  const node = {
    style: { maxWidth: "" },
    closest: () => root,
    getBoundingClientRect() {
      const cap = Number.parseFloat(node.style.maxWidth);
      return { width: Number.isFinite(cap) ? Math.min(315, cap) : 315 };
    },
  };
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText + "\nexports.__testFace = Face;\n", {
    React, module, exports: module.exports,
    getComputedStyle(element: unknown) {
      if (element === boundary) return rowStyle;
      assert.equal(element, group);
      return { columnGap: `${gap}px` };
    },
    ResizeObserver: class {
      record: (typeof observers)[number];
      constructor(callback: () => void) { this.record = { callback, nodes: [], disconnected: false }; observers.push(this.record); }
      observe(element: unknown) { this.record.nodes.push(element); }
      disconnect() { this.record.disconnected = true; }
    },
    require(specifier: string) {
      if (specifier === "react") return {
        ...React,
        useRef(initial: unknown) { const slot = cursor++; return refs[slot] ?? (refs[slot] = { current: initial }); },
        useLayoutEffect(run: () => void | (() => void)) { effect = run; },
      };
      if (specifier === "motion/react") return { motion: { div: () => null }, useIsPresent: () => present };
      if (specifier === "lucide-react") return {};
      if (specifier === "../lib/motion-tokens" || specifier === "../motion-tokens") return { motionTokens };
      if (specifier === "./confirm-morph.module.css") return {};
      throw new Error(`Unexpected responsive Face import: ${specifier}`);
    },
  });
  const render = () => {
    cursor = 0; effect = undefined;
    const tree = module.exports.__testFace({ id: "confirming", reduced: false, children: "Remove api.example.com? Cancel Remove", onSize: (_id: string, width: number) => reports.push(width) });
    (tree.props.ref as { current: unknown }).current = node;
    cleanup?.(); cleanup = effect?.() ?? undefined;
    return tree;
  };
  render();
  assert.equal(node.style.maxWidth, "220px", "340px row minus 32px padding, 84px sibling, and one 4px gap");
  assert.deepEqual(reports, [220], "the supplied natural 315px box is capped before it is measured");
  assert.deepEqual(observers[0].nodes, [node, boundary, sibling, hiddenSibling]);
  rowWidth = 270; observers[0].callback();
  assert.equal(node.style.maxWidth, "150px");
  assert.equal(reports.at(-1), 150);
  siblingWidth = 60; gap = 8; observers[0].callback();
  assert.equal(node.style.maxWidth, "170px", "sibling and gap changes are recalculated from the row");
  hiddenWidth = 10; observers[0].callback();
  assert.equal(node.style.maxWidth, "152px", "newly visible sibling actions reserve another gap");
  rowStyle.borderLeftWidth = "1.5px"; rowStyle.borderRightWidth = "1.5px"; observers[0].callback();
  assert.equal(node.style.maxWidth, "149px", "fractional row borders are excluded from available content width");
  assert.equal(pillReads, 0, "responsive caps never read the previously animated 37px pill");
  present = false; render();
  assert.equal(observers[0].disconnected, true);
  assert.equal(observers.length, 1, "exiting faces no longer observe any layout boundary");
  cleanup?.();
  // Geometry here is supplied by fixtures; this proves the cap calculation and
  // observation contract, not CSS layout or actual mobile button visibility.
});

test("natural face reports expand an icon-width pill and later shrink it to the trigger", async () => {
  const harness = await confirmHarness({ iconOnly: true });
  const idle = harness.render();
  const idleFace = idle.nodes.find((node) => typeof node.type === "function" && node.type.name === "Face")!;
  idleFace.props.onSize("idle", 37);
  assert.equal(harness.animations.length, 0);
  idle.button("Remove domain").props.onClick();
  const question = harness.render();
  const questionFace = question.nodes.find((node) => typeof node.type === "function" && node.type.name === "Face")!;
  questionFace.props.onSize("confirming", 324.75);
  assert.equal(harness.animations.length, 1);
  const grow = harness.animations[0];
  assert.equal(grow.from, 37);
  assert.equal(grow.target, 324.75, "the wider face is never replaced by the old icon-sized pill");
  grow.finish();
  question.button("Cancel").props.onClick();
  const resting = harness.render();
  const restingFace = resting.nodes.find((node) => typeof node.type === "function" && node.type.name === "Face")!;
  restingFace.props.onSize("idle", 37);
  assert.equal(harness.animations.length, 2);
  const shrink = harness.animations[1];
  assert.equal(shrink.from, 324.75);
  assert.equal(shrink.target, 37);
  assert.notDeepEqual(grow.options, shrink.options, "growth and settling use their existing distinct springs");
  shrink.finish(); harness.dispose();
});

/** Execute the real card to inspect and invoke its integration props; no API or browser is involved. */
async function resourceCardHarness(kind: "domain" | "subdomain", onDelete: (id: string) => Promise<unknown>) {
  const file = kind === "domain" ? "domains/domain-card.tsx" : "subdomains/subdomain-card.tsx";
  const source = (await readFile(new URL(`../src/components/${file}`, import.meta.url), "utf8"))
    .replaceAll("import.meta.env?.VITE_TUNNEL_URL", "undefined");
  const values: any[] = [];
  let cursor = 0;
  const primitive = (name: string) => Object.assign(() => null, { displayName: name });
  const ConfirmMorph = primitive("ConfirmMorph");
  const hooks = {
    ...React,
    useState(initial: any) {
      const slot = cursor++;
      if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
      return [values[slot], (next: any) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }];
    },
    useRef(initial: any) { const slot = cursor++; return values[slot] ?? (values[slot] = { current: initial }); },
    useId() { const slot = cursor++; return values[slot] ?? (values[slot] = `resource-${slot}`); },
    useCallback(callback: unknown) { return callback; },
  };
  const wrapperModule = { exports: {} as typeof import("../src/components/arc/confirm-morph/resource-confirm-delete") };
  const wrapperSource = await readFile(new URL("../src/components/arc/confirm-morph/resource-confirm-delete.tsx", import.meta.url), "utf8");
  const document = { activeElement: {} as object, body: {} as object };
  const frames: Array<() => void> = [];
  runInNewContext(ts.transpileModule(wrapperSource, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, {
    React, Error, module: wrapperModule, exports: wrapperModule.exports, document,
    requestAnimationFrame(callback: () => void) { frames.push(callback); return frames.length; },
    require(specifier: string) {
      if (specifier === "react") return hooks;
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: primitive("HugeiconsIcon") };
      if (specifier.startsWith("@outray/icons/")) return primitive(specifier);
      if (specifier === "./confirm-morph") return { ConfirmMorph };
      throw new Error(`Unexpected resource confirmation wrapper import: ${specifier}`);
    },
  });
  const module = { exports: {} as Record<string, (props: Record<string, unknown>) => React.ReactNode> };
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, {
    React, Error, Date, module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "react") return hooks;
      if (specifier === "lucide-react") return { ChevronDown: primitive("ChevronDown") };
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: primitive("HugeiconsIcon") };
      if (specifier.startsWith("@outray/icons/")) return primitive(specifier);
      if (specifier === "@/components/arc/button/button") return { Button: primitive("Button") };
      if (specifier === "@/components/arc/copy-button/copy-button") return { CopyButton: primitive("CopyButton") };
      if (specifier === "@/components/arc/confirm-morph/resource-confirm-delete") return wrapperModule.exports;
      if (specifier.endsWith("shared/public-hosts")) return { tunnelDnsHostname: () => "tunnels.outray.app" };
      throw new Error(`Unexpected resource card import: ${specifier}`);
    },
  });
  const props = kind === "domain"
    ? { domain: { id: "domain-1", domain: "api.example.com", status: "pending", createdAt: "2026-10-13T08:00:00Z" }, onDelete, onVerify: async () => {}, isVerifying: false }
    : { subdomain: { id: "subdomain-1", subdomain: "preview", createdAt: "2026-10-13T08:00:00Z" }, onDelete };
  return {
    document, frames,
    render(overrides: Record<string, unknown> = {}) {
      cursor = 0;
      const tree = module.exports[kind === "domain" ? "DomainCard" : "SubdomainCard"]({ ...props, ...overrides });
      const resource = elements(tree).find((node) => node.type === wrapperModule.exports.ResourceConfirmDelete);
      assert.ok(resource, "the resource card shares the non-modal delete integration");
      const integrated = wrapperModule.exports.ResourceConfirmDelete(resource.props as React.ComponentProps<typeof wrapperModule.exports.ResourceConfirmDelete>);
      const nodes = [...elements(tree), ...elements(integrated)];
      const confirm = nodes.find((node) => node.type === ConfirmMorph);
      assert.ok(confirm, "resource deletion uses the shared inline control rather than a modal");
      return { tree, nodes, confirm };
    },
  };
}

test("domain and subdomain cards await their own delete promise and configure irreversible inline confirmation", async () => {
  for (const kind of ["domain", "subdomain"] as const) {
    const operation = deferred();
    const ids: string[] = [];
    const harness = await resourceCardHarness(kind, (id) => { ids.push(id); return operation.promise; });
    const result = harness.render();
    assert.deepEqual(ids, [], "rendering never performs deletion");
    assert.equal(result.confirm.props.prompt, "Are you sure?");
    assert.equal(result.confirm.props.ariaLabel, kind === "domain"
      ? "Remove domain api.example.com"
      : "Release subdomain preview.outray.app", "the compact question retains a resource-specific accessible action name");
    assert.equal(result.confirm.props.confirmMode ?? "press", "press");
    assert.equal(result.confirm.props.iconOnly, true);
    assert.equal(result.confirm.props.resultTimeout, 0, "failure feedback never disappears before the user can retry");
    assert.equal(result.confirm.props.onUndo, undefined, "these delete APIs cannot undo a deletion");
    assert.equal(result.nodes.some((node) => node.props.role === "dialog" || node.props["aria-haspopup"] === "dialog"), false);
    const pending = result.confirm.props.onConfirm();
    assert.ok(pending && typeof pending.then === "function", "the inline control receives the real asynchronous request");
    assert.deepEqual(ids, [`${kind}-1`]);
    let settled = false;
    void pending.then(() => { settled = true; });
    await settle();
    assert.equal(settled, false);
    operation.resolve(); await pending;
    if (kind === "domain") assert.equal(harness.render({ isVerifying: true }).confirm.props.disabled, true);
  }
});

test("resource deletion failures propagate to the morph and show their actual error inline", async () => {
  for (const kind of ["domain", "subdomain"] as const) {
    const reason = new Error(`Could not remove ${kind}`);
    const harness = await resourceCardHarness(kind, async () => { throw reason; });
    const initial = harness.render();
    await assert.rejects(initial.confirm.props.onConfirm(), (error) => error === reason);
    initial.confirm.props.onError(reason);
    const failed = harness.render();
    assert.equal(failed.confirm.props.errorLabel, reason.message, "the morph receives the actual API error for its inline alert");
  }
});

test("removing a focused resource restores focus to a surviving neighbor after the row is gone", async () => {
  const operation = deferred();
  const harness = await resourceCardHarness("subdomain", () => operation.promise);
  const result = harness.render();
  const neighbor = { isConnected: true, focus() { harness.document.activeElement = neighbor; } };
  const row = {
    isConnected: true,
    nextElementSibling: { querySelector: () => neighbor },
    previousElementSibling: null,
    closest: () => undefined,
  };
  const control = { closest: () => row, contains: (element: object) => element === control };
  (result.confirm.props.ref as { current: unknown }).current = control;
  harness.document.activeElement = control;
  const pending = result.confirm.props.onConfirm();
  row.isConnected = false;
  harness.document.activeElement = harness.document.body;
  operation.resolve(); await pending;
  assert.equal(harness.frames.length, 1, "focus waits for the row removal commit");
  harness.frames[0]();
  assert.equal(harness.document.activeElement, neighbor);
});

test("resource deletion never steals focus from a user who moved elsewhere while it was pending", async () => {
  const operation = deferred();
  const harness = await resourceCardHarness("domain", () => operation.promise);
  const result = harness.render();
  let focusedNeighbor = false;
  const neighbor = { isConnected: true, focus() { focusedNeighbor = true; } };
  const row = {
    isConnected: true,
    nextElementSibling: { querySelector: () => neighbor },
    previousElementSibling: null,
    closest: () => undefined,
  };
  const control = { closest: () => row, contains: (element: object) => element === control };
  (result.confirm.props.ref as { current: unknown }).current = control;
  harness.document.activeElement = control;
  const pending = result.confirm.props.onConfirm();
  const elsewhere = {};
  row.isConnected = false;
  harness.document.activeElement = elsewhere;
  operation.resolve(); await pending;
  harness.frames.forEach((frame) => frame());
  assert.equal(focusedNeighbor, false);
  assert.equal(harness.document.activeElement, elsewhere);
});
