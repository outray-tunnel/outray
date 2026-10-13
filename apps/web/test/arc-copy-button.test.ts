import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import type { CopyButtonProps } from "../src/components/arc/copy-button/copy-button";
import { motionTokens } from "../src/components/arc/lib/motion-tokens";

type Element = React.ReactElement<Record<string, any>>;
type Effect = { run: () => void | (() => void); deps: unknown[] };

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

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Execute the real copy control and feedback hook; only browser APIs and Motion primitives are isolated. */
async function copyHarness(initial: Partial<CopyButtonProps> = {}, reduced = false) {
  const [buttonSource, feedbackSource] = await Promise.all([
    readFile(new URL("../src/components/arc/copy-button/copy-button.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/arc/lib/use-copy-feedback.ts", import.meta.url), "utf8"),
  ]);
  const compile = (source: string) => ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const primitive = (name: string) => Object.assign(() => null, { displayName: name });
  const icons = { Copy: primitive("Copy"), CircleAlert: primitive("CircleAlert") };
  const motion = { span: primitive("motion.span"), path: primitive("motion.path") };
  const AnimatePresence = primitive("AnimatePresence");
  const values: any[] = [];
  const committed: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const clipboard: string[] = [];
  let cursor = 0, timerId = 0;
  let effects: Effect[] = [];
  let clipboardResponse: () => Promise<void> = async () => undefined;
  const hooks = {
    ...React,
    useState(initialValue: any) {
      const slot = cursor++;
      if (!(slot in values)) values[slot] = typeof initialValue === "function" ? initialValue() : initialValue;
      return [values[slot], (next: any) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }];
    },
    useRef(initialValue: any) { const slot = cursor++; return values[slot] ?? (values[slot] = { current: initialValue }); },
    useCallback(callback: unknown) { return callback; },
    useEffect(run: Effect["run"], deps: unknown[]) { effects.push({ run, deps }); },
  };
  const feedbackModule = { exports: {} as typeof import("../src/components/arc/lib/use-copy-feedback") };
  runInNewContext(compile(feedbackSource), {
    module: feedbackModule, exports: feedbackModule.exports,
    navigator: { clipboard: { async writeText(value: string) { clipboard.push(value); await clipboardResponse(); } } },
    setTimeout(callback: () => void, delay: number) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    require(specifier: string) {
      if (specifier === "react") return hooks;
      throw new Error(`Unexpected copy feedback import: ${specifier}`);
    },
  });
  const buttonModule = { exports: {} as typeof import("../src/components/arc/copy-button/copy-button") };
  runInNewContext(compile(buttonSource), {
    React, module: buttonModule, exports: buttonModule.exports,
    require(specifier: string) {
      if (specifier === "react") return hooks;
      if (specifier === "motion/react") return { AnimatePresence, motion, useReducedMotion: () => reduced };
      if (specifier === "lucide-react") return icons;
      if (specifier === "../lib/motion-tokens") return { motionTokens };
      if (specifier === "../lib/use-copy-feedback") return feedbackModule.exports;
      throw new Error(`Unexpected CopyButton import: ${specifier}`);
    },
  });
  const props: CopyButtonProps = { value: "https://example.outray.app", ...initial };
  return {
    clipboard, timers, icons, motion, AnimatePresence,
    clipboardWith(response: typeof clipboardResponse) { clipboardResponse = response; },
    render(next: Partial<CopyButtonProps> = {}) {
      Object.assign(props, next);
      cursor = 0; effects = [];
      const tree = buttonModule.exports.CopyButton(props);
      effects.forEach((effect, slot) => {
        const previous = committed[slot];
        if (previous && previous.deps.length === effect.deps.length && previous.deps.every((value, index) => Object.is(value, effect.deps[index]))) return;
        previous?.cleanup?.();
        committed[slot] = { deps: [...effect.deps], cleanup: effect.run() ?? undefined };
      });
      const nodes = elements(tree);
      const button = nodes.find((node) => node.type === "button")!;
      const status = nodes.find((node) => node.props.role === "status")!;
      return { tree, nodes, button, status };
    },
    expireFeedback() {
      for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); }
    },
    dispose() { committed.forEach((effect) => effect.cleanup?.()); },
  };
}

test("copy actions default to one bare icon with an accessible name and stable hit target", async () => {
  const harness = await copyHarness();
  const { button, status, nodes } = harness.render();
  const classes = String(button.props.className).split(/\s+/);
  assert.equal(button.props.type, "button");
  assert.equal(button.props["aria-label"], "Copy");
  assert.equal(button.props.title, "Copy");
  assert.equal(button.props["data-copy-state"], "idle");
  for (const utility of ["size-8", "px-0", "bg-transparent", "border-transparent", "hover:bg-transparent"]) {
    assert.ok(classes.includes(utility), `${utility} keeps the default copy control icon-only`);
  }
  assert.equal(text(button.props.children), "", "neither visible labels nor invisible label sizing cells remain");
  assert.equal(nodes.filter((node) => node.type === harness.icons.Copy).length, 1);
  assert.equal(nodes.filter((node) => node.type === harness.AnimatePresence).length, 1, "only glyph feedback has a presence boundary");
  assert.equal(status.props["aria-live"], "polite");
  assert.equal(status.props.className, "sr-only");
  assert.equal(text(status), "", "idle controls do not announce success");
});

test("icon-only controls preserve custom names, caller sizing, disabled semantics, and outline opt-in", async () => {
  const harness = await copyHarness({ label: "Copy request ID", iconOnly: true, className: "caller-control", disabled: true, variant: "outline" });
  const { button, nodes } = harness.render();
  assert.equal(button.props["aria-label"], "Copy request ID");
  assert.equal(button.props.title, "Copy request ID");
  assert.equal(button.props.disabled, true, "the native button prevents disabled activation");
  assert.ok(String(button.props.className).split(/\s+/).includes("caller-control"));
  assert.equal(text(button.props.children), "", "outline opt-in never restores a text label");
  assert.equal(nodes.filter((node) => node.type === harness.icons.Copy).length, 1);
  assert.equal(harness.clipboard.length, 0);
});

test("successful copying preserves the raw value and callback while announcing icon feedback", async () => {
  let copied = 0, failed = 0;
  const value = "  export TOKEN='example'\n\n";
  const harness = await copyHarness({ value, label: "Copy command", onCopied: () => copied++, onCopyError: () => failed++ });
  const initial = harness.render();
  initial.button.props.onClick();
  await settle();
  const result = harness.render();
  assert.deepEqual(harness.clipboard, [value], "formatting is not trimmed or rewritten");
  assert.equal(copied, 1);
  assert.equal(failed, 0);
  assert.equal(result.button.props["data-copy-state"], "copied");
  assert.equal(text(result.button.props.children), "");
  assert.equal(result.button.props["aria-label"], "Copy command", "feedback does not replace the action's accessible name");
  assert.equal(text(result.status), "Copy command: Copied");
  assert.ok(result.nodes.some((node) => typeof node.type === "function" && node.type.name === "DrawnCheck"));
  assert.equal(result.nodes.some((node) => node.type === harness.icons.Copy), false);
  assert.equal(result.nodes.some((node) => node.type === harness.icons.CircleAlert), false);
  assert.equal(harness.timers.size, 1);
  harness.expireFeedback();
  const reset = harness.render();
  assert.equal(reset.button.props["data-copy-state"], "idle");
  assert.equal(text(reset.status), "");
  assert.ok(reset.nodes.some((node) => node.type === harness.icons.Copy));
});

test("clipboard failures show the error icon and polite status without firing the success callback", async () => {
  let copied = 0, failed = 0;
  const harness = await copyHarness({ label: "Copy token", onCopied: () => copied++, onCopyError: () => failed++ });
  harness.clipboardWith(async () => { throw new Error("Clipboard permission denied"); });
  harness.render().button.props.onClick();
  await settle();
  const result = harness.render();
  assert.equal(copied, 0);
  assert.equal(failed, 1);
  assert.equal(result.button.props["data-copy-state"], "error");
  assert.equal(text(result.button.props.children), "");
  assert.equal(text(result.status), "Copy token: Could not copy");
  assert.ok(result.nodes.some((node) => node.type === harness.icons.CircleAlert));
  assert.equal(result.nodes.some((node) => node.type === harness.icons.Copy), false);
  harness.expireFeedback();
  assert.equal(harness.render().button.props["data-copy-state"], "idle");
});

test("repeat copies use current values, replace feedback expiry, and clean up on unmount", async () => {
  const harness = await copyHarness({ value: "first" });
  harness.render().button.props.onClick();
  await settle();
  const firstTimer = [...harness.timers.keys()][0];
  harness.render({ value: "" }).button.props.onClick();
  await settle();
  assert.deepEqual(harness.clipboard, ["first", ""], "empty strings are still legitimate clipboard values");
  assert.equal(harness.timers.size, 1, "the newest copy replaces the prior reset timer");
  assert.equal(harness.timers.has(firstTimer), false);
  harness.dispose();
  assert.equal(harness.timers.size, 0, "unmount does not leave feedback timers behind");
});

test("reduced motion keeps glyph feedback immediate without removing copy behavior", async () => {
  const harness = await copyHarness({}, true);
  let result = harness.render();
  let glyph = result.nodes.find((node) => node.type === harness.motion.span)!;
  assert.equal(glyph.props.transition.duration, motionTokens.duration.instant);
  assert.equal(glyph.props.initial.scale, 1);
  assert.equal(glyph.props.exit.transition.duration, motionTokens.duration.instant);
  result.button.props.onClick();
  await settle();
  result = harness.render();
  glyph = result.nodes.find((node) => node.type === harness.motion.span)!;
  assert.equal(glyph.props.transition.duration, motionTokens.duration.instant);
  const tick = result.nodes.find((node) => typeof node.type === "function" && node.type.name === "DrawnCheck")!;
  assert.equal(tick.props.reduced, true);
  const drawn = (tick.type as (props: Record<string, any>) => React.ReactNode)(tick.props);
  assert.equal(elements(drawn).find((node) => node.type === harness.motion.path)?.props.initial, false);
  assert.equal(text(result.status), "Copy: Copied");
});
