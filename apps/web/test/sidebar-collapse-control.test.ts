import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { IconSvgElement } from "@hugeicons/react";
import SidebarLeft01Icon from "@outray/icons/stroke/SidebarLeft01Icon";
import SidebarRight01Icon from "@outray/icons/stroke/SidebarRight01Icon";
import { SidebarCollapseControl } from "../src/components/sidebar/sidebar-collapse-control";

// The Node test runner uses classic JSX; Vite uses automatic JSX.
Object.assign(globalThis, { React });

function renderControl(isCollapsed: boolean, onToggle = () => {}) {
  return renderToStaticMarkup(React.createElement(SidebarCollapseControl, {
    isCollapsed,
    onToggle,
    controls: "workspace-sidebar-navigation",
  }));
}

function iconPaths(icon: IconSvgElement) {
  return icon.filter(([tag]) => tag === "path").map(([, attributes]) => attributes.d);
}

function renderedPaths(html: string) {
  return [...html.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(([, path]) => path);
}

test("the expanded sidebar exposes one named collapse disclosure with the requested left icon", () => {
  const html = renderControl(false);
  assert.equal((html.match(/<button\b/g) ?? []).length, 1);
  assert.equal((html.match(/<svg\b/g) ?? []).length, 1);
  assert.match(html, /type="button"/);
  assert.match(html, /aria-label="Collapse sidebar"/);
  assert.match(html, /title="Collapse sidebar"/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /aria-controls="workspace-sidebar-navigation"/);
  assert.doesNotMatch(html, /aria-pressed|aria-label="Expand sidebar"/);
  assert.match(html, /<svg\b[^>]*aria-hidden="true"/);
  assert.deepEqual(renderedPaths(html), iconPaths(SidebarLeft01Icon));
  assert.notDeepEqual(renderedPaths(html), iconPaths(SidebarRight01Icon));
});

test("the collapsed sidebar keeps one accessible expand control with the requested right icon", () => {
  const html = renderControl(true);
  assert.equal((html.match(/<button\b/g) ?? []).length, 1);
  assert.equal((html.match(/<svg\b/g) ?? []).length, 1);
  assert.match(html, /aria-label="Expand sidebar"/);
  assert.match(html, /title="Expand sidebar"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="workspace-sidebar-navigation"/);
  assert.doesNotMatch(html, /aria-pressed|aria-label="Collapse sidebar"/);
  assert.deepEqual(renderedPaths(html), iconPaths(SidebarRight01Icon));
  assert.notDeepEqual(renderedPaths(html), iconPaths(SidebarLeft01Icon));
});

test("rendering either collapse state does not toggle the sidebar", () => {
  let calls = 0;
  const onToggle = () => { calls += 1; };
  renderControl(false, onToggle);
  renderControl(true, onToggle);
  assert.equal(calls, 0);
});

test("the icon transition lives inside the stable button and respects reduced-motion preference", async () => {
  const source = await readFile(new URL("../src/components/sidebar/sidebar-collapse-control.tsx", import.meta.url), "utf8");
  const button = source.indexOf("<button");
  const animation = source.indexOf("<AnimatePresence");
  assert.ok(button >= 0 && animation > button && animation < source.indexOf("</button>"));
  assert.match(source, /useReducedMotion\(\)/);
  assert.match(source, /duration:\s*reducedMotion\s*\?\s*0\s*:/);
  assert.match(source, /motion-reduce:transition-none/);
});

test("the single collapse control remains in the sidebar footer outside the scrolling navigation", async () => {
  const source = await readFile(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/<SidebarCollapseControl\b/g) ?? []).length, 1);
  const control = source.indexOf("<SidebarCollapseControl");
  assert.ok(control > source.indexOf("</nav>"));
  assert.ok(control > source.indexOf("<footer") && control < source.indexOf("</footer>"));
  assert.match(source, /controls=\{sidebarId\}/);
  assert.match(source, /<aside\b[\s\S]*?id=\{sidebarId\}/);
  assert.doesNotMatch(source, /PanelLeftCloseIcon|PanelLeftOpenIcon/);
  const header = source.slice(source.indexOf("<aside"), source.indexOf("<OrganizationDropdown"));
  assert.doesNotMatch(header, /Collapse sidebar|Expand sidebar|<SidebarCollapseControl|setIsCollapsed\((?:true|false)\)/);

  // Ordering alone would not catch a footer accidentally nested in the
  // expanded-only branch, which would remove its expand control.
  const tree = ts.createSourceFile("app-sidebar.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let controlNode: ts.JsxSelfClosingElement | undefined;
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "SidebarCollapseControl") {
      controlNode = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(controlNode);
  for (let ancestor = controlNode.parent; ancestor; ancestor = ancestor.parent) {
    const conditional = ts.isConditionalExpression(ancestor)
      ? ancestor.condition
      : ts.isBinaryExpression(ancestor) && ancestor.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        ? ancestor.left
        : undefined;
    if (conditional) assert.doesNotMatch(conditional.getText(tree), /\bisCollapsed\b|\bunified\b/);
  }
});

test("the sidebar neither renders a plan/usage summary nor fetches subscription usage", async () => {
  const source = await readFile(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bPlanUsage\b|\bgetPlanLimits\b|\btunnelLimit\b|\bcurrentPlan\b/);
  assert.doesNotMatch(source, /appClient\.subscriptions\.get\(|queryKey:\s*\[\s*["']subscription["']/);
  assert.match(source, /<footer\b[\s\S]*?<SidebarCollapseControl\b[\s\S]*?<\/footer>/);
});

test("the collapse footer keeps one static left-aligned position and fixed padding in both states", async () => {
  const source = await readFile(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("app-sidebar.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let footer: ts.JsxOpeningElement | undefined;
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(tree) === "footer") footer = node;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(footer);
  const className = footer.attributes.properties.find((attribute) =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === "className");
  assert.ok(className && ts.isJsxAttribute(className));
  assert.ok(className.initializer && ts.isStringLiteral(className.initializer),
    "the footer position must not branch on collapsed state");
  const classes = className.initializer.text.split(/\s+/);
  for (const expected of ["flex", "shrink-0", "items-center", "justify-start", "px-4", "py-2"]) {
    assert.ok(classes.includes(expected), `the footer retains ${expected} in both states`);
  }
  assert.ok(classes.every((className) => !className.includes("justify-center")));
});
