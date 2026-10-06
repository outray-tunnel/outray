import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../src/components/arc/button/button";
import { NewTunnelButton } from "../src/components/new-tunnel-button";
import {
  buildNewTunnelCommand,
  isValidLocalPort,
  isValidTunnelAddress,
} from "../src/components/new-tunnel-commands";

// The Node test runner's TSX transform uses classic JSX; Vite uses automatic JSX.
Object.assign(globalThis, { React });

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

test("the new tunnel button still opens plan-limit guidance", () => {
  const html = renderToStaticMarkup(
    React.createElement(NewTunnelButton, {
      isAtLimit: true,
      onClick: () => {},
    }),
  );

  assert.match(html, /New tunnel \(plan limit reached\)/);
  assert.match(html, /<button/);
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
    assert.match(input[0], /data-outray-composite-input=""/);
    assert.ok(input[0].includes(`aria-describedby="${hint}"`));
    assert.ok(source.includes(`htmlFor="${id}"`));
    assert.ok(source.includes(`id="${hint}"`));

    const beforeInput = source.slice(0, input.index);
    const shell = beforeInput.slice(beforeInput.lastIndexOf('<div className='));
    assert.ok(shell.includes("workspaceInputShellClassName"));
  }
  assert.match(source, /aria-hidden="true" className="[^"]*border-r border-white\/\[0\.08\]/);
});

test("only marked composite inputs suppress their inner outline while other controls keep visible focus", async () => {
  const theme = await readFile(new URL("../src/components/outray-arc-theme.css", import.meta.url), "utf8");
  const compositeRule = theme.match(/\.outray-arc input\[data-outray-composite-input\]:focus-visible\s*\{([^}]+)\}/);
  assert.ok(compositeRule);
  assert.match(compositeRule[1], /outline:\s*0\s*;/);
  assert.match(compositeRule[1], /outline-offset:\s*0\s*;/);

  const otherControls = theme.match(/\.outray-arc:focus-visible,\s*\.outray-arc :is\(button, input, summary\):focus-visible\s*\{([^}]+)\}/);
  assert.ok(otherControls);
  assert.match(otherControls[1], /outline:\s*2px solid /);
  assert.match(otherControls[1], /outline-offset:\s*2px\s*;/);
  assert.doesNotMatch(theme, /(?:^|\n)\s*(?:input|\.outray-arc input):focus-visible\s*\{[^}]*outline:\s*(?:0|none)\s*;/);
});
