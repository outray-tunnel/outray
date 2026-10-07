import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const files = {
  create: "components/uptime/create-incident-dialog.tsx",
  richEditor: "components/uptime/incident-rich-editor.tsx",
  incidents: "routes/$orgSlug/uptime/incidents.tsx",
  detail: "routes/$orgSlug/uptime/incidents_.$incidentId.tsx",
  notifications: "routes/$orgSlug/uptime/notifications.tsx",
};
type Control = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

async function source(path: string) {
  const text = await readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function controls(root: ts.Node, tag: string): Control[] {
  const result: Control[] = [];
  const walk = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText() === tag) result.push(node);
    ts.forEachChild(node, walk);
  };
  walk(root);
  return result;
}
function attribute(node: Control, name: string) {
  return node.attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name)?.initializer;
}
function value(node: Control, name: string) {
  const initializer = attribute(node, name);
  return initializer && ts.isStringLiteral(initializer) ? initializer.text : initializer?.getText();
}
function inOverlay(node: ts.Node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if ((ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) && ["UptimeDialog", "UptimeSideSheet"].includes(parent.tagName.getText())) return true;
    if (ts.isJsxElement(parent) && ["UptimeDialog", "UptimeSideSheet"].includes(parent.openingElement.tagName.getText())) return true;
  }
  return false;
}
function label(node: Control) {
  return ts.isJsxElement(node.parent) ? node.parent.getText() : node.getText();
}

test("incident page launchers use Arc md with stable dialog anchoring", async () => {
  for (const path of [files.incidents, files.detail]) {
    const root = await source(path);
    const launchers = controls(root, "Button").filter((node) => !inOverlay(node));
    assert.ok(launchers.length > 0);
    for (const node of launchers) {
      assert.equal(value(node, "size"), "md");
      assert.equal(value(node, "type"), "button");
      assert.equal(value(node, "aria-haspopup"), "dialog");
      assert.doesNotMatch(attribute(node, "className")?.getText() ?? "", /primaryButton|secondaryButton|min-h/);
      assert.ok(attribute(node, "onClick"));
    }
    assert.match(root.getText(), /className="outray-arc mx-auto/);
  }
});

test("incident creation, link, update, discard, and ignore overlay actions use explicit Arc sm sizes", async () => {
  let count = 0;
  for (const path of [files.create, files.richEditor, files.detail]) {
    const root = await source(path);
    const actions = controls(root, "Button").filter(inOverlay);
    assert.ok(actions.length > 0);
    for (const node of actions) {
      count++;
      assert.equal(value(node, "size"), "sm");
      assert.ok(["button", "submit"].includes(value(node, "type") ?? ""));
      assert.doesNotMatch(attribute(node, "className")?.getText() ?? "", /primaryButton|secondaryButton|min-h/);
    }
    assert.equal(controls(root, "button").filter(inOverlay).length, 0, "footer actions must not fall back to legacy native 40px button styles");
  }
  assert.equal(count, 15);
});

test("save and publish actions preserve form ownership, permission checks, and native pending-disabled behavior", async () => {
  const create = await source(files.create);
  const draft = controls(create, "Button").find((node) => value(node, "type") === "submit");
  assert.ok(draft);
  assert.equal(value(draft, "form"), "{formId}");
  assert.equal(value(draft, "disabled"), "{saving !== null || !page.data?.page || !components.length}");
  const publish = controls(create, "Button").find((node) => label(node).includes('"Publish incident"'));
  assert.ok(publish);
  assert.equal(value(publish, "disabled"), "{saving !== null || !page.data?.page?.published || !components.length}");
  assert.equal(value(publish, "onClick"), "{() => void create(true)}");

  const detail = await source(files.detail);
  const save = controls(detail, "Button").find((node) => value(node, "form") === "incident-update-form");
  assert.ok(save);
  assert.equal(value(save, "type"), "submit");
  assert.equal(value(save, "disabled"), "{!!saving || !editable}");
  const update = controls(detail, "Button").find((node) => value(node, "onClick") === "{() => void save(true)}");
  assert.ok(update);
  assert.equal(value(update, "disabled"), "{!!saving || !editable || !pagePublished}");
});

test("notification settings launch at md while confirmation actions and OAuth links remain sm in the modal", async () => {
  const root = await source(files.notifications);
  const actions = controls(root, "Button");
  const settings = actions.find((node) => value(node, "aria-label") === "{`${name} channel settings`}");
  assert.ok(settings);
  assert.equal(value(settings, "size"), "md");
  assert.equal(value(settings, "aria-haspopup"), "dialog");
  for (const node of actions.filter(inOverlay)) {
    assert.equal(value(node, "size"), "sm");
    assert.equal(value(node, "type"), "button");
    assert.doesNotMatch(attribute(node, "className")?.getText() ?? "", /primaryButton|secondaryButton|min-h/);
  }
  const anchors = controls(root, "a");
  assert.equal(anchors.length, 2);
  for (const node of anchors) {
    assert.match(attribute(node, "className")?.getText() ?? "", inOverlay(node) ? /buttonStyles\.sm/ : /buttonStyles\.md/);
    assert.match(value(node, "href") ?? "", /uptimeApiPath/);
    assert.equal(attribute(node, "onClick"), undefined, "OAuth stays a native navigation, not a button-side redirect");
  }
  const remove = actions.find((node) => value(node, "onClick") === "{() => void removeConnection(dialog.provider)}");
  assert.ok(remove);
  assert.equal(value(remove, "variant"), "danger");
  assert.equal(value(remove, "disabled"), "{removing !== null}");
  assert.equal(controls(root, "button").filter(inOverlay).length, 0);
});

test("Arc theme variables travel with both native portal overlays without changing legacy Uptime defaults", async () => {
  for (const path of ["components/uptime/uptime-dialog.tsx", "components/uptime/uptime-side-sheet.tsx"]) {
    const root = await source(path);
    assert.match(root.getText(), /import "\.\.\/outray-arc-theme\.css"/);
    const dialog = controls(root, "dialog")[0];
    assert.ok(dialog);
    assert.match(value(dialog, "className") ?? "", /^outray-arc /);
    const close = controls(root, "button").find((node) => value(node, "aria-label")?.startsWith("Close"));
    assert.ok(close);
    assert.match(value(close, "className") ?? "", /size-10/);
    assert.equal(value(close, "disabled"), "{busy}");
  }
  const shared = await source("components/uptime/uptime-ui.tsx");
  assert.match(shared.getText(), /export const primaryButton = "inline-flex min-h-10/);
  assert.match(shared.getText(), /export const secondaryButton = "inline-flex min-h-10/);
  const richEditor = await source(files.richEditor);
  const toolbar = controls(richEditor, "button").find((node) => value(node, "title") === "{tool.label}");
  assert.ok(toolbar);
  assert.match(value(toolbar, "className") ?? "", /size-8/);
});
