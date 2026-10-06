import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  WorkspaceInput,
  WorkspaceTextarea,
} from "../src/components/ui/workspace-input";
import { workspaceInputBareClassName, workspaceInputClassName, workspaceInputShellClassName, workspaceTextareaClassName } from "../src/components/ui/workspace-input-styles";
import { SearchField } from "../src/components/arc/search-field/search-field";
import { motionTokens } from "../src/components/arc/lib/motion-tokens";

Object.assign(globalThis, { React });
type Element = React.ReactElement<Record<string, any>>;
type RawForwardRef = { render: (props: Record<string, any>, ref: React.Ref<any>) => Element };
function raw(component: unknown, props: Record<string, any>, ref: React.Ref<any> = null): Element {
  return (component as RawForwardRef).render(props, ref);
}
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

test("workspace inputs preserve native values, constraints, accessible field errors and refs", () => {
  const ref = { current: null } as React.RefObject<HTMLInputElement | null>;
  let value = "";
  let focused = false;
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => { value = event.target.value; };
  const onFocus = () => { focused = true; };
  const field = raw(WorkspaceInput, {
    id: "vault-name", name: "name", type: "text", value: "Payments", required: true,
    minLength: 2, maxLength: 100, disabled: true, autoComplete: "off", autoFocus: true,
    "aria-label": "Vault name", "aria-invalid": true, "aria-describedby": "name-error",
    onChange, onFocus, className: "mt-2", "data-custom": "retained",
  }, ref);
  assert.equal(field.type, "input");
  assert.equal(field.props.ref, ref);
  for (const [key, expected] of Object.entries({
    id: "vault-name", name: "name", value: "Payments", required: true, minLength: 2,
    maxLength: 100, disabled: true, autoComplete: "off", autoFocus: true,
    "aria-label": "Vault name", "aria-invalid": true, "aria-describedby": "name-error",
    "data-custom": "retained", "data-workspace-input": "default", "data-field-size": "default",
  })) assert.equal(field.props[key], expected, key);
  assert.equal(field.props.className, `${workspaceInputClassName} mt-2`);
  assert.equal(field.props.onChange, onChange);
  field.props.onChange({ target: { value: "Billing" } }); field.props.onFocus();
  assert.equal(value, "Billing"); assert.equal(focused, true);
  const html = renderToStaticMarkup(field);
  assert.match(html, /aria-invalid="true"/); assert.match(html, /aria-describedby="name-error"/);
  assert.match(html, /disabled=""/); assert.match(html, /value="Payments"/);
});

test("default, compact and composite inputs opt into one visual system without leaking styling props", () => {
  for (const size of ["default", "compact"] as const) {
    for (const variant of ["default", "bare"] as const) {
      const node = raw(WorkspaceInput, { size, variant, placeholder: "Find a key" });
      assert.equal(node.props["data-field-size"], size);
      assert.equal(node.props["data-workspace-input"], variant);
      assert.equal(node.props.className.trim(), variant === "bare" ? workspaceInputBareClassName : workspaceInputClassName);
      assert.equal("size" in node.props, false, "the visual size is not a native character-width attribute");
      assert.equal("variant" in node.props, false);
    }
  }
  assert.equal(raw(WorkspaceInput, {}).props["data-field-size"], "default");
  assert.equal(raw(WorkspaceInput, {}).props["data-workspace-input"], "default");
});

test("workspace textarea preserves multiline editing, native accessibility and a forwarded callback ref", () => {
  let refNode: HTMLTextAreaElement | null = null;
  const ref = (node: HTMLTextAreaElement | null) => { refNode = node; };
  let nextValue = "";
  const field = raw(WorkspaceTextarea, {
    id: "incident-note", name: "description", value: "First line.\nSecond <line>.", rows: 4,
    required: true, readOnly: true, disabled: true, maxLength: 1000,
    "aria-label": "Description", "aria-invalid": true, "aria-describedby": "description-error",
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => { nextValue = event.target.value; },
    className: "mt-2 resize-none",
  }, ref);
  assert.equal(field.type, "textarea"); assert.equal(field.props.ref, ref);
  assert.equal(field.props.className, `${workspaceTextareaClassName} mt-2 resize-none`);
  assert.equal(field.props.rows, 4); assert.equal(field.props.maxLength, 1000);
  assert.equal(field.props.disabled, true); assert.equal(field.props.readOnly, true);
  assert.equal(field.props["aria-invalid"], true); assert.equal(field.props["aria-describedby"], "description-error");
  field.props.onChange({ target: { value: "Another line.\nStill here." } });
  assert.equal(nextValue, "Another line.\nStill here.");
  const fakeNode = { tagName: "TEXTAREA" } as HTMLTextAreaElement;
  field.props.ref(fakeNode); assert.equal(refNode, fakeNode);
  field.props.ref(null); assert.equal(refNode, null);
  const html = renderToStaticMarkup(field);
  assert.match(html, /rows="4"/); assert.match(html, /readOnly=""/); assert.match(html, /disabled=""/);
  assert.match(html, /First line\.\nSecond &lt;line&gt;\./);
});

test("shared fields own the Create vault geometry and neutral focus without requiring a page wrapper", async () => {
  const css = await readFile(new URL("../src/components/ui/workspace-input.module.css", import.meta.url), "utf8");
  assert.match(css, /\.control\.control,\s*\.shell\.shell\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.control\.control,\s*\.shell\.shell\s*\{[^}]*border-radius:\s*16px/);
  assert.match(css, /\.control\.control,\s*\.shell\.shell\s*\{[^}]*background:\s*#0b0b0b/);
  const focus = css.match(/\.control\.control:focus,[^{]*\{([^}]*)\}/)?.[1];
  assert.ok(focus);
  assert.match(focus, /outline:\s*none/); assert.match(focus, /outline-offset:\s*0/);
  assert.match(focus, /border-color:\s*rgb\(255 255 255 \/ 35%\)/);
  assert.match(focus, /box-shadow:\s*0 0 0 1px rgb\(255 255 255 \/ 8%\)/);
  assert.doesNotMatch(css, /\.workspace-ui|\.outray-arc|#8367c7|outline-accent/, "portaled fields own their treatment rather than relying on surrounding page classes");
  assert.match(css, /\[data-field-size="compact"\][^{]*\{[^}]*height:\s*36px/);
  assert.match(css, /\.control\.textarea\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*112px/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[^{]*\{[^}]*transition:\s*none/);
});

test("composite fields use one shell focus edge and pointer hover cannot weaken focused borders", async () => {
  const css = await readFile(new URL("../src/components/ui/workspace-input.module.css", import.meta.url), "utf8");
  assert.match(css, /\.bare\.bare:focus,[^{]*\{[^}]*outline:\s*none;[^}]*box-shadow:\s*none/);
  const shellHover = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(([_, selector, body]) => selector.includes(".shell:hover") && body.includes("border-color"));
  assert.ok(shellHover);
  assert.match(shellHover[1], /\.shell:hover(?=[^{]*:not\(:focus-within\))/, "shell hover cannot beat the focused border with its :has(input) selector specificity");
  assert.match(css, /\.shell\.shell:has\(input\[aria-invalid="true"\]\):focus-within[^}]*border-color:\s*#fb7185/);
  assert.match(css, /\.shell > input:disabled\s*\{[^}]*opacity:\s*1/, "disabled shell and disabled inner input do not dim twice");
});

test("stock SearchField stays stock and workspace SearchField is an explicit visual opt-in", () => {
  const props = { id: "request-query", label: "Search requests", value: "checkout", onValueChange() {}, placeholder: "Find a request", disabled: true, "aria-describedby": "request-query-hint" };
  const stock = renderToStaticMarkup(React.createElement(SearchField, props));
  const explicitStock = renderToStaticMarkup(React.createElement(SearchField, { ...props, appearance: "default" }));
  assert.equal(stock, explicitStock);
  assert.doesNotMatch(stock, /data-workspace-input|data-field-size/);
  const workspace = renderToStaticMarkup(React.createElement(SearchField, { ...props, appearance: "workspace" }));
  assert.match(workspace, /data-workspace-input="bare" data-field-size="compact"/);
  for (const html of [stock, workspace]) {
    assert.match(html, /<label for="request-query">Search requests<\/label>/);
    assert.match(html, /id="request-query"/); assert.match(html, /type="search"/);
    assert.match(html, /value="checkout"/); assert.match(html, /disabled=""/);
    assert.match(html, /aria-describedby="request-query-hint"/);
    assert.doesNotMatch(html, /appearance="/);
  }
});

async function searchHarness() {
  const source = await readFile(new URL("../src/components/arc/search-field/search-field.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const marker = (name: string) => Object.assign(() => null, { displayName: name });
  const primitives = { AnimatePresence: marker("AnimatePresence"), button: marker("motion.button"), Search: marker("Search"), X: marker("X") };
  const module = { exports: {} as { SearchField: RawForwardRef } };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return { ...React, useId: () => "generated-search", useRef: () => ({ current: null }) };
      if (specifier === "motion/react") return { AnimatePresence: primitives.AnimatePresence, motion: { button: primitives.button }, useReducedMotion: () => true };
      if (specifier === "lucide-react") return { Search: primitives.Search, X: primitives.X };
      if (specifier === "../lib/motion-tokens") return { motionTokens };
      if (specifier === "../../ui/workspace-input") return { WorkspaceInput };
      if (specifier === "../../ui/workspace-input-styles") return { workspaceInputShellClassName };
      if (specifier.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_target, name) => `search-${String(name)}` }) };
      throw new Error(`Unexpected SearchField dependency: ${specifier}`);
    },
  });
  return { render: module.exports.SearchField.render, primitives };
}

test("both search appearances forward refs, retain naming, update values and restore focus after clearing", async () => {
  const harness = await searchHarness();
  for (const appearance of ["default", "workspace"] as const) {
    for (const refKind of ["object", "callback"] as const) {
      const changes: string[] = [];
      let focusCount = 0;
      const objectRef = { current: null } as React.RefObject<HTMLInputElement | null>;
      let callbackNode: HTMLInputElement | null = null;
      const forwardedRef = refKind === "object" ? objectRef : (node: HTMLInputElement | null) => { callbackNode = node; };
      const nodes = elements(harness.render({ appearance, label: "Search logs", value: "trace id", onValueChange: (value: string) => changes.push(value), className: "caller-class" }, forwardedRef));
      const input = nodes.find((node) => node.type === "input" || node.type === WorkspaceInput)!;
      const label = nodes.find((node) => node.type === "label")!;
      assert.equal(input.props.id, label.props.htmlFor);
      assert.equal(input.props.className.includes("caller-class"), true);
      if (appearance === "workspace") {
        assert.equal(input.props.variant, "bare"); assert.equal(input.props.size, "compact");
      }
      const nativeInput = input.type === WorkspaceInput ? raw(WorkspaceInput, input.props, input.props.ref) : input;
      const fakeNode = { focus: () => { focusCount++; } } as HTMLInputElement;
      nativeInput.props.ref(fakeNode);
      assert.equal(refKind === "object" ? objectRef.current : callbackNode, fakeNode);
      nativeInput.props.onChange({ target: { value: "new query" } });
      const clear = nodes.find((node) => node.type === harness.primitives.button)!;
      assert.equal(clear.props.type, "button"); assert.equal(clear.props["aria-label"], "Clear search"); assert.equal(clear.props.tabIndex, 0);
      clear.props.onClick();
      assert.deepEqual(changes, ["new query", ""]); assert.equal(focusCount, 1);
      nativeInput.props.ref(null);
      assert.equal(refKind === "object" ? objectRef.current : callbackNode, null);
      const emptyNodes = elements(harness.render({ appearance, label: "Search logs", value: "", onValueChange() {} }, forwardedRef));
      assert.equal(emptyNodes.some((node) => node.type === harness.primitives.button), false, "empty search has no focusable hidden clear button");
      assert.ok(emptyNodes.some((node) => node.props.className === "search-clearSlot"), "clear slot stays reserved when empty");
    }
  }
});
