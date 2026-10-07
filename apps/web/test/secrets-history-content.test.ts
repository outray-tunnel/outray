import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { SecretHistoryContent, type SecretHistoryContentProps, type SecretHistoryRestoreDialogProps } from "../src/components/secrets/secret-history-content";

Object.assign(globalThis, { React });

const environment = { id: "dev-env", name: "Development", slug: "development", secretCount: 1, revision: 3, isProduction: false, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const secret = { id: "secret", key: "API_KEY", version: 4, revision: 3, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-06T00:00:00Z" };
const versions = [
  { id: "v4", version: 4, createdAt: "2026-10-06T00:00:00Z", source: "rollback", sourceVersion: 1, isCurrent: true, createdBy: "Ada" },
  { id: "v3", version: 3, createdAt: "2026-10-05T00:00:00Z", source: "import", createdByType: "machine" },
  { id: "v2", version: 2, createdAt: "2026-10-04T00:00:00Z", source: "write" },
  { id: "v1", version: 1, createdAt: "2026-10-01T00:00:00Z", source: "create", createdByType: "system" },
];
const defaults: SecretHistoryContentProps = { secret, environment, versions, loading: false, error: null, actionError: null, pending: null, revealed: null, secondsRemaining: 0, copiedVersion: null, onReveal: () => {}, onCopy: () => {}, onRestore: () => {}, onHide: () => {}, onRetry: () => {} };
const render = (overrides: Partial<SecretHistoryContentProps> = {}) => renderToStaticMarkup(React.createElement(SecretHistoryContent, { ...defaults, ...overrides }));
const rows = (html: string) => [...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].map(([row]) => row);
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);

test("history uses restrained timeline rows, correct current version, provenance, and no stored values", () => {
  const html = render();
  assert.match(html, /API_KEY/); assert.match(html, /Development/); assert.match(html, /4 versions/);
  assert.match(html, /<ol class="timeline" aria-label="Secret versions"/);
  const items = rows(html); assert.equal(items.length, 4);
  assert.match(items[0], /data-current="true"/); assert.match(items[0], /Current/);
  assert.doesNotMatch(items[0], /aria-label="Restore version 4"/);
  assert.match(items[0], /Restored from v1/); assert.match(items[0], /Ada/);
  assert.match(items[1], /Imported/); assert.match(items[1], /Machine token/);
  assert.match(items[2], /Edited/); assert.match(items[3], /Created/); assert.match(items[3], /System/);
  assert.match(items[1], /aria-label="Restore version 3"/);
  assert.doesNotMatch(html, /<pre|Value revealed|secret-value|Unknown actor|Versions contain metadata/);
});

test("an explicit current marker overrides index position and stale secret metadata", () => {
  const html = render({ versions: [{ ...versions[0], isCurrent: false }, { ...versions[1], isCurrent: true }] });
  const items = rows(html);
  assert.doesNotMatch(items[0], /data-current|>Current</);
  assert.match(items[0], /Restore version 4/);
  assert.match(items[1], /data-current="true"/);
  assert.doesNotMatch(items[1], /Restore version 3/);
  assert.match(html, /Current v3/); assert.doesNotMatch(html, /Current v4/);
});

test("legacy current fallback matches the known current number and never merely the first row", () => {
  const html = render({ secret: { ...secret, version: 2 }, versions: versions.map(({ isCurrent: _ignored, ...version }) => version) });
  const items = rows(html);
  assert.doesNotMatch(items[0], /data-current="true"/);
  assert.match(items[2], /data-current="true"/);
  assert.equal(items.filter((item) => item.includes('data-current="true"')).length, 1);
  assert.match(render({ versions: [], secret: null }), /No version history yet/);
});

test("legacy action metadata remains readable, while source wins over contradictory legacy action", () => {
  const html = render({ versions: [
    { id: "legacy1", version: 1, createdAt: "2026-10-01T00:00:00Z", action: "secret.created" },
    { id: "legacy2", version: 2, createdAt: "2026-10-02T00:00:00Z", action: "secret.rolled_back" },
    { id: "legacy3", version: 3, createdAt: "2026-10-03T00:00:00Z", source: "import", action: "secret.created" },
  ] });
  const items = rows(html);
  assert.match(items[0], /Created/); assert.match(items[1], /Restored/); assert.match(items[2], /Imported/);
  assert.doesNotMatch(items[2], />Created</);
});

test("revealed multiline content stays complete, selectable and escaped within the matching version", () => {
  const value = `first line\n<do-not-render>&\n${"long-secret-value".repeat(80)}`;
  const html = render({ revealed: { version: 2, value, expiresAt: Date.now() + 30000 }, secondsRemaining: 23 });
  const items = rows(html);
  assert.doesNotMatch(items[0], /<pre|Value revealed/); assert.doesNotMatch(items[1], /<pre|Value revealed/);
  assert.match(items[2], /aria-label="Revealed value for version 2"/);
  assert.match(items[2], /<pre class="value" tabindex="0" aria-label="Version 2 secret value"/);
  assert.ok(items[2].includes(`first line\n&lt;do-not-render&gt;&amp;\n${"long-secret-value".repeat(80)}`));
  assert.doesNotMatch(items[2], /<do-not-render>|truncate/);
  assert.match(items[2], /aria-expanded="true"/); assert.match(items[2], /aria-label="Hide version 2"/);
  assert.match(items[2], /23s remaining/); assert.match(items[2], /Hidden automatically after 30 seconds/); assert.match(items[2], /Hide now/);
});

test("initial loading has layout-matched skeleton rows but refresh retains the existing history", () => {
  const initial = render({ loading: true, versions: [] });
  assert.match(initial, /aria-busy="true"/); assert.match(initial, /role="status" aria-label="Loading version history"/);
  assert.equal([...initial.matchAll(/class="skeletonRow"/g)].length, 4);
  assert.doesNotMatch(initial, /No version history|Try again|<ol/);
  const refresh = render({ loading: true });
  assert.match(refresh, /aria-busy="true"/); assert.match(refresh, /<ol/);
  assert.equal(rows(refresh).length, 4); assert.doesNotMatch(refresh, /skeletonRow/);
});

test("failed loading is distinct from empty history and provides a retry action", () => {
  const failure = render({ versions: [], error: "Connection interrupted." });
  assert.match(failure, /Couldn’t load history/); assert.match(failure, /role="alert"/); assert.match(failure, /Connection interrupted/);
  assert.match(buttons(failure)[0], /Try again/); assert.doesNotMatch(failure, /No version history yet/);
  const empty = render({ versions: [] });
  assert.match(empty, /No version history yet/); assert.doesNotMatch(empty, /role="alert"|Try again/);
  const refreshFailure = render({ error: "Could not refresh." });
  assert.equal(rows(refreshFailure).length, 4); assert.match(refreshFailure, /Retry/);
});

test("action feedback belongs to its version and pending work prevents duplicate competing actions", () => {
  const html = render({ pending: { type: "copy", version: 2 }, actionError: { version: 1, message: "Could not reveal this version." }, copiedVersion: 3 });
  const items = rows(html);
  assert.match(items[1], /Copied/); assert.match(items[1], /role="status" aria-live="polite"/);
  const copying = buttons(items[2]).find((button) => button.includes('aria-label="Copy version 2"')) ?? "";
  assert.match(copying, /aria-busy="true"/); assert.match(copying, /aria-disabled="true"/);
  for (const button of buttons(html).filter((button) => !button.includes('aria-label="Copy version 2"'))) assert.match(button, /disabled=""/);
  assert.match(items[3], /Could not reveal this version/); assert.match(items[3], /role="alert"/);
  assert.doesNotMatch(items[0] + items[1] + items[2], /Could not reveal this version/);
});

async function stubbedModule() {
  const source = await readFile(new URL("../src/components/secrets/secret-history-content.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const Button = () => null, Dialog = () => null, DialogContent = () => null, Placeholder = () => null;
  const module = { exports: {} as any };
  runInNewContext(compiled, { React, module, exports: module.exports, require: (specifier: string) => {
    if (specifier === "react") return { useId: () => "history-view" };
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Placeholder });
    if (specifier === "../arc/button/button") return { Button };
    if (specifier === "../arc/dialog/dialog") return { Dialog, DialogContent };
    if (specifier === "./utils") return { formatSecretDate: (value: string) => value };
    if (specifier.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, key) => key }), __esModule: true };
    throw new Error(`Unexpected history content dependency: ${specifier}`);
  } });
  return { module, Button, Dialog, DialogContent };
}

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<any>;
  return [element, ...elements(element.props.children)];
}

test("version controls call audited controller callbacks with the matching version, including revealed copy", async () => {
  const { module } = await stubbedModule();
  const calls: Array<[string, number?]> = [];
  const nodes = elements(module.exports.SecretHistoryContent({ ...defaults, revealed: { version: 2, value: "secret", expiresAt: 30000 }, onReveal: (version: number) => calls.push(["reveal", version]), onCopy: (version: number) => calls.push(["copy", version]), onRestore: (version: number) => calls.push(["restore", version]), onHide: () => calls.push(["hide"]) }));
  nodes.find((node) => node.props["aria-label"] === "Reveal version 1")?.props.onClick();
  nodes.find((node) => node.props["aria-label"] === "Copy version 2")?.props.onClick();
  nodes.find((node) => node.props["aria-label"] === "Restore version 3")?.props.onClick();
  nodes.find((node) => node.props["aria-label"] === "Hide version 2")?.props.onClick();
  assert.deepEqual(calls, [["reveal", 1], ["copy", 2], ["restore", 3], ["hide"]]);
});

test("restore uses Arc dialog, real designed production acknowledgement, no typed confirmation, and preserves existing history", async () => {
  const { module, DialogContent } = await stubbedModule();
  const props: SecretHistoryRestoreDialogProps = { open: true, secretKey: "API_KEY", version: 2, currentVersion: 4, production: true, productionConfirmed: false, pending: false, error: null, onProductionChange: () => {}, onClose: () => {}, onConfirm: () => {} };
  const nodes = elements(module.exports.SecretHistoryRestoreDialog(props));
  const content = nodes.find((node) => node.type === DialogContent); assert.ok(content);
  assert.equal(content.props.title, "Restore version 2?"); assert.match(content.props.className, /workspace-ui outray-arc ph-no-capture/);
  assert.equal(content.props["data-private-product"], "secrets");
  const checkbox = nodes.find((node) => node.props.type === "checkbox"); assert.ok(checkbox);
  assert.equal(checkbox.props.required, true); assert.equal(checkbox.props.checked, false); assert.equal(checkbox.props["aria-describedby"], "history-view-production-hint");
  assert.equal(nodes.filter((node) => node.props.type === "text").length, 0);
  const markup = renderToStaticMarkup(React.createElement("div", null, content.props.children));
  assert.match(markup, /Version 2 → new version 5/); assert.match(markup, /no history is deleted/);
  assert.match(markup, /I confirm this production change/);
  assert.equal(nodes.find((node) => node.props.type === "submit")?.props.disabled, true);
});

test("restore blocks submission and dismissal while pending and requires production confirmation", async () => {
  const { module, Dialog, DialogContent } = await stubbedModule();
  let confirmed = 0, closed = 0, prevented = 0;
  const props: SecretHistoryRestoreDialogProps = { open: true, secretKey: "API_KEY", version: 2, currentVersion: 4, production: true, productionConfirmed: false, pending: false, error: "Revision changed.", onProductionChange: () => {}, onClose: () => { closed++; }, onConfirm: () => { confirmed++; } };
  const get = (overrides: Partial<SecretHistoryRestoreDialogProps> = {}) => elements(module.exports.SecretHistoryRestoreDialog({ ...props, ...overrides }));
  const event = { preventDefault: () => { prevented++; } };
  get().find((node) => node.type === "form")?.props.onSubmit(event);
  assert.equal(confirmed, 0);
  get({ productionConfirmed: true }).find((node) => node.type === "form")?.props.onSubmit(event);
  assert.equal(confirmed, 1);
  get({ production: false }).find((node) => node.type === "form")?.props.onSubmit(event);
  assert.equal(confirmed, 2);
  const pending = get({ pending: true, productionConfirmed: true });
  pending.find((node) => node.type === "form")?.props.onSubmit(event);
  pending.find((node) => node.type === Dialog)?.props.onOpenChange(false);
  const dialogContent = pending.find((node) => node.type === DialogContent); assert.ok(dialogContent);
  assert.equal(dialogContent.props.closeDisabled, true);
  dialogContent.props.onEscapeKeyDown(event); dialogContent.props.onPointerDownOutside(event);
  assert.equal(confirmed, 2); assert.equal(closed, 0); assert.equal(prevented, 6);
  assert.equal(pending.find((node) => node.props.type === "checkbox")?.props.disabled, true);
  assert.equal(pending.find((node) => node.props.type === "submit")?.props.loading, true);
  get().find((node) => node.type === Dialog)?.props.onOpenChange(false);
  assert.equal(closed, 1);
});

test("history CSS provides selectable untruncated multiline values, restrained focus, mobile targets, and reduced motion", async () => {
  const css = await readFile(new URL("../src/components/secrets/secret-history.module.css", import.meta.url), "utf8");
  assert.match(css, /\.value\s*\{[^}]*white-space:\s*pre-wrap[^}]*overflow-wrap:\s*anywhere[^}]*user-select:\s*text/);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis|line-clamp/);
  assert.match(css, /\.action\.action:focus-visible\s*\{[^}]*outline:/);
  assert.match(css, /input:focus-visible \+ \.checkboxMark\s*\{[^}]*outline:/);
  assert.match(css, /\.restoreOverlay\.restoreOverlay\s*\{[^}]*z-index:\s*100/);
  assert.match(css, /\.restoreDialog\.restoreDialog\s*\{[^}]*z-index:\s*101[^}]*max-height:\s*calc\(100dvh - 24px\)/);
  assert.match(css, /\.restoreFields\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/);
  assert.match(css, /@media \(max-width:\s*540px\)[\s\S]*\.action\.action\s*\{[^}]*min-height:\s*40px/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*transition:\s*none[\s\S]*animation:\s*none/);
});
