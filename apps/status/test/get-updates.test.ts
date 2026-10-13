import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Button } from "../../web/src/components/arc/button/button";
import { WorkspaceInput } from "../../web/src/components/ui/workspace-input";

// Shared controls resolve the dashboard's React runtime; use its matching server
// renderer while testing SSR instead of mixing workspace package installations.
const dashboardRequire = createRequire(new URL("../../web/package.json", import.meta.url));
const React = dashboardRequire("react") as typeof import("react");
const { renderToStaticMarkup } = dashboardRequire("react-dom/server") as typeof import("react-dom/server");
Object.assign(globalThis, { React });

const sourceUrl = new URL("../src/components/GetUpdates.tsx", import.meta.url);
const dashboardButton = "DashboardButton";
const dashboardInput = "WorkspaceInput";
const isButton = (element: Element) => element.type === "button" || element.type === dashboardButton;
const isEmailInput = (element: Element) => (element.type === "input" || element.type === dashboardInput) && element.props.name === "email";

interface Element {
  type: string;
  props: Record<string, any>;
}
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("type" in value)) return [];
  const element = value as Element;
  return [element, ...elements(element.props.children)];
}
function fixture(options: { subscribed?: boolean; submit?: (pageId: string, email: string, signal: AbortSignal) => Promise<void> } = {}) {
  const states: unknown[] = [];
  const refs: Array<{ current: any }> = [];
  const effects: Array<{ dependencies: unknown[]; cleanup?: () => void }> = [];
  const pendingEffects: Array<() => void> = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  let focused: string | null = null;
  let closeCount = 0;
  const body = { style: { overflow: "auto" } };
  const dialog = {
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; closeCount++; },
  };
  const focus = (name: string) => ({ focus() { focused = name; } });
  const trigger = focus("trigger");
  const email = { ...focus("email"), value: "person@example.test" };
  const done = focus("done");
  const runtime = {
    useState(initial: unknown) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (next: unknown) => { states[index] = next; }];
    },
    useRef(initial: unknown) {
      const index = refIndex++;
      refs[index] ??= { current: initial };
      return refs[index];
    },
    useId: () => "updates",
    useEffect(callback: () => undefined | (() => void), dependencies: unknown[]) {
      const index = effectIndex++;
      if (effects[index] && dependencies.every((value, position) => Object.is(value, effects[index].dependencies[position]))) return;
      pendingEffects.push(() => {
        effects[index]?.cleanup?.();
        effects[index] = { dependencies, cleanup: callback() ?? undefined };
      });
    },
  };
  const compiled = ts.transpileModule(readFileSync(sourceUrl, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} as { default: (props: Record<string, unknown>) => Element } };
  const jsx = (type: string, props: Record<string, unknown>) => ({ type, props });
  runInNewContext(compiled, {
    module, exports: module.exports, document: { body }, window: { setTimeout, clearTimeout }, AbortController, Error,
    require(specifier: string) {
      if (specifier === "react") return runtime;
      if (specifier === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (specifier === "motion/react") return { AnimatePresence: "AnimatePresence", motion: { div: "motion.div" }, useReducedMotion: () => false };
      if (specifier === "./subscription-client") return { submitSubscription: options.submit ?? (async () => {}) };
      if (specifier === "../../../web/src/components/arc/button/button") return { Button: dashboardButton };
      if (specifier === "../../../web/src/components/ui/workspace-input") return { WorkspaceInput: dashboardInput };
      if (specifier === "../../../web/src/components/ui/workspace-scope") return { workspaceScopeClassName: "workspace-scope" };
      throw new Error(`Unexpected import: ${specifier}`);
    },
  });
  const render = () => {
    stateIndex = refIndex = effectIndex = 0;
    const tree = module.exports.default({ pageId: "page", pageName: "Acme", subscribed: options.subscribed ?? false });
    for (const element of elements(tree)) {
      if (!element.props.ref) continue;
      if (element.type === "dialog") element.props.ref.current = dialog;
      else if (isEmailInput(element)) element.props.ref.current = email;
      else if (element.props.children === "Get updates") element.props.ref.current = trigger;
      else if (element.props.children === "Done") element.props.ref.current = done;
    }
    pendingEffects.splice(0).forEach((effect) => effect());
    return tree;
  };
  const find = (tree: Element, predicate: (element: Element) => boolean) => {
    const found = elements(tree).find(predicate);
    if (!found) throw new Error("Element not found");
    return found;
  };
  const button = (tree: Element, name: string) => find(tree, (element) => isButton(element) && (element.props.children === name || element.props["aria-label"] === name));
  return { render, find, button, dialog, body, focused: () => focused, closeCount: () => closeCount };
}

test("Get updates opens centered dialog with email focus and restores trigger after Escape or backdrop exit", () => {
  for (const method of ["escape", "backdrop"]) {
    const view = fixture();
    let tree = view.render();
    assert.equal(view.dialog.open, false);
    view.button(tree, "Get updates").props.onClick();
    tree = view.render();
    assert.equal(view.dialog.open, true);
    assert.equal(view.focused(), "email");
    assert.equal(view.body.style.overflow, "hidden");
    if (method === "escape") {
      let prevented = false;
      view.find(tree, (element) => element.type === "dialog").props.onCancel({ preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
    } else view.find(tree, (element) => typeof element.props.onPointerDown === "function").props.onPointerDown();
    tree = view.render();
    assert.equal(view.dialog.open, true, "native modal stays open until Motion finishes exiting");
    view.find(tree, (element) => element.type === "AnimatePresence").props.onExitComplete();
    assert.equal(view.dialog.open, false);
    assert.equal(view.focused(), "trigger");
    assert.equal(view.body.style.overflow, "auto");
  }
});

test("rapid close and reopen cannot let an old Motion exit callback close the reopened dialog", () => {
  const view = fixture();
  let tree = view.render();
  view.button(tree, "Get updates").props.onClick();
  tree = view.render();
  view.button(tree, "Close updates").props.onClick();
  tree = view.render();
  const oldExit = view.find(tree, (element) => element.type === "AnimatePresence").props.onExitComplete;
  view.button(tree, "Get updates").props.onClick();
  tree = view.render();
  oldExit();
  assert.equal(view.dialog.open, true);
  assert.equal(view.closeCount(), 0);
  assert.equal(view.button(tree, "Get updates").props["aria-expanded"], true);
  assert.equal(view.focused(), "email");
});

test("initial confirmation-success state opens accessibly and focuses Done", () => {
  const view = fixture({ subscribed: true });
  const tree = view.render();
  assert.equal(view.dialog.open, true);
  assert.equal(view.focused(), "done");
  assert.equal(view.find(tree, (element) => element.type === "h2").props.children, "Check your inbox");
  assert.equal(elements(tree).some((element) => element.type === "form"), false);
});

test("Get updates reuses the dashboard compact input, button variants and density scope", () => {
  const view = fixture();
  let tree = view.render();
  const trigger = view.button(tree, "Get updates");
  assert.equal(trigger.type, dashboardButton);
  assert.equal(trigger.props.variant, "secondary");
  assert.equal(trigger.props.size, "sm");
  trigger.props.onClick();
  tree = view.render();
  const email = view.find(tree, isEmailInput);
  assert.equal(email.type, dashboardInput);
  assert.equal(email.props.size, "compact");
  assert.equal(email.props.type, "email");
  assert.equal(email.props.required, true);
  assert.equal(email.props.autoComplete, "email");
  assert.match(email.props.className ?? "", /focus-visible:outline-none!/);
  const submit = view.button(tree, "Subscribe to updates");
  assert.equal(submit.type, dashboardButton);
  assert.equal(submit.props.variant ?? "primary", "primary");
  assert.equal(submit.props.size, "sm");
  assert.equal(submit.props.type, "submit");
  assert.equal(submit.props.loading, false);
  assert.ok(elements(tree).some((element) => String(element.props.className ?? "").includes("workspace-scope")));
  const close = view.button(tree, "Close updates");
  assert.equal(close.type, "button", "the close affordance stays icon-only instead of adopting a filled action button");
  assert.match(close.props.className, /border-0/);
  assert.match(close.props.className, /bg-transparent/);
  assert.match(close.props.className, /hover:bg-/);

  const confirmation = fixture({ subscribed: true });
  const done = confirmation.button(confirmation.render(), "Done");
  assert.equal(done.type, dashboardButton);
  assert.equal(done.props.variant ?? "primary", "primary");
  assert.equal(done.props.size, "sm");
  assert.equal(done.props.type, "button");
});

test("the actual dashboard components render compact native controls for public status pages", () => {
  const input = renderToStaticMarkup(React.createElement(WorkspaceInput, {
    size: "compact", type: "email", name: "email", required: true,
    "aria-invalid": true, "aria-describedby": "subscription-error",
    className: "focus-visible:outline-none!",
  }));
  assert.match(input, /^<input /);
  assert.match(input, /data-workspace-input="default"/);
  assert.match(input, /data-field-size="compact"/);
  assert.match(input, /data-\[field-size=compact\]:h-9/);
  assert.match(input, /bg-\[#0b0b0b\]/);
  assert.match(input, /aria-invalid:border-rose-400\/60/);
  assert.match(input, /aria-describedby="subscription-error"/);

  for (const variant of ["primary", "secondary"] as const) {
    const html = renderToStaticMarkup(React.createElement(Button, { variant, size: "sm", type: "button" }, "Dashboard action"));
    assert.match(html, /^<button /);
    assert.match(html, /min-h-8 px-3 text-\[13px\]/);
    assert.match(html, variant === "primary" ? /bg-zinc-50 text-zinc-950/ : /bg-zinc-900 text-zinc-50/);
    assert.match(html, /Dashboard action/);
  }
});

test("public status Tailwind scans the actual dashboard controls and density utilities", () => {
  const styles = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");
  for (const sharedSource of [
    "arc/button/button.tsx", "ui/workspace-input.tsx", "ui/workspace-input-styles.ts", "ui/workspace-scope.ts",
  ]) assert.ok(styles.includes(`@source "../../../web/src/components/${sharedSource}";`), `missing dashboard utility source: ${sharedSource}`);
  const source = readFileSync(sourceUrl, "utf8");
  assert.match(source, /import \{ Button \} from "\.\.\/\.\.\/\.\.\/web\/src\/components\/arc\/button\/button"/);
  assert.match(source, /import \{ WorkspaceInput \} from "\.\.\/\.\.\/\.\.\/web\/src\/components\/ui\/workspace-input"/);
  assert.doesNotMatch(source, /rounded-lg border border-\[#424149\]/, "the former custom subscription input style is not retained");
  assert.doesNotMatch(source, /min-h-\[42px\] w-full rounded-lg/, "the former custom subscription button style is not retained");
});

test("subscription submit is single-flight, guards dismissals, and focuses Done on success", async () => {
  let resolve: () => void = () => {};
  let requests = 0;
  const view = fixture({ submit: () => { requests++; return new Promise<void>((complete) => { resolve = complete; }); } });
  let tree = view.render();
  view.button(tree, "Get updates").props.onClick();
  tree = view.render();
  const event = { preventDefault() {}, currentTarget: { reportValidity: () => true } };
  const submit = view.find(tree, (element) => element.type === "form").props.onSubmit;
  const pending = submit(event);
  await submit(event);
  assert.equal(requests, 1);
  tree = view.render();
  assert.equal(view.button(tree, "Close updates").props.disabled, true);
  const sending = view.find(tree, (element) => isButton(element) && element.props.type === "submit");
  assert.equal(sending.type, dashboardButton);
  assert.equal(sending.props.loading, true);
  assert.notEqual(sending.props.disabled, true, "the dashboard loading state preserves keyboard focus while guarding another submission");
  assert.equal(view.focused(), "email", "shared controls keep opening focus intact during the request");
  view.find(tree, (element) => element.type === "dialog").props.onCancel({ preventDefault() {} });
  view.find(tree, (element) => typeof element.props.onPointerDown === "function").props.onPointerDown();
  assert.equal(view.button(view.render(), "Get updates").props["aria-expanded"], true);
  resolve();
  await pending;
  tree = view.render();
  assert.equal(view.focused(), "done");
  assert.equal(view.button(tree, "Close updates").props.disabled, false);
});

test("invalid email does not submit, and a failed request remains editable with inline feedback", async () => {
  let requests = 0;
  let submittedEmail = "";
  const view = fixture({ submit: async (pageId, email, signal) => {
    assert.equal(pageId, "page");
    assert.ok(signal instanceof AbortSignal);
    submittedEmail = email;
    requests++;
    throw new Error("Subscriptions are currently turned off.");
  } });
  let tree = view.render();
  view.button(tree, "Get updates").props.onClick();
  tree = view.render();
  const submit = view.find(tree, (element) => element.type === "form").props.onSubmit;
  await submit({ preventDefault() {}, currentTarget: { reportValidity: () => false } });
  assert.equal(requests, 0);
  await submit({ preventDefault() {}, currentTarget: { reportValidity: () => true } });
  tree = view.render();
  assert.equal(requests, 1);
  assert.equal(submittedEmail, "person@example.test", "the shared forwarded input ref still supplies the native field value");
  assert.equal(view.find(tree, (element) => element.props.role === "alert").props.children, "Subscriptions are currently turned off.");
  const email = view.find(tree, isEmailInput);
  assert.equal(email.props.disabled, false);
  assert.equal(email.props["aria-invalid"], true);
  assert.equal(email.props["aria-describedby"], "updates-error");
  assert.notEqual(view.button(tree, "Subscribe to updates").props.disabled, true);
  assert.equal(view.button(tree, "Subscribe to updates").props.loading, false);
  assert.equal(view.button(tree, "Get updates").props["aria-expanded"], true);
});
