import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const readSource = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

function rawFields(source: string) {
  const fields: string[] = [];
  const document = ts.createSourceFile("component.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ["input", "textarea"].includes(node.tagName.getText(document))) {
      const type = node.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.getText(document) === "type");
      fields.push(type && ts.isJsxAttribute(type) && type.initializer && ts.isStringLiteral(type.initializer) ? type.initializer.text : "text");
    }
    ts.forEachChild(node, visit);
  };
  visit(document);
  return fields;
}

test("refreshed Uptime incident and Setup text controls use the shared fields", async () => {
  for (const path of [
    "components/onboarding/product-setup.tsx",
    "components/onboarding/uptime-monitor-form.tsx",
    "components/uptime/create-incident-dialog.tsx",
    "components/uptime/incident-rich-editor.tsx",
    "routes/$orgSlug/uptime/incidents.tsx",
    "routes/$orgSlug/uptime/status-page.tsx",
    "routes/$orgSlug/uptime/status-page/domains.tsx",
  ]) {
    const source = await readSource(path);
    assert.match(source, /import .*WorkspaceInput.*workspace-input/, path);
    assert.ok(rawFields(source).every((type) => ["checkbox", "radio", "color", "file", "hidden"].includes(type)), `${path} has an ad-hoc text field`);
  }
});

test("incident searches share neutral shells and compact bare controls", async () => {
  const list = await readSource("routes/$orgSlug/uptime/incidents.tsx");
  const picker = await readSource("components/uptime/create-incident-dialog.tsx");
  for (const source of [list, picker]) {
    assert.match(source, /data-field-size="compact" className=\{`\$\{workspaceInputShellClassName\}/);
    assert.match(source, /<WorkspaceInput[^>]+variant="bare"[^>]+size="compact"/);
  }
  assert.match(list, /aria-label="Search incidents by title"/);
  assert.match(picker, /aria-label="Find a component" aria-invalid=\{!!errors\.componentIds\}/);
});

test("legacy Uptime monitor fields and shared fieldClass are not restyled by this opt-in migration", async () => {
  const legacy = await readSource("routes/$orgSlug/uptime/monitors.tsx");
  const helpers = await readSource("components/uptime/uptime-ui.tsx");
  const publishing = await readSource("components/uptime/incident-publishing-fields.tsx");
  assert.doesNotMatch(legacy, /ui\/workspace-input/);
  assert.doesNotMatch(publishing, /ui\/workspace-input/, "shared legacy monitor settings must not change untouched screens");
  assert.match(helpers, /export const fieldClass = "min-h-10 w-full rounded-xl/);
});

test("incident title and link controls retain focus targets and handlers", async () => {
  const create = await readSource("components/uptime/create-incident-dialog.tsx");
  const editor = await readSource("components/uptime/incident-rich-editor.tsx");
  assert.match(create, /<WorkspaceInput id=\{`\$\{formId\}-title`\} data-autofocus/);
  assert.match(create, /maxLength=\{160\} required/);
  assert.match(editor, /<WorkspaceInput id=\{`\$\{id\}-link`\} data-autofocus type="url"/);
  assert.match(editor, /onKeyDown=\{\(event\) => \{ if \(event\.key === "Enter"\)/);
});
