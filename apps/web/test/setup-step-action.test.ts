import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";

const steps = [{ id: "01", title: "Store" }, { id: "02", title: "Install" }, { id: "03", title: "Connect" }];
type NextAction = { step: string; form: string; onNext: () => boolean | Promise<boolean>; disabled?: boolean; loading?: boolean };
type Element = React.ReactElement<any>;

function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Exercise the real navigation handlers while keeping React's hook state across renders. */
async function loadFlow(options: { nextAction?: NextAction; onRecheck?: () => void } = {}) {
  const source = await readFile(new URL("../src/components/onboarding/setup-ui.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const hooks: any[] = [];
  let index = 0;
  const Button = (props: any) => React.createElement("button", props);
  const module = { exports: {} as { SetupFlow: (props: any) => Element } };
  runInNewContext(compiled, {
    React, Promise, Error, exports: module.exports, module,
    require: (specifier: string) => {
      if (specifier === "react") return {
        createContext: React.createContext,
        useContext: React.useContext,
        useId: () => "setup-test",
        useState: (initial: any) => {
          const slot = index++;
          if (!(slot in hooks)) hooks[slot] = typeof initial === "function" ? initial() : initial;
          return [hooks[slot], (next: any) => { hooks[slot] = typeof next === "function" ? next(hooks[slot]) : next; }];
        },
        useRef: (initial: any) => {
          const slot = index++;
          if (!(slot in hooks)) hooks[slot] = { current: initial };
          return hooks[slot];
        },
      };
      if (specifier === "lucide-react") return Object.fromEntries(["ArrowLeft", "ArrowRight", "RefreshCw", "Terminal"].map((name) => [name, () => null]));
      if (specifier === "motion/react") return { LayoutGroup: (props: any) => props.children, motion: { span: "span" }, useReducedMotion: () => false };
      if (specifier === "../arc/button/button") return { Button };
      if (specifier === "../arc/copy-button/copy-button") return { CopyButton: () => null };
      throw new Error(`Unexpected import ${specifier}`);
    },
  });
  const render = (overrides: typeof options = {}) => {
    index = 0;
    return module.exports.SetupFlow({ steps, children: "Mounted setup forms", ...options, ...overrides });
  };
  return {
    render,
    active: () => render().props.value.activeId,
    tabs: (tree = render()) => elements(tree).filter((element) => element.props.role === "tab"),
    next: (tree = render()) => elements(tree).filter((element) => element.type === Button).at(-1)!,
    back: (tree = render()) => elements(tree).find((element) => element.type === Button)!,
    submit: (tree = render(), form = options.nextAction?.form ?? "secrets-form") => {
      let prevented = false;
      const section = elements(tree).find((element) => element.type === "section")!;
      section.props.onSubmit({ target: { id: form }, preventDefault: () => { prevented = true; } });
      return prevented;
    },
  };
}

test("the action's Next step submits its form and waits for saving before advancing", async () => {
  const save = deferred<boolean>();
  let calls = 0;
  const flow = await loadFlow({ nextAction: { step: "01", form: "secret-values", onNext: () => { calls++; return save.promise; } } });
  const next = flow.next();
  assert.equal(next.props.type, "submit");
  assert.equal(next.props.form, "secret-values");
  assert.equal(next.props.onClick, undefined, "the browser submits the form once, without an extra click mutation");
  assert.equal(flow.submit(), true);
  assert.equal(calls, 1);
  assert.equal(flow.active(), "01");
  assert.equal(flow.next().props.loading, true);
  assert.equal(flow.back().props.disabled, true);
  for (const tab of flow.tabs()) assert.equal(tab.props.disabled, true);
  save.resolve(true);
  await flush();
  assert.equal(flow.active(), "02");
  assert.equal(Boolean(flow.next().props.loading), false);
  assert.equal(Boolean(flow.back().props.disabled), false);
  for (const tab of flow.tabs()) assert.equal(Boolean(tab.props.disabled), false);
  assert.notEqual(flow.next().props.type, "submit", "the form action belongs only to its own step");
  assert.equal(flow.next().props.form, undefined);
});

test("rejected and unsuccessful saves keep the same step and unlock navigation for retry", async () => {
  for (const failure of ["false", "reject", "throw"] as const) {
    const save = deferred<boolean>();
    let calls = 0;
    const flow = await loadFlow({ nextAction: { step: "01", form: "secret-values", onNext: () => {
      calls++;
      if (calls > 1) return true;
      if (failure === "throw") throw new Error("Save failed");
      return save.promise;
    } } });
    flow.submit();
    if (failure === "false") save.resolve(false);
    if (failure === "reject") save.reject(new Error("Save failed"));
    await flush();
    assert.equal(flow.active(), "01");
    assert.equal(Boolean(flow.next().props.loading), false);
    for (const tab of flow.tabs()) assert.equal(Boolean(tab.props.disabled), false);
    flow.submit();
    await flush();
    assert.equal(calls, 2);
    assert.equal(flow.active(), "02");
  }
});

test("pending saves de-duplicate form submission and reject navigation from stale handlers", async () => {
  const save = deferred<boolean>();
  let calls = 0;
  const flow = await loadFlow({ nextAction: { step: "02", form: "secret-values", onNext: () => { calls++; return save.promise; } } });
  flow.tabs()[1].props.onClick();
  await flush();
  const beforeSaving = flow.render();
  assert.equal(flow.active(), "02");
  flow.submit(beforeSaving);
  flow.submit(beforeSaving);
  flow.back(beforeSaving).props.onClick();
  flow.tabs(beforeSaving)[2].props.onClick();
  flow.tabs(beforeSaving)[0].props.onClick();
  await flush();
  assert.equal(calls, 1);
  assert.equal(flow.active(), "02");
  save.resolve(true);
  await flush();
  assert.equal(flow.active(), "03");
});

test("forward tab and keyboard navigation save first and move only after success", async () => {
  for (const navigation of ["tab", "keyboard"] as const) {
    const save = deferred<boolean>();
    let calls = 0;
    let focused = false;
    const flow = await loadFlow({ nextAction: { step: "01", form: "secret-values", onNext: () => { calls++; return save.promise; } } });
    const tabs = flow.tabs();
    tabs[2].props.ref({ focus: () => { focused = true; } });
    if (navigation === "tab") tabs[2].props.onClick();
    else {
      let prevented = false;
      tabs[0].props.onKeyDown({ key: "End", preventDefault: () => { prevented = true; } });
      assert.equal(prevented, true);
      assert.equal(focused, false);
    }
    assert.equal(calls, 1);
    assert.equal(flow.active(), "01");
    save.resolve(true);
    await flush();
    assert.equal(flow.active(), "03");
    if (navigation === "keyboard") assert.equal(focused, true);
  }
});

test("an invalid or externally pending action cannot advance or submit", async () => {
  for (const condition of [{ disabled: true }, { loading: true }]) {
    let calls = 0;
    const flow = await loadFlow({ nextAction: { step: "01", form: "secret-values", onNext: () => { calls++; return true; }, ...condition } });
    assert.equal(Boolean(flow.next().props.disabled || flow.next().props.loading), true);
    flow.submit();
    flow.tabs()[2].props.onClick();
    flow.tabs()[0].props.onKeyDown({ key: "ArrowRight", preventDefault: () => {} });
    await flush();
    assert.equal(calls, 0);
    assert.equal(flow.active(), "01");
  }
});

test("backward navigation never saves, and unrelated form submissions are not intercepted", async () => {
  let calls = 0;
  const flow = await loadFlow({ nextAction: { step: "02", form: "secret-values", onNext: () => { calls++; return true; } } });
  flow.tabs()[1].props.onClick();
  await flush();
  assert.equal(flow.submit(flow.render(), "create-vault"), false);
  assert.equal(flow.active(), "02");
  flow.back().props.onClick();
  await flush();
  assert.equal(flow.active(), "01");
  flow.tabs()[1].props.onClick();
  await flush();
  flow.tabs()[1].props.onKeyDown({ key: "ArrowLeft", preventDefault: () => {} });
  await flush();
  assert.equal(flow.active(), "01");
  assert.equal(calls, 0);
});

test("ordinary flows advance directly and preserve final-step connection verification", async () => {
  for (const withRecheck of [false, true]) {
    let checks = 0;
    const flow = await loadFlow(withRecheck ? { onRecheck: () => { checks++; } } : {});
    assert.notEqual(flow.next().props.type, "submit");
    flow.next().props.onClick();
    await flush();
    assert.equal(flow.active(), "02");
    flow.next().props.onClick();
    await flush();
    assert.equal(flow.active(), "03");
    assert.equal(flow.next().props.disabled, !withRecheck);
    if (withRecheck) flow.next().props.onClick();
    assert.equal(checks, Number(withRecheck));
    assert.equal(flow.active(), "03");
    flow.back().props.onClick();
    await flush();
    assert.equal(flow.active(), "02");
  }
});

test("ordinary keyboard navigation wraps, supports Home and End, and focuses its selected tab", async () => {
  const flow = await loadFlow();
  let focused = -1;
  for (const [index, tab] of flow.tabs().entries()) tab.props.ref({ focus: () => { focused = index; } });
  for (const [key, expected] of [["ArrowLeft", 2], ["ArrowRight", 0], ["End", 2], ["Home", 0], ["ArrowRight", 1]] as const) {
    let prevented = false;
    const selected = flow.tabs().find((tab) => tab.props["aria-selected"]);
    selected!.props.onKeyDown({ key, preventDefault: () => { prevented = true; } });
    await flush();
    assert.equal(prevented, true);
    assert.equal(flow.active(), steps[expected].id);
    assert.equal(focused, expected);
  }
  let prevented = false;
  flow.tabs()[1].props.onKeyDown({ key: "Enter", preventDefault: () => { prevented = true; } });
  await flush();
  assert.equal(prevented, false);
  assert.equal(flow.active(), "02");
  assert.equal(focused, 1);
});
