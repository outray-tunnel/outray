import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import { motionTokens } from "../src/components/arc/lib/motion-tokens";

type Element = React.ReactElement<Record<string, any>>;

function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

/** Render the real shared Select without a page wrapper; only browser primitives and hooks are inert. */
async function renderSelect(overrides: Record<string, unknown> = {}) {
  const source = await readFile(new URL("../src/components/arc/select/select.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const cssImports: string[] = [];
  const primitives: Record<string, React.ComponentType<any>> = {};
  const primitive = (name: string) => primitives[name] ?? (primitives[name] = Object.assign(() => null, { displayName: name }));
  const module = { exports: {} as { Select: { render: (props: Record<string, any>, ref: null) => React.ReactNode } } };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return {
        ...React,
        useId: () => "signal-control",
        useState: (initial: any) => [typeof initial === "function" ? initial() : initial, () => undefined],
      };
      if (specifier === "@radix-ui/react-select") return new Proxy({}, { get: (_target, name) => primitive(String(name)) });
      if (specifier === "motion/react") return {
        AnimatePresence: primitive("AnimatePresence"), motion: { span: primitive("motion.span") }, useReducedMotion: () => false,
      };
      if (specifier === "lucide-react") return { Check: primitive("Check"), ChevronDown: primitive("ChevronDown"), ChevronUp: primitive("ChevronUp") };
      if (specifier === "../lib/motion-tokens") return { motionTokens };
      if (specifier.endsWith(".css")) {
        cssImports.push(specifier);
        return { __esModule: true, default: new Proxy({}, { get: (_target, name) => `arc-${String(name)}` }) };
      }
      throw new Error(`Unexpected Select dependency: ${specifier}`);
    },
  });
  const tree = module.exports.Select.render({
    label: "Signal", value: "requests", className: "caller-trigger", options: [
      { value: "requests", label: "Request errors" }, { value: "logs", label: "Log count" },
      { value: "unavailable", label: "Unavailable signal", disabled: true },
    ], ...overrides,
  }, null);
  return { tree, cssImports, primitives };
}

test("Select themes its own portaled menu without depending on an OutRay list page", async () => {
  const { tree, cssImports, primitives } = await renderSelect();
  const portal = elements(tree).find((element) => element.type === primitives.Portal);
  assert.ok(portal, "the floating menu remains a Radix portal");
  const content = elements(portal.props.children).find((element) => element.type === primitives.Content);
  assert.ok(content, "the portal renders Radix content");
  assert.ok(String(content.props.className).split(/\s+/).includes("outray-arc"), "portal content owns the scoped theme class");
  assert.ok(String(content.props.className).split(/\s+/).includes("arc-content"), "the menu keeps shared Select styling");
  assert.ok(cssImports.some((specifier) => specifier.endsWith("/outray-arc-theme.css")), "Select loads its portal's scoped theme");
  assert.equal(content.props.position, "popper");
  const trigger = elements(tree).find((element) => element.type === primitives.Trigger);
  assert.ok(trigger);
  assert.ok(String(trigger.props.className).includes("caller-trigger"), "caller trigger styling stays on the trigger");
  assert.ok(!String(content.props.className).includes("caller-trigger"));
  const items = elements(content.props.children).filter((element) => element.type === primitives.Item);
  assert.deepEqual(items.map((item) => item.props.value), ["requests", "logs", "unavailable"]);
  assert.equal(items[2].props.disabled, true, "disabled option semantics still belong to Radix");
});

test("decorated options retain plain typeahead labels, menu descriptions, selected icons, and field errors", async () => {
  const marker = React.createElement("span", { "data-stage-icon": "identified" });
  const { tree, primitives } = await renderSelect({
    id: "update-stage", value: "identified", description: "Public stage after publication", "aria-invalid": true,
    "aria-describedby": "stage-error", options: [{ value: "identified", label: "Identified", icon: marker, description: "We know the cause." }],
  });
  const nodes = elements(tree);
  const trigger = nodes.find((element) => element.type === primitives.Trigger);
  assert.ok(trigger);
  assert.equal(trigger.props.id, "update-stage");
  assert.equal(trigger.props["aria-invalid"], true);
  assert.equal(trigger.props["aria-describedby"], "update-stage-description stage-error");
  const option = nodes.find((element) => element.type === primitives.Item);
  assert.ok(option);
  assert.equal(option.props.textValue, "Identified");
  assert.ok(elements(option).some((element) => element.props["data-stage-icon"] === "identified"));
  assert.ok(elements(trigger).some((element) => element.props["data-stage-icon"] === "identified"));
  const itemText = elements(option).find((element) => element.type === primitives.ItemText);
  assert.equal(itemText?.props.children, "Identified", "descriptions never replace the announced selected value");
  assert.ok(elements(option).some((element) => element.props.children === "We know the cause."));
  const root = nodes.find((element) => element.type === primitives.Root);
  assert.ok(root);
  assert.equal(root.props["aria-invalid"], undefined, "field errors belong to the real trigger");
});

test("the scoped OutRay theme supplies distinct menu and hover colors plus Select tokens", async () => {
  const theme = await readFile(new URL("../src/components/outray-arc-theme.css", import.meta.url), "utf8");
  const scopedRule = theme.match(/\.outray-arc(?:,[^{]*)?\s*\{([^}]*)\}/)?.[1];
  assert.ok(scopedRule, "the token rule applies directly to the portal's OutRay class");
  const tokens = new Map([...scopedRule.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
  for (const token of [
    "--surface-raised", "--surface-muted", "--foreground", "--border", "--radius-control", "--shadow-floating",
    "--text-sm", "--text-muted", "--duration-standard", "--duration-instant", "--ease-enter", "--ease-standard",
  ]) assert.ok(tokens.get(token), `${token} is defined within the portal's own theme scope`);
  assert.notEqual(tokens.get("--surface-muted"), tokens.get("--surface-raised"), "hover feedback must differ from the menu surface");
});

test("enabled pointer hover complements Radix keyboard highlighting and keeps motion and disabled guards", async () => {
  const css = await readFile(new URL("../src/components/arc/select/select.module.css", import.meta.url), "utf8");
  assert.match(css, /\.item\[data-highlighted\]:not\(\[data-disabled\]\)\s*\{[^}]*background:\s*var\(--surface-muted\)/, "enabled keyboard highlight remains visible");
  const pointerMediaRules = [...css.matchAll(/@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{([^}]+)\}/g)].map((match) => match[1]);
  assert.ok(pointerMediaRules.some((rule) => /\.item(?=[^{]*:hover)(?=[^{]*:not\(\[data-disabled\]\))[^{}]*\{[^}]*background:\s*var\(--surface-muted\)/.test(rule)),
    "enabled options receive direct hover feedback only on hover-capable fine pointers");
  assert.match(css, /\.item\[data-disabled\]\s*\{[^}]*opacity:/, "disabled options retain their visual treatment");
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.item[^}]*transition:\s*none/, "reduced motion disables option transitions");
});
