import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  ActionMenu,
  type ActionMenuItem,
} from "../src/components/secrets/secrets-ui";
import MoreVerticalIcon from "@hugeicons-pro/core-stroke-rounded/MoreVerticalIcon";

Object.assign(globalThis, { React });

type Element = React.ReactElement<any>;
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function keyboard(key: string, shiftKey = false) {
  return {
    key,
    shiftKey,
    prevented: 0,
    stopped: 0,
    preventDefault() {
      this.prevented++;
    },
    stopPropagation() {
      this.stopped++;
    },
  };
}

async function menuController(compact = false, allDisabled = false) {
  const source = await readFile(
    new URL("../src/components/secrets/secrets-ui.tsx", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  const values: any[] = [];
  const refs: Array<{ current: any }> = [];
  const committed: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  let pending: Array<{
    index: number;
    deps: unknown[];
    run: () => void | (() => void);
  }> = [];
  let stateIndex = 0,
    refIndex = 0,
    effectIndex = 0;
  const listeners = new Map<string, Set<(event: any) => void>>();
  const selected: string[] = [];
  const selectionFocus: unknown[] = [];
  const document = {
    activeElement: null as unknown,
    addEventListener(type: string, callback: (event: any) => void) {
      const existing = listeners.get(type) ?? new Set();
      existing.add(callback);
      listeners.set(type, existing);
    },
    removeEventListener(type: string, callback: (event: any) => void) {
      listeners.get(type)?.delete(callback);
    },
  };
  function emit(type: string, target: unknown) {
    for (const callback of [...(listeners.get(type) ?? [])])
      callback({ target });
  }
  class FakeButton {
    focused = 0;
    constructor(
      public label: string,
      public disabled = false,
    ) {}
    focus() {
      this.focused++;
      document.activeElement = this;
      emit("focusin", this);
    }
  }
  const trigger = new FakeButton("trigger");
  const buttons = [
    new FakeButton("Edit", allDisabled),
    new FakeButton("Unavailable", true),
    new FakeButton("Delete", allDisabled),
  ];
  const menu = new FakeButton("menu");
  const outside = new FakeButton("outside");
  const root = {
    contains(target: unknown) {
      return (
        target === trigger ||
        target === menu ||
        buttons.includes(target as FakeButton)
      );
    },
    querySelector(selector: string) {
      assert.equal(selector, "button[aria-haspopup=menu]");
      return trigger;
    },
  };
  const item = (label: string, disabled = false): ActionMenuItem => ({
    label,
    icon: MoreVerticalIcon,
    disabled,
    danger: label === "Delete",
    onSelect: () => {
      selected.push(label);
      selectionFocus.push(document.activeElement);
    },
  });
  const props = {
    compact,
    label: "Actions for Payments",
    items: [
      item("Edit", allDisabled),
      item("Unavailable", true),
      item("Delete", allDisabled),
    ],
  };
  function ArcButton() {
    return null;
  }
  const module = { exports: {} as { ActionMenu: typeof ActionMenu } };
  runInNewContext(compiled, {
    React,
    module,
    exports: module.exports,
    document,
    require(specifier: string) {
      if (specifier === "react")
        return {
          ...React,
          useId: () => "action-menu-1",
          useState(initial: any) {
            const index = stateIndex++;
            if (!(index in values))
              values[index] =
                typeof initial === "function" ? initial() : initial;
            return [
              values[index],
              (next: any) => {
                values[index] =
                  typeof next === "function" ? next(values[index]) : next;
              },
            ];
          },
          useRef(initial: any) {
            const index = refIndex++;
            return refs[index] ?? (refs[index] = { current: initial });
          },
          useEffect(run: () => void | (() => void), deps: unknown[]) {
            const index = effectIndex++;
            if (
              !committed[index] ||
              deps.some(
                (value, slot) => !Object.is(value, committed[index].deps[slot]),
              )
            )
              pending.push({ index, deps, run });
          },
        };
      if (specifier === "react-dom") return { createPortal: () => null };
      if (specifier === "@hugeicons/react")
        return { HugeiconsIcon: () => null };
      if (specifier.startsWith("@hugeicons-pro/")) return [];
      if (specifier === "motion/react")
        return { AnimatePresence: () => null, motion: {} };
      if (specifier === "@/components/ui/select") return { Select: () => null };
      if (specifier === "@/components/arc/button/button")
        return { Button: ArcButton };
      if (specifier.endsWith(".css")) return {};
      throw new Error(`Unexpected action-menu dependency: ${specifier}`);
    },
  });
  function render() {
    stateIndex = 0;
    refIndex = 0;
    effectIndex = 0;
    pending = [];
    const tree = module.exports.ActionMenu(props);
    const nodes = elements(tree);
    (tree as Element).props.ref.current = root;
    const panel = nodes.find((node) => node.props.role === "menu");
    if (panel) panel.props.ref.current = menu;
    const actions = nodes.filter((node) => node.props.role === "menuitem");
    actions.forEach((node, index) => node.props.ref(buttons[index]));
    for (const effect of pending) {
      committed[effect.index]?.cleanup?.();
      const cleanup = effect.run();
      committed[effect.index] = {
        deps: effect.deps.slice(),
        cleanup: typeof cleanup === "function" ? cleanup : undefined,
      };
    }
    return {
      tree,
      nodes,
      panel,
      actions,
      trigger: nodes.find((node) => node.props["aria-haspopup"] === "menu")!,
    };
  }
  document.activeElement = trigger;
  return {
    render,
    props,
    ArcButton,
    buttons,
    trigger,
    menu,
    outside,
    document,
    selected,
    selectionFocus,
    emit,
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
    unmount() {
      for (const effect of committed) effect?.cleanup?.();
    },
  };
}

test("legacy actions keep their existing icon trigger while compact actions use the shared Arc ghost button", async () => {
  const legacy = await menuController();
  const first = legacy.render();
  assert.equal(typeof first.trigger.type, "function");
  assert.equal(
    (first.trigger.type as { name: string }).name,
    "SecretsIconButton",
  );
  assert.equal(first.trigger.props.tone, "quiet");
  assert.equal(first.trigger.props.label, "Actions for Payments");
  assert.equal(first.trigger.props["aria-expanded"], false);
  assert.equal(first.trigger.props["aria-controls"], undefined);
  assert.equal(first.panel, undefined);
  assert.equal(legacy.listenerCount("pointerdown"), 0);
  const compact = await menuController(true);
  const second = compact.render();
  assert.equal(second.trigger.type, compact.ArcButton);
  assert.equal(second.trigger.props.variant, "ghost");
  assert.equal(second.trigger.props.size, "sm");
  assert.equal(
    second.trigger.props.type,
    "button",
    "a compact row menu cannot submit its surrounding form",
  );
  assert.match(
    second.trigger.props.className,
    /!h-9 !min-h-9 !w-9 !min-w-9 !px-0/,
  );
  assert.equal(second.trigger.props["aria-label"], "Actions for Payments");
  const html = renderToStaticMarkup(
    React.createElement(ActionMenu, {
      compact: true,
      items: [],
      label: "Vault actions",
    }),
  );
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-label="Vault actions"/);
  assert.doesNotMatch(html, /role="menu"/);
});

test("opening focuses the first enabled item and establishes a labeled, absolutely positioned menu", async () => {
  const controller = await menuController();
  controller.render().trigger.props.onClick();
  const opened = controller.render();
  assert.equal(opened.trigger.props["aria-expanded"], true);
  assert.equal(opened.trigger.props["aria-controls"], opened.panel!.props.id);
  assert.equal(opened.panel!.props["aria-labelledby"], opened.trigger.props.id);
  assert.match(opened.panel!.props.className, /absolute right-0 top-full/);
  assert.equal(controller.document.activeElement, controller.buttons[0]);
  assert.equal(controller.listenerCount("pointerdown"), 1);
  assert.equal(controller.listenerCount("focusin"), 1);
  assert.ok(opened.actions.every((action) => action.props.tabIndex === -1));
  assert.equal(opened.actions[1].props.disabled, true);
  controller.unmount();
});

test("long action labels stay on one line in an intrinsic-width, viewport-bounded menu without a second focus ring", async () => {
  for (const compact of [false, true]) {
    const controller = await menuController(compact);
    controller.props.items[2].label = "Delete environment";
    controller.render().trigger.props.onClick();
    const opened = controller.render();
    assert.equal(opened.panel!.props["data-secrets-action-menu"], "");
    for (const token of ["w-max", "min-w-[200px]", "max-w-[calc(100vw-32px)]"])
      assert.ok(opened.panel!.props.className.split(" ").includes(token));
    for (const [index, action] of opened.actions.entries()) {
      assert.match(action.props.className, /\bmin-w-0\b/);
      assert.match(action.props.className, /\bwhitespace-nowrap\b/);
      assert.doesNotMatch(action.props.className, /focus(?:-visible)?:ring/);
      assert.equal(action.props.title, controller.props.items[index].label, "the full label remains available if a narrow viewport truncates it");
      const children = elements(action.props.children);
      const icon = children.find((child) => child.props["aria-hidden"] === "true");
      const label = children.find((child) => child.type === "span");
      assert.ok(icon); assert.match(icon.props.className, /\bshrink-0\b/);
      assert.ok(label); assert.match(label.props.className, /\bmin-w-0\b/); assert.match(label.props.className, /\btruncate\b/);
      assert.equal(label.props.children, controller.props.items[index].label);
    }
    assert.equal(controller.document.activeElement, controller.buttons[0], "the quieter treatment still exposes real keyboard focus");
    controller.unmount();
  }
});

test("the menu-only inset focus rule outranks the shared purple outline without changing other Arc controls", async () => {
  const css = await readFile(new URL("../src/components/outray-arc-theme.css", import.meta.url), "utf8");
  const genericSelector = ".outray-arc :is(button, input, summary):focus-visible";
  const scopedSelector = '.outray-arc [data-secrets-action-menu] button[role="menuitem"]:focus-visible';
  const genericStart = css.indexOf(genericSelector); const scopedStart = css.indexOf(scopedSelector);
  assert.ok(genericStart >= 0); assert.ok(scopedStart > genericStart, "the scoped override follows the shared control rule");
  const generic = css.slice(genericStart).match(/\{([^}]+)\}/)?.[1] ?? "";
  const scoped = css.slice(scopedStart).match(/\{([^}]+)\}/)?.[1] ?? "";
  assert.match(generic, /outline:\s*2px solid #8367c7/);
  assert.match(scoped, /outline:\s*0\s*;/); assert.match(scoped, /outline-offset:\s*0\s*;/);
  assert.match(scoped, /box-shadow:\s*inset 0 0 0 1px rgb\(255 255 255 \/ 18%\)/);
  assert.doesNotMatch(scoped, /#8367c7|var\(--focus-ring\)/);
  // All :is() arguments in this particular shared rule are type selectors, so
  // expanding to button preserves its specificity before counting simple terms.
  function simpleSpecificity(selector: string) {
    const ids = selector.match(/#[\w-]+/g) ?? [];
    const attributes = selector.match(/\[[^\]]+\]/g) ?? [];
    const bare = selector.replace(/\[[^\]]+\]/g, " ");
    const classes = bare.match(/\.[\w-]+/g) ?? []; const pseudoClasses = bare.match(/:[\w-]+/g) ?? [];
    const types = bare.replace(/#[\w-]+|\.[\w-]+|:[\w-]+/g, " ").match(/[a-z][\w-]*/gi) ?? [];
    return [ids.length, attributes.length + classes.length + pseudoClasses.length, types.length];
  }
  const sharedSpecificity = simpleSpecificity(genericSelector.replace(":is(button, input, summary)", "button"));
  const menuSpecificity = simpleSpecificity(scopedSelector);
  assert.deepEqual(sharedSpecificity, [0, 2, 1]); assert.deepEqual(menuSpecificity, [0, 4, 1]);
  assert.ok(menuSpecificity[1] > sharedSpecificity[1], "outline-none alone cannot beat the unlayered shared selector; this hook can");
});

test("ArrowUp opens on the last enabled action and ArrowDown opens on the first", async () => {
  for (const [key, expected] of [
    ["ArrowUp", 2],
    ["ArrowDown", 0],
  ] as const) {
    const controller = await menuController();
    const event = keyboard(key);
    controller.render().trigger.props.onKeyDown(event);
    assert.equal(event.prevented, 1);
    assert.equal(event.stopped, 1);
    controller.render();
    assert.equal(
      controller.document.activeElement,
      controller.buttons[expected],
    );
    controller.unmount();
  }
});

test("closing through the trigger restores focus even if pointer activation did not focus that button", async () => {
  const controller = await menuController(true);
  controller.render().trigger.props.onClick();
  const opened = controller.render();
  assert.equal(controller.document.activeElement, controller.buttons[0]);
  opened.trigger.props.onClick();
  assert.equal(controller.document.activeElement, controller.trigger);
  assert.equal(controller.render().panel, undefined);
});

test("menu arrow keys loop around disabled actions while Home and End inspect the boundaries", async () => {
  const controller = await menuController();
  controller.render().trigger.props.onClick();
  const opened = controller.render();
  const panel = opened.panel!;
  for (const [key, expected] of [
    ["ArrowDown", 2],
    ["ArrowDown", 0],
    ["ArrowUp", 2],
    ["Home", 0],
    ["End", 2],
  ] as const) {
    const event = keyboard(key);
    panel.props.onKeyDown(event);
    assert.equal(
      controller.document.activeElement,
      controller.buttons[expected],
    );
    assert.equal(event.prevented, 1);
    assert.equal(event.stopped, 1);
  }
  assert.equal(controller.buttons[1].focused, 0);
  controller.unmount();
});

test("Escape closes and returns focus without dismissing an enclosing dialog", async () => {
  const controller = await menuController();
  controller.render().trigger.props.onClick();
  const event = keyboard("Escape");
  controller.render().panel!.props.onKeyDown(event);
  assert.equal(event.prevented, 1);
  assert.equal(event.stopped, 1);
  assert.equal(controller.document.activeElement, controller.trigger);
  const closed = controller.render();
  assert.equal(closed.panel, undefined);
  assert.equal(controller.listenerCount("pointerdown"), 0);
  assert.equal(controller.listenerCount("focusin"), 0);
});

test("Tab and Shift+Tab close the menu but preserve the browser's native focus navigation", async () => {
  for (const shift of [false, true]) {
    const controller = await menuController();
    controller.render().trigger.props.onClick();
    const event = keyboard("Tab", shift);
    controller.render().panel!.props.onKeyDown(event);
    assert.equal(event.prevented, 0, "native Tab action is not intercepted");
    assert.equal(event.stopped, 0);
    assert.equal(
      controller.document.activeElement,
      controller.trigger,
      "anchor is restored before the focused menu node is removed",
    );
    assert.equal(controller.render().panel, undefined);
  }
});

test("selecting an action focuses the persistent trigger before handing off to a dialog", async () => {
  const controller = await menuController(true);
  controller.render().trigger.props.onClick();
  const opened = controller.render();
  opened.actions[1].props.onClick();
  assert.deepEqual(controller.selected, []);
  assert.ok(
    controller.render().panel,
    "disabled actions cannot dismiss the menu or mutate data",
  );
  opened.actions[2].props.onClick();
  assert.deepEqual(controller.selected, ["Delete"]);
  assert.equal(controller.selectionFocus[0], controller.trigger);
  assert.equal(controller.render().panel, undefined);
});

test("pointer and focus exits close without moving focus back, while events inside keep the menu open", async () => {
  for (const type of ["pointerdown", "focusin"]) {
    const controller = await menuController();
    controller.render().trigger.props.onClick();
    controller.render();
    controller.emit(type, controller.buttons[2]);
    assert.ok(controller.render().panel);
    const before = controller.trigger.focused;
    controller.document.activeElement = controller.outside;
    controller.emit(type, controller.outside);
    assert.equal(controller.render().panel, undefined);
    assert.equal(controller.document.activeElement, controller.outside);
    assert.equal(controller.trigger.focused, before);
  }
});

test("a menu with no enabled actions can still receive Escape and clean up outside listeners", async () => {
  const controller = await menuController(false, true);
  controller.render().trigger.props.onClick();
  const opened = controller.render();
  assert.equal(controller.document.activeElement, controller.menu);
  opened.panel!.props.onKeyDown(keyboard("ArrowDown"));
  assert.equal(controller.document.activeElement, controller.menu);
  controller.unmount();
  assert.equal(controller.listenerCount("pointerdown"), 0);
  assert.equal(controller.listenerCount("focusin"), 0);
});
