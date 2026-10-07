import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createHoldToDeleteController } from "../src/components/secrets/hold-to-delete-controller";
import { HoldToDelete } from "../src/components/secrets/hold-to-delete";

Object.assign(globalThis, { React });
const HOLD_DURATION = 5000;

function setup() {
  let time = 0;
  let id = 0;
  let confirms = 0;
  const tasks = new Map<number, { due: number; callback: () => void }>();
  const progress: number[] = [];
  const controller = createHoldToDeleteController({
    now: () => time,
    schedule: (callback, delay) => { const handle = ++id; tasks.set(handle, { due: time + delay, callback }); return handle; },
    cancelScheduled: (handle) => { tasks.delete(handle as number); },
    onProgress: (value) => progress.push(value),
    onConfirm: () => { confirms++; },
  });
  function advance(duration: number) {
    const end = time + duration;
    while (tasks.size) {
      const next = [...tasks.entries()].sort(([, a], [, b]) => a.due - b.due)[0];
      if (next[1].due > end) break;
      time = next[1].due; tasks.delete(next[0]); next[1].callback();
    }
    time = end;
  }
  return { controller, advance, tasks, progress, confirms: () => confirms };
}

test("a deliberate hold confirms exactly once after 5 seconds, never before", () => {
  const harness = setup();
  harness.controller.begin("pointer:1");
  harness.advance(HOLD_DURATION - 1);
  assert.equal(harness.confirms(), 0);
  assert.ok(harness.progress.at(-1)! > .9 && harness.progress.at(-1)! < 1);
  harness.advance(1);
  assert.equal(harness.confirms(), 1);
  assert.equal(harness.progress.at(-1), 1);
  harness.advance(HOLD_DURATION);
  harness.controller.begin("pointer:1");
  harness.advance(HOLD_DURATION);
  assert.equal(harness.confirms(), 1, "the same pressed input cannot fire twice");
  harness.controller.cancel("pointer:1");
  harness.controller.begin("pointer:1");
  harness.advance(HOLD_DURATION);
  assert.equal(harness.confirms(), 2, "a genuinely new hold may confirm again");
});

test("a click or interrupted hold resets completely and never resumes its earlier progress", () => {
  for (const source of ["pointer:4", "keyboard:Enter", "keyboard: "] as const) {
    const harness = setup();
    harness.controller.begin(source);
    harness.advance(200);
    harness.controller.cancel(source);
    harness.advance(HOLD_DURATION + 1000);
    assert.equal(harness.confirms(), 0);
    assert.equal(harness.progress.at(-1), 0);
    assert.equal(harness.tasks.size, 0);
    harness.controller.begin(source);
    harness.advance(HOLD_DURATION - 1);
    assert.equal(harness.confirms(), 0, "a new hold starts from zero");
    harness.advance(1);
    assert.equal(harness.confirms(), 1);
  }
});

test("keyboard auto-repeat and second inputs neither restart a hold nor cancel a different input", () => {
  const harness = setup();
  harness.controller.begin("keyboard: ");
  harness.advance(2000);
  harness.controller.begin("keyboard: ");
  harness.controller.begin("pointer:2");
  harness.controller.cancel("pointer:2");
  harness.controller.cancel("keyboard:Enter");
  harness.advance(HOLD_DURATION - 2000);
  assert.equal(harness.confirms(), 1);
});

test("unconditional cancellation invalidates even a queued callback from a previous hold", () => {
  const harness = setup();
  harness.controller.begin("pointer:1");
  const stale = [...harness.tasks.values()][0].callback;
  harness.advance(HOLD_DURATION - 100);
  harness.controller.cancel();
  harness.controller.begin("keyboard:Enter");
  stale();
  harness.advance(HOLD_DURATION - 1);
  assert.equal(harness.confirms(), 0);
  harness.advance(1);
  assert.equal(harness.confirms(), 1);
});

test("the rendered action uses Arc danger styling, an explicit non-submit button, and keyboard/screen-reader instructions", () => {
  const html = renderToStaticMarkup(React.createElement(HoldToDelete, { onConfirm: () => {}, label: "Hold to delete 24 secrets" }));
  assert.match(html, /<button[^>]*type="button"/);
  assert.match(html, /class="[^"]*danger[^"]*button/);
  assert.match(html, /aria-label="Hold to delete 24 secrets"/);
  const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(describedBy); assert.ok(html.includes(`id="${describedBy}"`));
  assert.match(html, /Hold for 5 seconds/);
  assert.match(html, /Hold this button for 5 seconds to confirm/);
  assert.doesNotMatch(html, /1\.5 seconds/);
  assert.match(html, /hold Space or Enter/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /--hold-progress:0/);
});

test("disabled and pending actions remain inert and loading retains keyboard focus", () => {
  const disabled = renderToStaticMarkup(React.createElement(HoldToDelete, { onConfirm: () => {}, disabled: true }));
  assert.match(disabled, /<button[^>]*disabled=""/);
  const loading = renderToStaticMarkup(React.createElement(HoldToDelete, { onConfirm: () => {}, disabled: true, loading: true }));
  assert.match(loading, /<button[^>]*aria-busy="true"/);
  assert.match(loading, /<button[^>]*aria-disabled="true"/);
  assert.doesNotMatch(loading, /<button[^>]*\sdisabled=""/);
  assert.match(loading, /Deleting selected secrets\./);
});

test("the hold action is a prominent full-width control with a centered 5-second hint and reduced-motion-safe progress", async () => {
  const css = await readFile(new URL("../src/components/secrets/hold-to-delete.module.css", import.meta.url), "utf8");
  const control = css.match(/\.control\s*\{([^}]+)\}/)?.[1] ?? "";
  const button = css.match(/\.button\.button\s*\{([^}]+)\}/)?.[1] ?? "";
  const hint = css.match(/\.hint\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(control, /width:\s*100%/);
  assert.match(control, /align-items:\s*stretch/);
  assert.match(button, /width:\s*100%/);
  assert.match(button, /min-height:\s*52px/);
  assert.match(button, /background:\s*#bd3044/);
  assert.match(hint, /text-align:\s*center/);
  assert.match(hint, /font-size:\s*11px/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*transition:\s*none/);
  const html = renderToStaticMarkup(React.createElement(HoldToDelete, { onConfirm: () => {} }));
  assert.match(html, /<button[^>]*class="[^"]*\blg\b/);
  assert.match(html, /Hold for 5 seconds/);
});

test("pointer release, moving away, cancellation, blur, Escape, and hidden tabs are all wired to reset the same hold", async () => {
  const source = await readFile(new URL("../src/components/secrets/hold-to-delete.tsx", import.meta.url), "utf8");
  for (const name of ["onPointerUp", "onPointerCancel", "onPointerLeave", "onBlur", "onKeyUp"]) assert.match(source, new RegExp(`${name}=`));
  assert.match(source, /event\.key === "Escape"[\s\S]*?\.cancel\(\)/);
  assert.match(source, /document\.visibilityState !== "visible"[\s\S]*?hold\.cancel\(\)/);
  assert.match(source, /event\.repeat/);
  assert.match(source, /getBoundingClientRect\(\)/, "touch's implicit capture does not hide moving away");
  assert.match(source, /onClick=\{\(event\) => event\.preventDefault\(\)\}/, "synthesized clicks cannot bypass the hold");
  assert.match(source, /removeEventListener\("pointerup"/);
  assert.match(source, /removeEventListener\("visibilitychange"/);
});

async function interactiveHarness(props: { disabled?: boolean; loading?: boolean } = {}) {
  const source = await readFile(new URL("../src/components/secrets/hold-to-delete.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const module = { exports: {} as { HoldToDelete: typeof HoldToDelete } };
  const effects: Array<() => undefined | (() => void)> = [];
  const listeners = new Map<string, (event?: unknown) => void>();
  const tasks = new Map<number, { due: number; callback: () => void }>();
  let time = 0, id = 0, confirms = 0, focused = 0;
  const Button = () => null;
  const document = {
    visibilityState: "visible",
    addEventListener: (name: string, listener: (event?: unknown) => void) => { listeners.set(`document:${name}`, listener); },
    removeEventListener: (name: string) => { listeners.delete(`document:${name}`); },
  };
  runInNewContext(compiled, {
    React, module, exports: module.exports, document,
    performance: { now: () => time },
    window: {
      setTimeout: (callback: () => void, delay: number) => { const handle = ++id; tasks.set(handle, { due: time + delay, callback }); return handle; },
      clearTimeout: (handle: number) => { tasks.delete(handle); },
      addEventListener: (name: string, listener: (event?: unknown) => void) => { listeners.set(`window:${name}`, listener); },
      removeEventListener: (name: string) => { listeners.delete(`window:${name}`); },
    },
    require: (specifier: string) => {
      if (specifier === "react") return {
        useId: () => "hold-test", useRef: (current: unknown) => ({ current }), useState: (value: unknown) => [value, () => {}],
        useLayoutEffect: (effect: () => undefined | (() => void)) => { effects.push(effect); },
      };
      if (specifier === "lucide-react") return { Trash2: () => null };
      if (specifier === "../arc/button/button") return { Button };
      if (specifier === "./hold-to-delete-controller") return { createHoldToDeleteController };
      if (specifier.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, key) => key }), __esModule: true };
      throw new Error(`Unexpected hold-to-delete dependency: ${specifier}`);
    },
  });
  function elements(node: React.ReactNode): React.ReactElement<Record<string, any>>[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<Record<string, any>>; return [element, ...elements(element.props.children)];
  }
  const nodes = elements(module.exports.HoldToDelete({ ...props, onConfirm: () => { confirms++; } }));
  const button = nodes.find((node) => node.type === Button);
  assert.ok(button);
  const cleanups = effects.map((effect) => effect()).filter((cleanup) => typeof cleanup === "function");
  function advance(duration: number) {
    const end = time + duration;
    while (tasks.size) {
      const next = [...tasks.entries()].sort(([, a], [, b]) => a.due - b.due)[0];
      if (next[1].due > end) break;
      time = next[1].due; tasks.delete(next[0]); next[1].callback();
    }
    time = end;
  }
  const event = (overrides: Record<string, unknown> = {}) => ({
    prevented: false, preventDefault() { this.prevented = true; },
    button: 0, isPrimary: true, pointerId: 1, clientX: 50, clientY: 18,
    key: " ", repeat: false, altKey: false, ctrlKey: false, metaKey: false,
    currentTarget: { focus: () => { focused++; }, getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 36 }) },
    ...overrides,
  });
  return { handlers: button.props, advance, event, document, listeners, tasks,
    confirms: () => confirms, focused: () => focused,
    dispose: () => cleanups.forEach((cleanup) => cleanup()),
  };
}

test("actual keyboard and pointer handlers cannot be bypassed by a native or synthesized click", async () => {
  const harness = await interactiveHarness();
  const click = harness.event(); harness.handlers.onClick(click);
  assert.equal(click.prevented, true); harness.advance(HOLD_DURATION + 1000); assert.equal(harness.confirms(), 0);
  harness.handlers.onPointerDown(harness.event({ button: 2 }));
  harness.handlers.onPointerDown(harness.event({ isPrimary: false }));
  harness.handlers.onKeyDown(harness.event({ repeat: true }));
  harness.handlers.onKeyDown(harness.event({ key: "Enter", ctrlKey: true }));
  harness.advance(HOLD_DURATION + 1000); assert.equal(harness.confirms(), 0);
  harness.handlers.onKeyDown(harness.event({ key: "Enter" }));
  harness.advance(HOLD_DURATION - 1); assert.equal(harness.confirms(), 0);
  harness.handlers.onKeyUp(harness.event({ key: "Enter" }));
  harness.advance(1); assert.equal(harness.confirms(), 0);
  harness.handlers.onPointerDown(harness.event());
  assert.equal(harness.focused(), 1);
  harness.advance(HOLD_DURATION - 1); assert.equal(harness.confirms(), 0);
  harness.advance(1); assert.equal(harness.confirms(), 1);
  harness.handlers.onClick(harness.event()); harness.advance(HOLD_DURATION); assert.equal(harness.confirms(), 1);
  harness.dispose(); assert.equal(harness.listeners.size, 0); assert.equal(harness.tasks.size, 0);
});

test("actual interruption adapters cancel active holds immediately, including captured touch moving outside the button", async () => {
  const harness = await interactiveHarness();
  const interruptions = [
    () => harness.handlers.onPointerMove(harness.event({ clientX: 101 })),
    () => harness.handlers.onPointerLeave(harness.event()),
    () => harness.handlers.onPointerCancel(harness.event()),
    () => harness.handlers.onBlur(),
    () => harness.handlers.onKeyDown(harness.event({ key: "Escape" })),
    () => harness.listeners.get("window:pointerup")?.({ pointerId: 1 }),
    () => harness.listeners.get("window:pointercancel")?.({ pointerId: 1 }),
    () => harness.listeners.get("window:blur")?.(),
    () => harness.listeners.get("window:keydown")?.({ key: "Escape" }),
    () => { harness.document.visibilityState = "hidden"; harness.listeners.get("document:visibilitychange")?.(); },
  ];
  for (const interrupt of interruptions) {
    harness.document.visibilityState = "visible";
    harness.handlers.onPointerDown(harness.event()); harness.advance(HOLD_DURATION - 1); interrupt(); harness.advance(HOLD_DURATION + 1000);
    assert.equal(harness.confirms(), 0); assert.equal(harness.tasks.size, 0);
  }
  harness.handlers.onKeyDown(harness.event({ key: " " })); harness.advance(HOLD_DURATION);
  assert.equal(harness.confirms(), 1, "resetting never breaks the next valid keyboard hold");
  harness.dispose();
});

test("actual pending/disabled event handlers schedule no confirmation and unmount cancels a pending hold", async () => {
  for (const props of [{ disabled: true }, { loading: true }]) {
    const harness = await interactiveHarness(props);
    harness.handlers.onPointerDown(harness.event()); harness.handlers.onKeyDown(harness.event({ key: "Enter" })); harness.advance(HOLD_DURATION + 1000);
    assert.equal(harness.confirms(), 0); assert.equal(harness.tasks.size, 0); harness.dispose();
  }
  const harness = await interactiveHarness();
  harness.handlers.onPointerDown(harness.event()); harness.advance(HOLD_DURATION - 1); harness.dispose(); harness.advance(HOLD_DURATION + 1000);
  assert.equal(harness.confirms(), 0); assert.equal(harness.listeners.size, 0); assert.equal(harness.tasks.size, 0);
});
