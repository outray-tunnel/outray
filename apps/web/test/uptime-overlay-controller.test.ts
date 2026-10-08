import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { UptimeDialog } from "../src/components/uptime/uptime-dialog";
import { UptimeSideSheet } from "../src/components/uptime/uptime-side-sheet";

Object.assign(globalThis, { React });
type Props = { children?: React.ReactNode; [key: string]: any };
function elements(node: React.ReactNode): React.ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function event(target?: unknown) {
  return { target, prevented: 0, preventDefault() { this.prevented++; } };
}

/** Execute wrapper-owned callbacks; the installed Arc/Radix dialog owns actual DOM trapping and keyboard menus. */
async function controller() {
  const source = await readFile(new URL("../src/components/uptime/uptime-dialog.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const refs: { current: any }[] = [];
  let refIndex = 0, parentDepth = 0, closed = 0;
  class FakeElement {
    expandedMenu = false;
    closest(selector: string) { assert.equal(selector, '[aria-haspopup="listbox"][aria-expanded="true"]'); return this.expandedMenu ? this : null; }
  }
  class FakeHTMLElement extends FakeElement {
    isConnected = true;
    focused = 0;
    autofocus: FakeHTMLElement | null = null;
    focus() { this.focused++; document.activeElement = this; }
    querySelector(selector: string) { assert.equal(selector, "[data-autofocus]"); return this.autofocus; }
  }
  const body = new FakeHTMLElement(), opener = new FakeHTMLElement(), panel = new FakeHTMLElement(), first = new FakeHTMLElement();
  const document = { body, activeElement: opener as FakeHTMLElement | null };
  const Dialog = () => null, DialogContent = () => null;
  const styles = { dialog: "uptime-dialog", overlay: "uptime-overlay", raisedDialog: "raised-dialog", raisedOverlay: "raised-overlay", dialogBody: "dialog-body", dialogFooter: "dialog-footer" };
  const module = { exports: {} as { UptimeDialog: (props: Props) => React.ReactElement<Props> } };
  runInNewContext(compiled, {
    React, document, HTMLElement: FakeHTMLElement, Element: FakeElement, module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "react") return {
        ...React, useContext: () => parentDepth,
        useRef(initial: unknown) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
      };
      if (specifier === "../arc/dialog/dialog") return { Dialog, DialogContent };
      if (specifier.endsWith(".module.css")) return styles;
      if (specifier.endsWith(".css")) return {};
      throw new Error(`Unexpected Uptime dialog dependency: ${specifier}`);
    },
  });
  return {
    opener, panel, first, document,
    closed: () => closed,
    expandedTarget() { const target = new FakeElement(); target.expandedMenu = true; return target; },
    render(update: Props = {}, depth = 0) {
      refIndex = 0; parentDepth = depth;
      const root = module.exports.UptimeDialog({ open: true, onClose() { closed++; }, title: "Create incident", description: "Private until published.", children: React.createElement("input", { "aria-label": "Incident title" }), ...update });
      const all = elements(root), dialog = all.find((item) => item.type === Dialog), content = all.find((item) => item.type === DialogContent);
      assert.ok(dialog); assert.ok(content);
      return { root, dialog: dialog.props, content: content.props };
    },
  };
}

test("shared Uptime overlays remain server-safe and delegate focus trapping to installed native dialog primitives", () => {
  assert.equal(typeof globalThis.window, "undefined"); assert.equal(typeof globalThis.document, "undefined");
  for (const Component of [UptimeDialog, UptimeSideSheet]) {
    for (const open of [false, true]) {
      const html = renderToStaticMarkup(React.createElement(Component, {
        open, onClose() {}, title: "Incident update", description: "Private editor", footer: React.createElement("button", null, "Publish"),
        children: React.createElement("input", { defaultValue: "server-private-draft" }),
      }));
      assert.equal(html, "", "Radix portals do not serialize draft content inline during SSR");
    }
  }
});

test("busy Uptime dialogs reject every dismissal path and expose the native close-disabled/busy contract", async () => {
  const dialog = await controller(); let view = dialog.render({ busy: true });
  assert.equal(view.content.closeDisabled, true); assert.equal(view.content["aria-busy"], true);
  view.dialog.onOpenChange(false); view.dialog.onOpenChange(true); assert.equal(dialog.closed(), 0);
  for (const callback of ["onEscapeKeyDown", "onPointerDownOutside", "onInteractOutside"] as const) {
    const attempt = event(dialog.panel); view.content[callback](attempt); assert.equal(attempt.prevented, 1);
  }
  view = dialog.render({ busy: false }); view.dialog.onOpenChange(false); assert.equal(dialog.closed(), 1);
  const ordinary = event(dialog.panel); view.content.onEscapeKeyDown(ordinary); assert.equal(ordinary.prevented, 0);
});

test("Escape in an expanded trigger leaves the dialog open while the menu handles its own dismissal", async () => {
  const dialog = await controller(), view = dialog.render();
  const menuEscape = event(dialog.expandedTarget()); view.content.onEscapeKeyDown(menuEscape);
  assert.equal(menuEscape.prevented, 1); assert.equal(dialog.closed(), 0);
  const plainEscape = event(dialog.panel); view.content.onEscapeKeyDown(plainEscape); assert.equal(plainEscape.prevented, 0);
});

test("autofocus is opt-in and closing restores the exact connected opener without retaining it after close", async () => {
  const dialog = await controller(), view = dialog.render();
  const nativeFocus = event(dialog.panel); view.content.onOpenAutoFocus(nativeFocus);
  assert.equal(nativeFocus.prevented, 0, "without an explicit target Radix owns initial focus");
  dialog.panel.autofocus = dialog.first;
  const explicit = event(dialog.panel); view.content.onOpenAutoFocus(explicit);
  assert.equal(explicit.prevented, 1); assert.equal(dialog.first.focused, 1);
  const close = event(); view.content.onCloseAutoFocus(close);
  assert.equal(close.prevented, 1); assert.equal(dialog.opener.focused, 1); assert.equal(dialog.document.activeElement, dialog.opener);
  const duplicateClose = event(); view.content.onCloseAutoFocus(duplicateClose);
  assert.equal(duplicateClose.prevented, 0); assert.equal(dialog.opener.focused, 1);
});

test("a disconnected opener allows native close-focus fallback instead of focusing detached content", async () => {
  const dialog = await controller(), view = dialog.render();
  view.content.onOpenAutoFocus(event(dialog.panel)); dialog.opener.isConnected = false;
  const close = event(); view.content.onCloseAutoFocus(close);
  assert.equal(close.prevented, 0); assert.equal(dialog.opener.focused, 0);
});

test("nested dialogs inherit raised layers and sibling discard confirmations opt into the same safe layer", async () => {
  const dialog = await controller();
  const ordinary = dialog.render(); assert.doesNotMatch(ordinary.content.className, /raised-dialog/); assert.equal(ordinary.root.props.value, 1);
  const nested = dialog.render({}, 1); assert.match(nested.content.className, /raised-dialog/); assert.match(nested.content.overlayClassName, /raised-overlay/);
  assert.equal(nested.root.props.value, 2);
  const sibling = dialog.render({ layer: 1 }); assert.match(sibling.content.className, /raised-dialog/); assert.match(sibling.content.overlayClassName, /raised-overlay/);
  const css = await readFile(new URL("../src/components/uptime/uptime-ui.module.css", import.meta.url), "utf8");
  assert.match(css, /\.overlay\.overlay\s*\{\s*z-index:\s*80/); assert.match(css, /\.dialog\.dialog\s*\{\s*z-index:\s*81/);
  assert.match(css, /\.overlay\.overlay\s*\{[^}]*backdrop-filter:\s*none/, "Uptime editors dim the workspace without full-screen backdrop repainting");
  assert.match(css, /\.raisedOverlay\.raisedOverlay\s*\{\s*z-index:\s*90/); assert.match(css, /\.raisedDialog\.raisedDialog\s*\{\s*z-index:\s*91/);
  for (const path of ["../src/components/uptime/create-incident-dialog.tsx", "../src/routes/$orgSlug/uptime/incidents_.$incidentId.tsx"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let discardLayer: string | undefined;
    function visit(node: ts.Node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === "UptimeDialog") {
        const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
        const title = attributes.find((item) => item.name.getText(ast) === "title")?.initializer;
        if (title && ts.isStringLiteral(title) && title.text.startsWith("Discard")) discardLayer = attributes.find((item) => item.name.getText(ast) === "layer")?.initializer?.getText(ast);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast); assert.equal(discardLayer, "{1}", "the sibling confirmation must dim its still-open editor");
  }
});
