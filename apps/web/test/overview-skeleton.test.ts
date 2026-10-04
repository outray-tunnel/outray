import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OverviewSkeleton } from "../src/components/overview/overview-skeleton";

// The Node test runner uses classic JSX; Vite uses automatic JSX.
Object.assign(globalThis, { React });

test("overview loading matches only the header and three compact responsive metric cards", () => {
  const html = renderToStaticMarkup(React.createElement(OverviewSkeleton));

  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-label="Loading tunnels overview"/);
  assert.match(html, /grid-cols-1 gap-3 md:grid-cols-3/);
  assert.equal((html.match(/data-overview-skeleton-metric=/g) ?? []).length, 3);
  assert.equal((html.match(/data-overview-skeleton-chart=/g) ?? []).length, 3);
  assert.equal((html.match(/h-\[180px\]/g) ?? []).length, 3);
  assert.equal((html.match(/flex h-16 items-end/g) ?? []).length, 3);
  assert.doesNotMatch(html, /h-\[(?:300|390)px\]/);
  assert.match(html, /motion-reduce:animate-none/);
  assert.equal((html.match(/<header\b/g) ?? []).length, 1);
  assert.equal((html.match(/<section\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /h-3 w-40/, "there is no Usage subtitle loading row");
  assert.doesNotMatch(html, /min-h-44|lg:grid-cols-\[minmax\(0,1fr\)_minmax\(250px,320px\)\]/);
});
