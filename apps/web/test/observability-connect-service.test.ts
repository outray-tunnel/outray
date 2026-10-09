import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { ConnectServiceSheet } from "../src/components/observability/connect-service-sheet";
import * as overviewData from "../src/components/observability/overview-data";
import * as tokenData from "../src/components/workspace/tokens-data";

Object.assign(globalThis, { React });

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<any>;
  return [element, ...elements(element.props.children)];
}

class FocusTarget {
  isConnected = true;
  focused = 0;
  expandedListbox = false;
  dialog: FocusTarget | null = null;
  focus() { this.focused++; }
  closest(selector: string) {
    if (selector === '[role="dialog"]') return this.dialog;
    assert.equal(selector, '[aria-haspopup="listbox"][aria-expanded="true"]');
    return this.expandedListbox ? this : null;
  }
}

/** Exercise the real component handlers without rendering portals or starting requests. */
async function loadComponent(path: string, initialState: any[] = []) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source + (path.endsWith("/create-token-modal.tsx") ? "\nexport { TokenCreationSession };" : ""), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const values = initialState.slice();
  const refs: Array<{ current: any }> = [];
  const effects: Array<() => void> = [];
  let stateIndex = 0;
  let refIndex = 0;
  const names = ["Button", "SideSheet", "ObservabilitySetup", "ConnectServiceSheet", "Select", "CreateTokenModal", "SetupFlow", "SetupStep", "SetupCodeBlock", "Root", "Portal", "Overlay", "Content", "Title", "Description", "Close", "AnimatePresence", "MotionDiv", "Input", "Label", "Modal", "ModalContent", "ModalFooter", "ModalHeader", "WorkspaceDialog", "WorkspaceNotice", "WorkspaceInput", "CopyButton"];
  const stubs = Object.fromEntries(names.map((name) => [name, (props: any) => React.createElement("div", { "data-component": name }, props.children)]));
  const activeElement = new FocusTarget();
  const module = { exports: {} as Record<string, (props: any) => React.ReactNode> };
  runInNewContext(compiled, {
    React, document: { activeElement }, Element: FocusTarget, HTMLElement: FocusTarget, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return {
        useId: () => "synthetic-token-form",
        useState: (initial: any) => {
          const slot = stateIndex++;
          if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
          return [values[slot], (next: any) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }];
        },
        useRef: (initial: any) => { const slot = refIndex++; return refs[slot] ?? (refs[slot] = { current: initial }); },
        useMemo: (callback: () => any) => callback(),
        useEffect: (callback: () => void) => effects.push(callback),
      };
      if (specifier === "./overview-data") return overviewData;
      if (specifier === "@tanstack/react-router") return { Link: (props: any) => React.createElement("a", { href: props.to }, props.children) };
      if (specifier === "@tanstack/react-query") return { useQuery: () => ({}), useQueryClient: () => ({ invalidateQueries: () => {} }) };
      if (specifier === "@/lib/app-client") return { appClient: {} };
      if (specifier === "@/lib/auth-client") return { usePermission: () => ({ data: true, isPending: false }) };
      if (specifier === "@/components/workspace/tokens-data") return tokenData;
      if (specifier === "@radix-ui/react-dialog") return stubs;
      if (specifier === "motion/react") return { AnimatePresence: stubs.AnimatePresence, motion: { div: stubs.MotionDiv }, useReducedMotion: () => false };
      if (specifier === "lucide-react") return { X: () => null, ArrowRight: () => null, RefreshCw: () => null, Server: () => null, Check: () => null, KeyRound: () => null };
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: () => null };
      if (specifier.startsWith("@hugeicons-pro/")) return { __esModule: true, default: [] };
      if (specifier.endsWith(".css")) return {};
      if (specifier.startsWith(".") || specifier.startsWith("@/components/")) return stubs;
      throw new Error(`Unexpected UI dependency: ${specifier}`);
    },
  });
  return {
    values, refs, effects, stubs, activeElement,
    render(name: string, props: any) {
      stateIndex = 0; refIndex = 0; effects.length = 0;
      return module.exports[name](props);
    },
  };
}

test("Connect a service opens an organization-scoped sheet without navigating away", async () => {
  const ui = await loadComponent("../src/components/observability/overview-content.tsx");
  const retry = () => {};
  const props = { orgSlug: "acme", range: "24h", onRangeChange: () => {}, onRetry: retry, referenceTime: 0 };
  let tree = elements(ui.render("ObservabilityOverviewContent", props));
  const trigger = tree.find((element) => element.type === ui.stubs.Button && element.props["aria-haspopup"] === "dialog");
  assert.ok(trigger);
  assert.equal(trigger.props.size, "md");
  assert.equal(trigger.props["aria-expanded"], false);
  assert.equal(trigger.props.href, undefined);
  trigger.props.onClick();
  tree = elements(ui.render("ObservabilityOverviewContent", props));
  const sheet = tree.find((element) => element.type === ui.stubs.ConnectServiceSheet);
  assert.ok(sheet);
  assert.equal(sheet.props.open, true);
  assert.equal(sheet.props.orgSlug, "acme");
  assert.equal(sheet.props.onRecheck, retry);
  assert.equal(sheet.props.returnFocusRef, trigger.props.ref);
  sheet.props.onClose();
  tree = elements(ui.render("ObservabilityOverviewContent", props));
  assert.equal(tree.find((element) => element.type === ui.stubs.ConnectServiceSheet)?.props.open, false);
});

test("a closed connection sheet does not mount SDK instructions or make API requests", () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Closed sheet must not request data"); };
  try {
    const html = renderToStaticMarkup(React.createElement(ConnectServiceSheet, { open: false, orgSlug: "acme", onClose: () => {}, onRecheck: () => {} }));
    assert.equal(html, "");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("nested token Escape dismisses the token dialog, not the connection sheet", async () => {
  const ui = await loadComponent("../src/components/observability/connect-service-sheet.tsx");
  let closed = 0;
  const props = { open: true, orgSlug: "acme", onClose: () => { closed++; }, onRecheck: () => {} };
  let sheet = ui.render("ConnectServiceSheet", props) as React.ReactElement<any>;
  const guide = elements(sheet).find((element) => element.type === ui.stubs.ObservabilitySetup);
  assert.ok(guide);
  assert.equal(guide.props.onRecheck, props.onRecheck);
  assert.equal(guide.props.buttonSize, "sm");
  assert.equal(sheet.props.footer.props.size, "sm");
  guide.props.onTokenModalOpenChange(true);
  sheet = ui.render("ConnectServiceSheet", props) as React.ReactElement<any>;
  assert.equal(sheet.props.closeDisabled, true);
  assert.equal(sheet.props.footer.props.disabled, true);
  let prevented = 0;
  sheet.props.onInteractOutside({ preventDefault: () => { prevented++; } });
  assert.equal(ui.values[0], true);
  sheet.props.onEscapeKeyDown({ preventDefault: () => { prevented++; } });
  assert.equal(prevented, 2);
  assert.equal(ui.values[0], false);
  assert.equal(closed, 0);
  sheet = ui.render("ConnectServiceSheet", props) as React.ReactElement<any>;
  sheet.props.footer.props.onClick();
  assert.equal(closed, 1);
});

test("sheet backdrop and Escape use modal primitives and respect nested close locks", async () => {
  const ui = await loadComponent("../src/components/ui/side-sheet.tsx");
  let closed = 0;
  const props = { open: true, title: "Connect a service", children: "Guide", onClose: () => { closed++; } };
  let tree = elements(ui.render("SideSheet", props));
  const root = tree.find((element) => element.type === ui.stubs.Root);
  assert.ok(root);
  root.props.onOpenChange(false);
  assert.equal(closed, 1);
  let forwarded = 0;
  tree = elements(ui.render("SideSheet", { ...props, closeDisabled: true, onEscapeKeyDown: () => { forwarded++; }, onInteractOutside: () => { forwarded++; } }));
  tree.find((element) => element.type === ui.stubs.Root)?.props.onOpenChange(false);
  assert.equal(closed, 1);
  const content = tree.find((element) => element.type === ui.stubs.Content);
  assert.ok(content);
  let prevented = 0;
  content.props.onEscapeKeyDown({ preventDefault: () => { prevented++; } });
  content.props.onInteractOutside({ preventDefault: () => { prevented++; } });
  assert.equal(forwarded, 2);
  assert.equal(prevented, 2);
  assert.equal(tree.find((element) => element.type === ui.stubs.Close)?.props.disabled, true);
});

test("closing the sheet returns focus to its trigger or a still-connected original opener", async () => {
  const ui = await loadComponent("../src/components/ui/side-sheet.tsx");
  const trigger = new FocusTarget();
  const tree = elements(ui.render("SideSheet", { open: true, title: "Connect a service", children: "Guide", onClose: () => {}, returnFocusRef: { current: trigger } }));
  const content = tree.find((element) => element.type === ui.stubs.Content);
  assert.ok(content);
  content.props.onOpenAutoFocus();
  let prevented = 0;
  content.props.onCloseAutoFocus({ preventDefault: () => { prevented++; } });
  assert.equal(trigger.focused, 1);
  assert.equal(ui.activeElement.focused, 0);
  trigger.isConnected = false;
  content.props.onCloseAutoFocus({ preventDefault: () => { prevented++; } });
  assert.equal(ui.activeElement.focused, 1);
  assert.equal(prevented, 2);
});

test("a closing sheet does not steal focus from a newly opened Agent dialog", async () => {
  const ui = await loadComponent("../src/components/ui/side-sheet.tsx");
  const trigger = new FocusTarget();
  const closingPanel = new FocusTarget(); closingPanel.dialog = closingPanel;
  const agentPanel = new FocusTarget(); agentPanel.dialog = agentPanel;
  const tree = elements(ui.render("SideSheet", { open: true, title: "Request details", children: "Request", onClose: () => {}, returnFocusRef: { current: trigger } }));
  const content = tree.find((element) => element.type === ui.stubs.Content);
  assert.ok(content);
  content.props.onOpenAutoFocus();
  ui.activeElement.dialog = agentPanel;
  let prevented = 0;
  content.props.onCloseAutoFocus({ target: closingPanel, preventDefault: () => { prevented++; } });
  assert.equal(prevented, 1);
  assert.equal(trigger.focused, 0);
  assert.equal(ui.activeElement.focused, 0);
});

test("the token modal unmounts on close and restores its ingest-token trigger", async () => {
  const ui = await loadComponent("../src/components/onboarding/observability-setup.tsx");
  const props = { orgSlug: "acme", onRecheck: () => {} };
  let tree = elements(ui.render("ObservabilitySetup", props));
  ui.effects.forEach((effect) => effect());
  const trigger = new FocusTarget();
  ui.refs[0].current = trigger;
  const create = tree.find((element) => element.type === ui.stubs.Button && element.props["aria-haspopup"] === "dialog");
  assert.ok(create);
  assert.equal(create.props.size, "md");
  create.props.onClick();
  tree = elements(ui.render("ObservabilitySetup", props));
  ui.effects.forEach((effect) => effect());
  const modal = tree.find((element) => element.type === ui.stubs.CreateTokenModal);
  assert.ok(modal);
  assert.equal(modal.props.orgSlug, "acme");
  assert.equal(modal.props.actionSize, "sm");
  assert.deepEqual(Array.from(modal.props.defaultScopes), ["observability:write"]);
  assert.ok(tree.find((element) => element.type === ui.stubs.Title && element.props.children === "Create ingest token"));
  modal.props.onClose();
  tree = elements(ui.render("ObservabilitySetup", props));
  ui.effects.forEach((effect) => effect());
  assert.equal(trigger.focused, 1);
  assert.equal(tree.some((element) => element.type === ui.stubs.CreateTokenModal), false);
});

test("the embedded connection guide uses small actions without shrinking standalone setup", async () => {
  const ui = await loadComponent("../src/components/onboarding/observability-setup.tsx");
  for (const buttonSize of [undefined, "sm"] as const) {
    const tree = elements(ui.render("ObservabilitySetup", { orgSlug: "acme", onRecheck: () => {}, buttonSize }));
    const create = tree.find((element) => element.type === ui.stubs.Button && element.props["aria-haspopup"] === "dialog");
    const flow = tree.find((element) => element.type === ui.stubs.SetupFlow);
    assert.equal(create?.props.size, buttonSize ?? "md");
    assert.equal(flow?.props.buttonSize, buttonSize ?? "md");
  }
});

test("refreshed token dialog footer actions stay small in standalone and embedded setup", async () => {
  for (const actionSize of [undefined, "sm"] as const) {
    for (const createdToken of [null, "synthetic-test-token"] as const) {
      const ui = await loadComponent("../src/components/create-token-modal.tsx", ["Ingest", "organization", "", "", "90d", ["observability:write"], !!createdToken, createdToken]);
      const tree = elements(ui.render("TokenCreationSession", { isOpen: true, orgSlug: "acme", onClose: () => {}, actionSize, canCreate: true, permissionPending: false }));
      const dialog = tree.find((element) => element.type === ui.stubs.WorkspaceDialog);
      assert.ok(dialog);
      const actions = elements(dialog.props.footer).filter((element) => element.type === ui.stubs.Button);
      assert.equal(actions.length, createdToken ? 1 : 2);
      for (const action of actions) assert.equal(action.props.size, "sm");
      if (!createdToken) { assert.equal(actions[1].props.disabled, false); assert.equal(actions[1].props.form, "synthetic-token-form"); }
    }
  }
});

test("framework menu portals remain inside native and Radix dialogs", async () => {
  const source = await readFile(new URL("../src/components/ui/select.tsx", import.meta.url), "utf8");
  assert.match(source, /closest<HTMLElement>\('dialog, \[role="dialog"\]'\)/);
});

test("Escape from an expanded framework menu cannot dismiss either surrounding dialog", async () => {
  const target = new FocusTarget();
  target.expandedListbox = true;
  const ui = await loadComponent("../src/components/ui/side-sheet.tsx");
  let forwarded = 0;
  const tree = elements(ui.render("SideSheet", { open: true, title: "Connect a service", children: "Guide", onClose: () => {}, onEscapeKeyDown: () => { forwarded++; } }));
  const content = tree.find((element) => element.type === ui.stubs.Content);
  assert.ok(content);
  let prevented = 0;
  content.props.onEscapeKeyDown({ target, preventDefault: () => { prevented++; } });
  assert.equal(prevented, 1);
  assert.equal(forwarded, 0, "a listbox Escape must not also close a nested token dialog");
  const guide = await loadComponent("../src/components/onboarding/observability-setup.tsx", [true]);
  const modalContent = elements(guide.render("ObservabilitySetup", { orgSlug: "acme", onRecheck: () => {} })).find((element) => element.type === guide.stubs.Content);
  assert.ok(modalContent);
  modalContent.props.onEscapeKeyDown({ target, preventDefault: () => { prevented++; } });
  assert.equal(prevented, 2);
});
