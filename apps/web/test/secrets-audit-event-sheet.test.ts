import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { AuditEventDetails } from "../src/components/secrets/audit-event-sheet";
import * as helpers from "../src/components/secrets/audit-data";
import type { SecretAuditEvent } from "../src/lib/secrets-client";

Object.assign(globalThis, { React });

const event: SecretAuditEvent = {
  id: "event-42", action: "secret.updated", resourceType: "secret", resourceId: "secret-42", resourceName: "DATABASE_URL",
  projectId: "vault-42", projectName: "API", environmentId: "env-42", environmentName: "Production",
  actorType: "user", actorId: "member-42", actorName: "Ada", actorEmail: "ada@example.com", actorCredential: "session",
  createdAt: "2026-10-07T09:15:22Z", metadata: { version: 3, previousVersion: 2, valueChanged: true, revision: 6 },
};
const render = (overrides: Partial<SecretAuditEvent> = {}) => renderToStaticMarkup(React.createElement(AuditEventDetails, { event: { ...event, ...overrides } }));

test("event details show readable activity, actor, original scope, and exact UTC time without implying success", () => {
  const html = render();
  assert.match(html, /Secret updated/); assert.match(html, /DATABASE_URL/);
  assert.match(html, /Performed by/); assert.match(html, /Ada/); assert.match(html, /Session/);
  assert.match(html, /API \/ Production/);
  assert.match(html, /<time dateTime="2026-10-07T09:15:22.000Z"/i);
  assert.match(html, /Oct 7, 2026/); assert.match(html, /09:15:22/); assert.match(html, /UTC/);
  assert.doesNotMatch(html, /data-outcome|>Success<|>Failed<|>Denied</);
  assert.match(html, /ph-no-capture/); assert.match(html, /data-private-product="secrets"/);
});

test("only explicit recorded outcomes produce labels, icons, and semantic colors", () => {
  for (const [result, label] of [["success", "Success"], ["failure", "Failed"], ["denied", "Denied"]] as const) {
    const html = render({ result });
    assert.match(html, new RegExp(`data-outcome="${result}"`)); assert.match(html, new RegExp(`>${label}</span>`));
  }
  assert.doesNotMatch(render({ result: null }), /data-outcome/);
});

test("change details project typed safe metadata and never dump secret values, passwords, or arbitrary JSON", () => {
  const html = render({ metadata: {
    version: 3, previousVersion: 2, revision: 6, valueChanged: true,
    plaintext: "NEVER_PRINT_PLAINTEXT", value: "NEVER_PRINT_VALUE", password: "NEVER_PRINT_PASSWORD",
    arbitrary: { value: "NEVER_PRINT_NESTED" }, unknown: "NEVER_PRINT_ARBITRARY", secretIds: ["DO_NOT_DUMP_ARRAYS"],
  } });
  assert.match(html, /Change details/); assert.match(html, /<dt>Version<\/dt><dd>3/);
  assert.match(html, /<dt>Previous version<\/dt><dd>2/); assert.match(html, /<dt>Value changed<\/dt><dd>Yes/);
  assert.doesNotMatch(html, /NEVER_PRINT|DO_NOT_DUMP|<pre|JSON|plaintext|password/);
  assert.doesNotMatch(render({ metadata: null }), /aria-label="Change details"/);
});

test("technical information stays collapsed, optional fields are omitted, and the only action copies the event ID", () => {
  const html = render({ result: "success", requestId: "request-42", ipAddress: "203.0.113.10", userAgent: "OutRay CLI", entryId: "entry-42", actorTokenId: "token-42" });
  assert.match(html, /<details class="technical">/); assert.doesNotMatch(html, /<details[^>]*open/);
  for (const value of ["event-42", "secret-42", "vault-42", "env-42", "member-42", "token-42", "entry-42", "request-42", "203.0.113.10", "OutRay CLI"]) assert.ok(html.includes(value));
  const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);
  assert.equal(buttons.length, 1); assert.match(buttons[0], /aria-label="Copy event ID"/);
  assert.match(buttons[0], /iconOnly/); assert.match(buttons[0], /plain/);
  assert.doesNotMatch(buttons[0], />Copy event ID</);
  assert.match(html, /role="status" aria-live="polite"/);
  const minimal = render({ resourceId: null, projectId: null, environmentId: null, actorId: null });
  assert.doesNotMatch(minimal, /<dt>Resource ID|<dt>Vault ID|<dt>Environment ID|<dt>Actor ID|<dt>IP address|<dt>User agent/);
  assert.doesNotMatch(html, /Reveal|Export|Delete|Restore/);
});

test("machine and system actors use recorded provenance, not fictional user details", () => {
  const machine = render({ actorType: "machine", actorName: null, actorEmail: null, actorCredential: "machine", metadata: { machineTokenName: "Deploy bot", machineTokenPrefix: "outray_ab12" } });
  assert.match(machine, /Deploy bot/); assert.match(machine, /Token · outray_ab12/);
  assert.doesNotMatch(machine, /Ada|Session/);
  const system = render({ actorType: "system", actorName: null, actorEmail: null, actorId: null });
  assert.match(system, />System</); assert.match(system, /System activity/);
});

test("legacy resource targets and unavailable context have useful fallbacks, not duplicate labels or invalid timestamps", () => {
  const html = render({ action: "project.created", targetType: "project", resourceType: "project", resourceName: null, projectName: null, projectId: null, environmentName: null, environmentId: null, createdAt: "invalid", metadata: null });
  assert.match(html, /Vault created/); assert.match(html, /Workspace/); assert.match(html, /Not recorded/);
  assert.doesNotMatch(html, /Invalid Date|dateTime=|Vault<\/span><span>Vault/);
  const share = render({ targetType: "share", resourceType: "secret", resourceName: "3-secret snapshot", action: "share.created" });
  assert.match(share, /data-category="security"/); assert.match(share, />Share</); assert.match(share, /3-secret snapshot/);
});

test("all names, actor details, safe metadata, and request context are escaped and long values remain readable", () => {
  const html = render({ resourceName: "<script>resource</script>", actorName: "<img src=x>", userAgent: "<script>agent</script>", metadata: { slug: "<img src=y>" } });
  assert.match(html, /&lt;script&gt;resource/); assert.match(html, /&lt;img src=x&gt;/); assert.match(html, /&lt;script&gt;agent/);
  assert.match(html, /&lt;img src=y&gt;/); assert.doesNotMatch(html, /<script>|<img/);
});

async function stubbedModule() {
  const source = await readFile(new URL("../src/components/secrets/audit-event-sheet.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const CopyButton = () => null, SideSheet = () => null, Placeholder = () => null;
  const context = { current: null as SecretAuditEvent | null, Provider: Placeholder };
  const module = { exports: {} as any };
  runInNewContext(compiled, { React, module, exports: module.exports, require: (specifier: string) => {
    if (specifier === "react") return { createContext: () => context, useContext: () => context.current };
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Placeholder });
    if (specifier === "../ui/side-sheet") return { SideSheet };
    if (specifier === "../arc/copy-button/copy-button") return { CopyButton };
    if (specifier === "./audit-data") return helpers;
    if (specifier.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, key) => key }), __esModule: true };
    throw new Error(`Unexpected audit event sheet dependency: ${specifier}`);
  } });
  return { module, context, SideSheet, CopyButton };
}

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<any>;
  return [element, ...elements(element.props.children)];
}

test("event ID copy uses the installed component with exact ID and its accessible feedback", async () => {
  const { module, CopyButton } = await stubbedModule();
  const nodes = elements(module.exports.AuditEventDetails({ event }));
  const copy = nodes.find((node) => node.type === CopyButton); assert.ok(copy);
  assert.equal(copy.props.value, event.id); assert.equal(copy.props.label, "Copy event ID");
  assert.equal(copy.props.iconOnly, true); assert.equal(copy.props.variant, "plain");
});

test("shared sheet owns keyboard/focus behaviour and clears retained details immediately during close", async () => {
  const { module, context, SideSheet } = await stubbedModule();
  let closes = 0;
  const returnFocusRef = { current: null };
  const provider = module.exports.AuditEventSheet({ event, onClose: () => { closes++; }, returnFocusRef });
  context.current = provider.props.value;
  const sheet = provider.props.children;
  assert.equal(sheet.type, SideSheet); assert.equal(sheet.props.open, true); assert.equal(sheet.props.title, "Audit event");
  assert.equal(sheet.props.returnFocusRef, returnFocusRef);
  sheet.props.onClose(); assert.equal(closes, 1);
  const retainedSession = sheet.props.children;
  const details = retainedSession.type(retainedSession.props);
  assert.equal(details.props.event, event); assert.equal(details.key, event.id);
  const closed = module.exports.AuditEventSheet({ event: null, onClose: () => {}, returnFocusRef });
  context.current = closed.props.value;
  assert.equal(closed.props.children.props.open, false);
  assert.equal(retainedSession.type(retainedSession.props), null, "an exit animation cannot retain the previous event's details");
});

test("technical details have quiet keyboard focus, wrapping values, stacked mobile context and reduced motion", async () => {
  const css = await readFile(new URL("../src/components/secrets/audit-event-sheet.module.css", import.meta.url), "utf8");
  assert.match(css, /\.technical > summary:focus-visible\s*\{[^}]*outline:/);
  assert.match(css, /\.context dd, \.metadata dd, \.technicalRows dd\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /@media \(max-width:\s*420px\)[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*transition:\s*none/);
});
