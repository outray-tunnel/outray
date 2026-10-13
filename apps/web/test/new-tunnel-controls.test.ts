import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { Button } from "../src/components/arc/button/button";
import { NewTunnelButton } from "../src/components/new-tunnel-button";
import {
  buildNewTunnelCommand,
  isValidLocalPort,
  isValidTunnelAddress,
} from "../src/components/new-tunnel-commands";

// The Node test runner's TSX transform uses classic JSX; Vite uses automatic JSX.
Object.assign(globalThis, { React });

async function renderNewTunnelCommands(copiedCommand: string | null = null) {
  const source = await readFile(new URL("../src/components/new-tunnel-modal.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const module = { exports: {} as { NewTunnelModal: (props: object) => React.ReactNode } };
  let stateIndex = 0;
  const childrenOnly = ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children);
  runInNewContext(compiled, { React, module, exports: module.exports, require: (specifier: string) => {
    if (specifier === "react") return { useEffect: () => {}, useRef: () => ({ current: null }), useState: (initial: unknown) => [stateIndex++ === 4 ? copiedCommand : initial, () => {}] };
    if (specifier === "@hugeicons/react") return { HugeiconsIcon: ({ icon }: { icon: string }) => React.createElement("svg", { "aria-hidden": true, "data-icon": icon }) };
    if (specifier.startsWith("@outray/icons/stroke/")) return { __esModule: true, default: specifier.split("/").at(-1) };
    if (specifier.endsWith("arc/button/button")) return { Button };
    if (specifier.endsWith("arc/dialog/dialog")) return { Dialog: childrenOnly, DialogContent: childrenOnly };
    if (specifier.endsWith("arc/segmented-control/segmented-control")) return { __esModule: true, default: () => null };
    if (specifier.endsWith("ui/workspace-input")) return { WorkspaceInput: () => null };
    if (specifier.endsWith("ui/workspace-input-styles")) return { workspaceInputShellClassName: "input-shell" };
    if (specifier === "./new-tunnel-commands") return { buildNewTunnelCommand, isValidLocalPort, isValidTunnelAddress };
    throw new Error(`Unexpected new tunnel dependency: ${specifier}`);
  } });
  return renderToStaticMarkup(module.exports.NewTunnelModal({ isOpen: true, onClose: () => {}, orgSlug: "byteship", triggerRef: { current: null } }));
}

test("new tunnel commands target the current workspace and validate the address", () => {
  assert.equal(
    buildNewTunnelCommand({ orgSlug: "byteship", port: "8000" }),
    "outray 8000 --org byteship",
  );
  assert.equal(
    buildNewTunnelCommand({
      orgSlug: "byteship",
      port: "3000",
      addressMode: "subdomain",
      address: "preview",
    }),
    "outray 3000 --org byteship --subdomain preview",
  );
  assert.equal(
    buildNewTunnelCommand({
      orgSlug: "byteship",
      port: "3000",
      addressMode: "domain",
      address: "app.example.com",
    }),
    "outray 3000 --org byteship --domain app.example.com",
  );
  assert.equal(isValidLocalPort("65535"), true);
  assert.equal(isValidLocalPort("65536"), false);
  assert.equal(isValidTunnelAddress("subdomain", "bad.name"), false);
  assert.equal(isValidTunnelAddress("domain", "localhost"), false);
  assert.equal(
    buildNewTunnelCommand({ orgSlug: "byteship", port: "0" }),
    null,
  );
});

test("workspace names are shell-quoted before appearing in a copyable command", () => {
  const command = buildNewTunnelCommand({
    orgSlug: "team'; echo unsafe",
    port: "8000",
  });
  assert.equal(command, "outray 8000 --org 'team'\\''; echo unsafe'");
});

test("a loading UIArc button stays focusable and announces that it is busy", () => {
  const html = renderToStaticMarkup(
    React.createElement(Button, { loading: true }, "Copy command"),
  );

  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /Copy command/);
  assert.doesNotMatch(html, /disabled=""/);
});

test("the new tunnel button uses the shared medium size and still opens plan-limit guidance", () => {
  const html = renderToStaticMarkup(
    React.createElement(NewTunnelButton, {
      isAtLimit: true,
      onClick: () => {},
    }),
  );

  assert.match(html, /New tunnel \(plan limit reached\)/);
  assert.match(html, /<button/);
  assert.match(html, /<button\b[^>]*class="[^"]*min-h-9/);
  assert.doesNotMatch(html, /disabled=""/);
});

test("composite tunnel inputs retain their neutral shell focus and accessible labels", async () => {
  const source = await readFile(new URL("../src/components/new-tunnel-modal.tsx", import.meta.url), "utf8");
  const inputs = [...source.matchAll(/<WorkspaceInput\b[\s\S]*?\/>/g)];
  assert.equal(inputs.length, 2);

  for (const [id, hint] of [
    ["new-tunnel-local-port", "new-tunnel-port-hint"],
    ["new-tunnel-address", "new-tunnel-address-hint"],
  ]) {
    const input = inputs.find(([markup]) => markup.includes(`id="${id}"`));
    assert.ok(input, `${id} uses the shared native input component`);
    assert.match(input[0], /variant="bare"/);
    assert.ok(input[0].includes(`aria-describedby="${hint}"`));
    assert.ok(source.includes(`htmlFor="${id}"`));
    assert.ok(source.includes(`id="${hint}"`));

    const beforeInput = source.slice(0, input.index);
    const shell = beforeInput.slice(beforeInput.lastIndexOf('<div className='));
    assert.ok(shell.includes("workspaceInputShellClassName"));
  }
  assert.match(source, /aria-hidden="true" className="[^"]*border-r border-white\/\[0\.08\]/);
});

test("new tunnel command actions use the small size inside the modal", async () => {
  const source = await readFile(new URL("../src/components/new-tunnel-modal.tsx", import.meta.url), "utf8");
  const buttons = [...source.matchAll(/<Button\b[\s\S]*?>/g)];
  assert.equal(buttons.length, 2);
  for (const [button] of buttons) assert.match(button, /size="sm"/);
});

test("new tunnel command copy actions are compact icons with accessible names and unchanged code displays", async () => {
  const html = await renderNewTunnelCommands();
  const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);
  assert.equal(buttons.length, 3);
  for (const button of buttons) {
    assert.match(button, /aria-label="Copy [^"]+ command"/);
    assert.match(button, /title="Copy [^"]+ command"/);
    assert.match(button, /data-icon="Copy01Icon"/);
    assert.match(button, /size-8 min-h-8!/);
    assert.doesNotMatch(button.replace(/<[^>]+>/g, ""), /\S/);
    assert.doesNotMatch(button, /bg-zinc-50|border-zinc-50/);
  }
  assert.match(html, /outray 8000 --org byteship/);
  assert.match(html, /npm install -g outray/);
  assert.match(html, /outray login/);
  const copied = await renderNewTunnelCommands("start");
  assert.match(copied, /aria-label="Tunnel command copied"/);
  assert.match(copied, /data-icon="Tick02Icon"/);
  assert.match(copied, /role="status"[^>]*>Tunnel command copied\./);
});

test("composite inputs and shared buttons own their focus treatment in Tailwind utilities", async () => {
  const inputs = await readFile(new URL("../src/components/ui/workspace-input-styles.ts", import.meta.url), "utf8");
  assert.match(inputs, /workspaceInputBareClassName = "[^"]*focus-visible:outline-none/);
  assert.match(inputs, /workspaceInputShellClassName = `\$\{shared\}[^`]*focus-within:border-white\/35/);

  const buttons = await readFile(new URL("../src/components/arc/button/button.tsx", import.meta.url), "utf8");
  assert.match(buttons, /buttonClassName = "[^"]*focus-visible:outline-2/);
  assert.match(buttons, /focus-visible:outline-offset-2/);
  assert.match(buttons, /focus-visible:outline-\[#8367c7\]/);
});
