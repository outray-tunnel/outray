import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActiveTunnelBadge } from "../src/components/sidebar/active-tunnel-badge";
import { activeTunnelCountLabel } from "../src/components/sidebar/active-tunnel-count";

// The Node test runner uses classic JSX; Vite uses automatic JSX.
Object.assign(globalThis, { React });

function render(count?: number, compact = false) {
  return renderToStaticMarkup(React.createElement(ActiveTunnelBadge, { count, compact }));
}

function label(count: number) {
  return `${count.toLocaleString()} active ${count === 1 ? "tunnel" : "tunnels"}`;
}

test("unknown, zero, negative, fractional, and unsafe active counts render no badge", () => {
  for (const count of [undefined, 0, -0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(activeTunnelCountLabel(count), undefined);
    for (const compact of [false, true]) {
      assert.equal(render(count, compact), "", `${String(count)} should not create a ${compact ? "compact" : "normal"} badge`);
    }
  }
});

test("positive safe integers show their exact localized count and singular or plural label", () => {
  for (const count of [1, 2, 42, 1_000, Number.MAX_SAFE_INTEGER]) {
    assert.equal(activeTunnelCountLabel(count), label(count));
    const html = render(count);
    assert.equal(html.replace(/<[^>]*>/g, ""), count.toLocaleString());
    assert.ok(html.includes(`aria-label="${label(count)}"`));
    assert.ok(html.includes(`title="${label(count)}"`));
  }
});

test("the compact badge caps only visible text above 99 while preserving the full accessible count", () => {
  for (const count of [1, 99, 100, 1_000, Number.MAX_SAFE_INTEGER]) {
    const html = render(count, true);
    assert.equal(html.replace(/<[^>]*>/g, ""), count > 99 ? "99+" : count.toLocaleString());
    assert.ok(html.includes(`aria-label="${label(count)}"`));
    assert.ok(html.includes(`title="${label(count)}"`));
  }
});
