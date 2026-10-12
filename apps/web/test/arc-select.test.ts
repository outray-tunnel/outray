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
      throw new Error(`Unexpected Select dependency: ${specifier}`);
    },
  });
  const tree = module.exports.Select.render({
    label: "Signal", value: "requests", className: "caller-trigger", options: [
      { value: "requests", label: "Request errors" }, { value: "logs", label: "Log count" },
      { value: "unavailable", label: "Unavailable signal", disabled: true },
    ], ...overrides,
  }, null);
  return { tree, primitives };
}

test("Select themes its own portaled menu without depending on an OutRay list page", async () => {
  const { tree, primitives } = await renderSelect();
  const portal = elements(tree).find((element) => element.type === primitives.Portal);
  assert.ok(portal, "the floating menu remains a Radix portal");
  const content = elements(portal.props.children).find((element) => element.type === primitives.Content);
  assert.ok(content, "the portal renders Radix content");
  assert.match(String(content.props.className), /bg-\[#111113\]/, "the portaled menu owns its surface styling");
  assert.match(String(content.props.className), /border-white\/12/);
  assert.match(String(content.props.className), /shadow-\[0_24px_70px_rgb\(0_0_0\/\.65\)\]/);
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

test("the portaled menu carries its own distinct surface, foreground, border, radius, and motion treatment", async () => {
  const { tree, primitives } = await renderSelect();
  const content = elements(tree).find((element) => element.type === primitives.Content);
  assert.ok(content);
  const classes = String(content.props.className);
  for (const utility of ["bg-[#111113]", "text-zinc-50", "border-white/12", "rounded-[14px]", "ease-out"]) {
    assert.ok(classes.split(/\s+/).includes(utility), `${utility} belongs to the portal itself`);
  }
  assert.match(classes, /data-\[state=open\]:duration-\[240ms\]/);
  assert.match(classes, /data-\[state=closed\]:duration-\[120ms\]/);
  assert.match(classes, /data-\[state=closed\]:opacity-0/);
  assert.match(classes, /motion-reduce:transition-none/);
});

test("enabled pointer hover complements Radix keyboard highlighting and keeps motion and disabled guards", async () => {
  const { tree, primitives } = await renderSelect();
  const item = elements(tree).find((element) => element.type === primitives.Item);
  assert.ok(item);
  const classes = String(item.props.className);
  assert.match(classes, /data-highlighted:bg-\[#202023\]/, "keyboard highlight remains visible");
  assert.match(classes, /hover:not-data-disabled:bg-\[#202023\]/, "pointer hover never styles disabled options");
  assert.match(classes, /data-disabled:opacity-45/, "disabled options retain their visual treatment");
  assert.match(classes, /motion-reduce:transition-none/, "reduced motion disables option transitions");
});
