import assert from "node:assert/strict";
import test from "node:test";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShareExportButton, type ShareExportFormat } from "../src/components/ShareExportButton";
import ShareReveal from "../src/components/ShareReveal";
import { SplitButton, type SplitButtonProps } from "../src/components/arc/split-button/split-button";

test("the export split button downloads .env by default and offers both formats", () => {
  const exports: ShareExportFormat[] = [];
  const button = ShareExportButton({ onExport: (format) => exports.push(format) });
  assert.ok(isValidElement<SplitButtonProps>(button));
  assert.equal(button.type, SplitButton, "use the installed UIArc component");
  assert.equal(button.props.label, "Export .env");
  assert.equal(button.props.variant, "secondary");
  assert.deepEqual(button.props.actions.map(({ label }) => label), ["Download .env", "Download JSON"]);

  assert.ok(button.props.onClick);
  button.props.onClick();
  assert.deepEqual(exports, ["env"]);

  assert.ok(button.props.actions[0].onSelect);
  button.props.actions[0].onSelect();
  assert.ok(button.props.actions[1].onSelect);
  button.props.actions[1].onSelect();
  assert.deepEqual(exports, ["env", "env", "json"]);
});

test("the real split button renders two non-submit controls with an accessible closed menu trigger", () => {
  let calls = 0;
  const html = renderToStaticMarkup(createElement(ShareExportButton, { onExport: () => { calls++; } }));
  const buttons = html.match(/<button\b[^>]*>/g) ?? [];
  assert.equal(buttons.length, 2);
  for (const button of buttons) assert.match(button, /type="button"/);
  assert.match(html, /aria-live="polite">Export \.env<\/span>/);
  assert.match(buttons[1], /aria-label="Export \.env more actions"/);
  assert.match(buttons[1], /aria-haspopup="menu"/);
  assert.match(buttons[1], /aria-expanded="false"/);
  assert.match(buttons[1], /data-state="closed"/);
  assert.doesNotMatch(html, /role="menu"|Download JSON|Download \.env/);
  assert.equal(calls, 0, "rendering cannot download content");
});

test("the split button disables both halves together", () => {
  const html = renderToStaticMarkup(createElement(SplitButton, {
    label: "Export .env", disabled: true, actions: [{ label: "Download JSON" }],
  }));
  const buttons = html.match(/<button\b[^>]*>/g) ?? [];
  assert.equal(buttons.length, 2);
  for (const button of buttons) assert.match(button, /\bdisabled=""/);
});

test("the format menu retains the warning that downloaded secrets are unencrypted", () => {
  const button = ShareExportButton({ onExport: () => {} });
  assert.ok(isValidElement<SplitButtonProps>(button));
  const warning = renderToStaticMarkup(createElement("div", null, button.props.menuFooter));
  assert.match(warning, /Files contain unencrypted secrets\./);
});

test("the unrevealed share has no export control and does not access a fragment or request secrets during SSR", (context) => {
  // A synthetic ID and server rendering deliberately avoid the user's share URL
  // and any reveal endpoint. The fragment is only needed after an explicit reveal.
  const transport = context.mock.method(globalThis, "fetch", () => {
    throw new Error("Rendering an unrevealed share must not make requests");
  });
  const html = renderToStaticMarkup(createElement(ShareReveal, { id: "a".repeat(22) }));
  assert.match(html, /Reveal secret/);
  assert.doesNotMatch(html, /Export \.env|Download JSON|Download \.env|more actions/);
  assert.doesNotMatch(html, /<script|https?:\/\//);
  assert.equal(transport.mock.callCount(), 0);
});
