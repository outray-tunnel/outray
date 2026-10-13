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

/** Execute the real shared dialog; only hooks, Motion, and browser primitives are isolated. */
async function dialogHarness() {
  const source = await readFile(new URL("../src/components/arc/dialog/dialog.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const primitive = (name: string) => Object.assign(() => null, { displayName: name });
  const radix = Object.fromEntries(["Root", "Portal", "Overlay", "Content", "Title", "Description", "Close", "Trigger"].map((name) => [name, primitive(name)]));
  const motion = { div: primitive("motion.div"), span: primitive("motion.span"), button: primitive("motion.button") };
  const AnimatePresence = primitive("AnimatePresence");
  let open: boolean | null = true, reduced = false, now = 100;
  let uncontrolled: boolean | undefined;
  let refCursor = 0, effectCursor = 0;
  const refs: Array<{ current: any }> = [];
  const effectDeps: unknown[][] = [];
  let pendingEffects: Array<() => void> = [];
  const module = { exports: {} as typeof import("../src/components/arc/dialog/dialog") };
  runInNewContext(compiled, {
    React, module, exports: module.exports, performance: { now: () => now },
    require(specifier: string) {
      if (specifier === "react") return {
        ...React, useContext: () => open, useCallback: (callback: unknown) => callback,
        useState(initial: boolean) {
          uncontrolled ??= initial;
          return [uncontrolled, (next: boolean) => { uncontrolled = next; }];
        },
        useRef(initial: unknown) { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }); },
        useLayoutEffect(effect: () => void, deps: unknown[]) {
          const index = effectCursor++;
          if (!effectDeps[index] || deps.some((value, slot) => !Object.is(value, effectDeps[index][slot]))) {
            pendingEffects.push(effect);
            effectDeps[index] = deps;
          }
        },
      };
      if (specifier === "@radix-ui/react-dialog") return radix;
      if (specifier === "motion/react") return { AnimatePresence, motion, useReducedMotion: () => reduced };
      if (specifier === "lucide-react") return { X: primitive("X") };
      if (specifier === "../lib/motion-tokens") return { motionTokens };
      throw new Error(`Unexpected dialog import: ${specifier}`);
    },
  });
  return {
    radix, motion, AnimatePresence,
    root(props: React.ComponentProps<typeof module.exports.Dialog>) { return module.exports.Dialog(props) as Element; },
    render(nextOpen: boolean | null, options: { reduced?: boolean; now?: number; props?: Partial<React.ComponentProps<typeof module.exports.DialogContent>> } = {}) {
      open = nextOpen; reduced = options.reduced ?? false; now = options.now ?? now;
      refCursor = 0; effectCursor = 0; pendingEffects = [];
      const tree = module.exports.DialogContent({ title: "Create tunnel", description: "Expose a local server.", children: React.createElement("input", { name: "port" }), ...options.props });
      for (const effect of pendingEffects) effect();
      return { tree, nodes: elements(tree) };
    },
  };
}

function classes(node: Element) { return String(node.props.className).split(/\s+/); }

function assertMotionSurface(node: Element) {
  const utilities = classes(node);
  assert.ok(!utilities.some((utility) => /(?:^|:)(?:transition(?:-|$)|duration-|ease-|opacity-|scale-|animate-)/.test(utility)), "CSS cannot animate a Motion surface again");
  assert.ok(!utilities.some((utility) => utility.startsWith("starting:")), "starting-style cannot restart a Motion entrance");
  assert.ok(utilities.includes("data-[state=closed]:pointer-events-none!"), "exiting surfaces cannot intercept presses");
}

function assertQuickTween(node: Element, minEnter: number, maxEnter: number) {
  assert.equal(node.props.transition.type, "tween", "entrance has a bounded duration, not a settling spring");
  assert.ok(node.props.transition.duration >= minEnter && node.props.transition.duration <= maxEnter, "entrance remains snappy");
  assert.equal(node.props.exit.transition.type, "tween");
  assert.ok(node.props.exit.transition.duration >= .12 && node.props.exit.transition.duration <= .14, "exit is shorter than entrance");
}

test("Motion alone owns shared dialog transforms and opacity, without Tailwind transition lag or double transforms", async () => {
  const harness = await dialogHarness();
  const { nodes } = harness.render(true);
  const animated = nodes.filter((node) => node.type === harness.motion.div);
  assert.equal(animated.length, 2, "the backdrop and content each have one Motion surface");
  for (const node of animated) assertMotionSurface(node);
  const panel = animated[1];
  assert.equal(panel.props.initial.opacity, 0);
  assert.ok(panel.props.initial.y > 0 && panel.props.initial.y <= 8, "entrance is a small rise, not a travel animation");
  assert.equal(panel.props.animate.opacity, 1);
  assert.equal(panel.props.animate.y, 0);
  assert.equal(panel.props.exit.opacity, 0);
  assertQuickTween(panel, .16, .18);
});

test("shared root mirrors controlled and uncontrolled state without dropping Radix change callbacks", async () => {
  const uncontrolled = await dialogHarness();
  const calls: boolean[] = [];
  const props = { defaultOpen: true, onOpenChange: (open: boolean) => calls.push(open) };
  let tree = uncontrolled.root(props);
  assert.equal(tree.props.value, true);
  (tree.props.children as Element).props.onOpenChange(false);
  tree = uncontrolled.root(props);
  assert.equal(tree.props.value, false);
  assert.equal((tree.props.children as Element).props.open, false);
  const controlled = await dialogHarness();
  tree = controlled.root({ open: true, onOpenChange: (open) => calls.push(open) });
  (tree.props.children as Element).props.onOpenChange(false);
  assert.equal(controlled.root({ open: true }).props.value, true, "controlled state belongs to the caller");
  assert.deepEqual(calls, [false, false]);
});

test("reduced motion keeps shared dialogs visible without movement and preserves portal semantics", async () => {
  const harness = await dialogHarness();
  const { nodes } = harness.render(true, { reduced: true });
  const animated = nodes.filter((node) => node.type === harness.motion.div);
  for (const node of animated) {
    for (const state of [node.props.initial, node.props.animate, node.props.exit]) {
      if (state !== false) {
        assert.ok(state.y === undefined || state.y === 0, "reduced motion never moves the dialog");
        assert.ok(state.scale === undefined || state.scale === 1, "reduced motion never resizes the dialog");
      }
    }
    assert.equal(node.props.transition.duration, 0, "reduced motion is immediate, not a short fade");
    assert.equal(node.props.exit.transition.duration, 0);
  }
  for (const primitive of [harness.radix.Portal, harness.radix.Overlay, harness.radix.Content]) {
    assert.equal(nodes.find((node) => node.type === primitive)?.props.forceMount, true, "AnimatePresence owns the mounted exit lifetime");
  }
});

test("rapid close/reopen ignores stale outside presses, while current presses and caller guards still work", async () => {
  const harness = await dialogHarness();
  let called = 0;
  const handler = () => { called++; };
  const outside = (timeStamp: number) => ({ detail: { originalEvent: { timeStamp } }, prevented: false, preventDefault() { this.prevented = true; } });
  const press = (nodes: Element[], timeStamp: number) => {
    const event = outside(timeStamp);
    nodes.find((node) => node.type === harness.radix.Content)!.props.onPointerDownOutside(event);
    return event;
  };
  const first = harness.render(true, { now: 100, props: { onPointerDownOutside: handler } });
  assert.equal(press(first.nodes, 110).prevented, false);
  const closed = harness.render(false, { now: 120 });
  assert.equal(closed.tree.type, harness.AnimatePresence);
  assert.equal(closed.nodes.some((node) => node.type === harness.radix.Portal), false, "Presence gets the removal signal rather than an abruptly unmounted wrapper");
  assert.equal(press(first.nodes, 125).prevented, true, "a still-mounted exiting surface cannot dismiss anything again");
  const reopened = harness.render(true, { now: 150, props: { onPointerDownOutside: handler } });
  assert.equal(press(reopened.nodes, 145).prevented, true, "the press that reopened the dialog cannot immediately close it");
  assert.equal(press(reopened.nodes, 155).prevented, false);
  const guarded = harness.render(true, { props: { onPointerDownOutside: (event) => event.preventDefault() } });
  assert.equal(press(guarded.nodes, 160).prevented, true);
  assert.equal(called, 4, "caller handlers still receive stale and current events");
});

test("shared dialog preserves caller sizing, focus callbacks, dismissal guards, and accessible header", async () => {
  const harness = await dialogHarness();
  const onEscapeKeyDown = () => {}, onCloseAutoFocus = () => {};
  const { nodes } = harness.render(true, { props: {
    className: "caller-panel", overlayClassName: "caller-overlay", closeDisabled: true,
    onEscapeKeyDown, onCloseAutoFocus, "aria-busy": true,
  } });
  const content = nodes.find((node) => node.type === harness.radix.Content)!;
  assert.equal(content.props.onEscapeKeyDown, onEscapeKeyDown);
  assert.equal(content.props.onCloseAutoFocus, onCloseAutoFocus);
  assert.equal(content.props["aria-busy"], true);
  const animated = nodes.filter((node) => node.type === harness.motion.div);
  assert.ok(classes(animated[0]).includes("caller-overlay"));
  assert.ok(classes(animated[1]).includes("caller-panel"));
  assert.equal(nodes.filter((node) => node.type === harness.radix.Title).length, 1);
  assert.equal(nodes.filter((node) => node.type === harness.radix.Description).length, 1);
  assert.equal(nodes.find((node) => node.type === harness.radix.Close)?.props.disabled, true);
});

test("shared close-button press feedback is Motion-driven and disabled for reduced motion", async () => {
  const harness = await dialogHarness();
  const normal = harness.render(true).nodes.find((node) => node.type === harness.motion.button)!;
  assert.equal(normal.props.whileTap.scale, .96);
  assert.ok(!classes(normal).some((utility) => /(?:^|:)(?:transition-|duration-|scale-|animate-)/.test(utility)));
  const reduced = harness.render(true, { reduced: true }).nodes.find((node) => node.type === harness.motion.button)!;
  assert.equal(reduced.props.whileTap, undefined);
  assert.equal(reduced.props.transition.duration, 0);
});

test("shared dialog requires its state-owning root instead of silently falling back to CSS", async () => {
  const harness = await dialogHarness();
  assert.throws(() => harness.render(null), /DialogContent.*Dialog|Dialog.*DialogContent/);
  const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /--animate-(?:dialog|workspace-dialog|workspace-overlay|agent-panel|agent-overlay)-|@keyframes\s+(?:dialog|workspace-dialog|workspace-overlay|agent-panel|agent-overlay)-/, "modal keyframes are gone, not merely unused");
});

async function workspaceHarness() {
  const source = await readFile(new URL("../src/components/workspace/workspace-ui.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const primitive = () => null;
  const radix = Object.fromEntries(["Root", "Portal", "Overlay", "Content", "Title", "Description", "Close"].map((name) => [name, Object.assign(() => null, { displayName: name })]));
  const motion = { div: Object.assign(() => null, { displayName: "motion.div" }) };
  const AnimatePresence = Object.assign(() => null, { displayName: "AnimatePresence" });
  let reduced = false;
  const module = { exports: {} as typeof import("../src/components/workspace/workspace-ui") };
  runInNewContext(compiled, { React, module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "react") return { ...React, useRef: (initial: unknown) => ({ current: initial }) };
      if (specifier === "@radix-ui/react-dialog") return radix;
      if (specifier === "motion/react") return { motion, AnimatePresence, useReducedMotion: () => reduced };
      if (specifier === "lucide-react") return { AlertCircle: primitive, CheckCircle2: primitive, Info: primitive, X: primitive };
      if (specifier === "../arc/button/button") return { Button: primitive };
      if (specifier === "../ui/workspace-scope") return { workspaceScopeClassName: "workspace-scope" };
      if (specifier === "./workspace-dialog-focus") return { workspaceFocusTarget: () => null };
      throw new Error(`Unexpected workspace dialog import: ${specifier}`);
    },
  });
  return { radix, motion, AnimatePresence,
    render(props: React.ComponentProps<typeof module.exports.WorkspaceDialog>, reduce = false) {
      reduced = reduce;
      const tree = module.exports.WorkspaceDialog(props) as Element;
      return { tree, nodes: elements(tree) };
    },
  };
}

test("workspace dialog gives Motion the sole entrance and exit while retaining centering and busy guards", async () => {
  const harness = await workspaceHarness();
  let closed = 0;
  const props = { open: true, title: "Create token", busy: true, onClose: () => { closed++; }, children: React.createElement("input") };
  const { tree, nodes } = harness.render(props);
  const animated = nodes.filter((node) => node.type === harness.motion.div);
  assert.equal(animated.length, 2);
  assert.ok(classes(animated[1]).includes("-translate-1/2"), "static centering stays independent from Motion's small rise");
  for (const surface of animated) assertMotionSurface(surface);
  assertQuickTween(animated[1], .16, .18);
  for (const primitive of [harness.radix.Portal, harness.radix.Overlay, harness.radix.Content]) {
    assert.equal(nodes.find((node) => node.type === primitive)!.props.forceMount, true, "Radix cannot interrupt Motion's exit lifetime");
  }
  const panel = nodes.find((node) => node.type === harness.radix.Content)!;
  tree.props.onOpenChange(false);
  assert.equal(closed, 0, "busy dialog still blocks dismissal");
  for (const callback of ["onEscapeKeyDown", "onPointerDownOutside"]) {
    let prevented = false;
    panel.props[callback]({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
  const afterClose = harness.render({ ...props, open: false });
  assert.equal(afterClose.nodes.filter((node) => node.type === harness.AnimatePresence).length, 1, "Presence remains mounted when its portal leaves");
  assert.equal(afterClose.nodes.some((node) => node.type === harness.radix.Portal), false, "closing gives Presence a removal signal");
  const idle = harness.render({ ...props, busy: false });
  idle.tree.props.onOpenChange(false);
  assert.equal(closed, 1, "ordinary dismissal still reaches the caller");
});

test("workspace reduced motion is immediate without moving or resizing the content", async () => {
  const harness = await workspaceHarness();
  const { nodes } = harness.render({ open: true, title: "Invite member", onClose() {}, children: React.createElement("input") }, true);
  const animated = nodes.filter((node) => node.type === harness.motion.div);
  assert.equal(animated.length, 2);
  for (const surface of animated) {
    assert.equal(surface.props.transition.duration, 0);
    assert.equal(surface.props.exit.transition.duration, 0);
    for (const state of [surface.props.initial, surface.props.animate, surface.props.exit]) {
      if (state !== false) {
        assert.ok(state.y === undefined || state.y === 0);
        assert.ok(state.scale === undefined || state.scale === 1);
      }
    }
    assertMotionSurface(surface);
  }
});

test("legacy modal also uses short Motion-only tweens, including immediate reduced-motion dismissal", async () => {
  const source = await readFile(new URL("../src/components/ui/modal.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const primitive = () => null;
  const motion = { div: primitive };
  const AnimatePresence = Object.assign(() => null, { displayName: "AnimatePresence" });
  let reduced = false;
  const module = { exports: {} as typeof import("../src/components/ui/modal") };
  runInNewContext(compiled, { React, module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "react") return React;
      if (specifier === "motion/react") return { motion, AnimatePresence, useReducedMotion: () => reduced };
      if (specifier === "lucide-react") return { X: primitive };
      if (specifier === "./icon-button") return { IconButton: primitive };
      throw new Error(`Unexpected legacy modal import: ${specifier}`);
    },
  });
  let dismissed = 0;
  const props = { isOpen: true, onClose() { dismissed++; }, children: React.createElement("input"), size: "lg" as const };
  const render = () => elements(module.exports.Modal(props));
  const animated = render().filter((node) => node.type === motion.div);
  assert.equal(animated.length, 2);
  for (const surface of animated) {
    assertQuickTween(surface, .16, .18);
    assert.ok(!classes(surface).some((utility) => /(?:^|:)(?:transition-|duration-|animate-|scale-|opacity-)/.test(utility)));
  }
  animated[0].props.onClick();
  assert.equal(dismissed, 1, "backdrop dismissal still reaches the caller");
  assert.ok(classes(animated[1]).includes("max-w-lg"), "caller sizing is retained");
  const closed = module.exports.Modal({ ...props, isOpen: false }) as Element;
  assert.equal(closed.type, AnimatePresence);
  assert.equal(elements(closed).some((node) => node.type === motion.div), false, "Presence sees the exit removal signal");
  reduced = true;
  for (const surface of render().filter((node) => node.type === motion.div)) {
    assert.equal(surface.props.initial, false);
    assert.equal(surface.props.transition.duration, 0);
    assert.equal(surface.props.exit.transition.duration, 0);
    assert.ok(surface.props.exit.y === undefined || surface.props.exit.y === 0);
  }
});
