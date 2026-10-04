import assert from "node:assert/strict";
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
