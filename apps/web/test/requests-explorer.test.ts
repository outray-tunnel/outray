import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestsExplorer, RequestsResults } from "../src/components/requests/requests-explorer";
import type { RequestsFeed } from "../src/components/requests/use-requests-feed";
import type { TunnelEvent } from "../src/components/requests/types";

Object.assign(globalThis, { React });

const request: TunnelEvent = {
  request_id: "request-1",
  timestamp: 1_800_000_000_000,
  tunnel_id: "tunnel-a",
  organization_id: "org-a",
  host: "preview.example.com",
  method: "POST",
  path: "/api/checkout",
  status_code: 201,
  request_duration_ms: 1_250,
  bytes_in: 0,
  bytes_out: 1_024,
  client_ip: "127.0.0.1",
  user_agent: "test",
};

const baseFeed: RequestsFeed = {
  requests: [],
  range: "live",
  search: "",
  totalCount: 0,
  connection: "live",
  isLoading: false,
  isUpdating: false,
  error: null,
  paused: false,
  pendingCount: 0,
  scopeKey: "org-a:tunnel-a",
  retry: () => {},
  togglePause: () => {},
  setSearch: () => {},
  setRange: () => {},
};

function render(feed: Partial<RequestsFeed> = {}, showHost = true, inspectorEnabled = true) {
  return renderToStaticMarkup(React.createElement(RequestsResults, {
    feed: { ...baseFeed, ...feed },
    showHost,
    inspectorEnabled,
    onInspect: () => {},
  }));
}

test("request explorer defaults to Live with labeled search and a layout-matched skeleton", () => {
  const html = renderToStaticMarkup(React.createElement(RequestsExplorer, {
    orgSlug: "team",
    inspectorEnabled: false,
    fullCaptureEnabled: false,
  }));
  assert.match(html, /Search requests/);
  assert.match(html, /type="search"/);
  assert.match(html, /Request time range/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Loading requests/);
  assert.match(html, /Connecting/);
  assert.doesNotMatch(html, /spinner|Export|Waiting for requests/);
});

test("live pause control sits between search and the right-hand time range", () => {
  const html = renderToStaticMarkup(React.createElement(RequestsExplorer, {
    orgSlug: "team",
    inspectorEnabled: false,
    fullCaptureEnabled: false,
  }));
  const pauseIndex = html.indexOf('title="Freeze the visible rows; incoming requests stay buffered"');
  const searchIndex = html.indexOf('type="search"');
  const rangeIndex = html.indexOf('aria-label="Request time range"');

  assert.ok(searchIndex >= 0, "initial live toolbar should expose search");
  assert.ok(pauseIndex > searchIndex, "Pause should follow search");
  assert.ok(rangeIndex > pauseIndex, "time range should follow Pause");
});

test("request rows expose a real keyboard inspection button and readable units", () => {
  const html = render({ requests: [request], totalCount: 1 });
  assert.match(html, /<button[^>]+aria-label="Inspect POST \/api\/checkout, status 201"/);
  assert.match(html, /preview\.example\.com/);
  assert.match(html, /1\.3 s/);
  assert.match(html, /1 KB/);
  assert.match(html, /<time dateTime=/);
  assert.doesNotMatch(html, /<tr[^>]*tabindex=/);
});

test("tunnel request rows omit host and respect the inspector feature flag", () => {
  const html = render({ requests: [request], totalCount: 1 }, false, false);
  assert.doesNotMatch(html, /preview\.example\.com|Inspect POST/);
  assert.doesNotMatch(html, /cursor-pointer/);
  assert.match(html, /\/api\/checkout/);
  assert.match(html, /overflow-auto/);
});

type InteractiveElement = React.ReactElement<{
  children?: React.ReactNode;
  onClick?: (event: { stopPropagation: () => void }) => void;
  "aria-label"?: string;
}>;

function elements(node: React.ReactNode): InteractiveElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as InteractiveElement;
  return [element, ...elements(element.props.children)];
}

for (const showHost of [true, false]) {
  test(`the whole ${showHost ? "workspace" : "tunnel"} request row opens its details exactly once`, () => {
    const inspected: TunnelEvent[] = [];
    const tree = RequestsResults({
      feed: { ...baseFeed, requests: [request], totalCount: 1 },
      showHost,
      inspectorEnabled: true,
      onInspect: (selected) => inspected.push(selected),
    });
    const row = elements(tree).find((element) => element.type === "tr" && element.props.onClick);
    assert.ok(row, "inspection handler belongs to the row, not only the path");
    const cells = elements(row).filter((element) => element.type === "td");
    assert.equal(cells.length, 7);
    for (const _cell of cells) {
      row.props.onClick!({ stopPropagation: () => {} });
    }
    assert.equal(inspected.length, cells.length);
    assert.ok(inspected.every((selected) => selected === request));

    const button = elements(row).find((element) => element.type === "button");
    assert.ok(button?.props.onClick);
    let stopped = false;
    button.props.onClick({ stopPropagation: () => { stopped = true; } });
    if (!stopped) row.props.onClick!({ stopPropagation: () => {} });
    assert.equal(stopped, true, "native keyboard/pointer button does not bubble to the row");
    assert.equal(inspected.length, cells.length + 1);
  });
}

test("rows have no inspection handler when the inspector is disabled", () => {
  const tree = RequestsResults({
    feed: { ...baseFeed, requests: [request], totalCount: 1 },
    showHost: true,
    inspectorEnabled: false,
    onInspect: () => { throw new Error("Inspector is disabled"); },
  });
  const rows = elements(tree).filter((element) => element.type === "tr");
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.props.onClick === undefined));
});

test("missing HTTP status renders a neutral chip", () => {
  const html = render({ requests: [{ ...request, status_code: 0 }], totalCount: 1 });
  assert.match(html, /bg-white\/\[0\.05\] text-zinc-500/);
  assert.doesNotMatch(html, /bg-emerald-400\/\[0\.08\]/);
});

test("live waiting, historical empty and no-results states are distinct", () => {
  assert.match(render(), /Waiting for requests/);
  assert.match(render({ range: "24h" }), /No requests in this period/);
  const noResults = render({ search: "missing", totalCount: 1 });
  assert.match(noResults, /No matching requests/);
  assert.match(noResults, /Clear search/);
  assert.doesNotMatch(noResults, /Waiting for requests/);
});

test("failed history and disconnected live streams show retry controls", () => {
  const historical = render({ range: "24h", error: "Could not load" });
  assert.match(historical, /Requests could not be loaded/);
  assert.match(historical, /Retry/);
  assert.doesNotMatch(historical, /No requests in this period/);
  const disconnected = render({ connection: "disconnected", error: "Disconnected" });
  assert.match(disconnected, /Live requests disconnected/);
  assert.match(disconnected, /Retry/);
  assert.doesNotMatch(disconnected, /Waiting for requests/);
});

test("retained history has a quiet updating state instead of a new loading skeleton", () => {
  const html = render({ range: "24h", requests: [request], totalCount: 1, isUpdating: true });
  assert.match(html, /Updating…/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /\/api\/checkout/);
  assert.doesNotMatch(html, /Loading requests/);
});

test("a failed historical update labels retained rows as previously loaded", () => {
  const html = render({ range: "24h", search: "new search", requests: [request], totalCount: 1, error: "Could not load" });
  assert.match(html, /Showing previously loaded requests/);
  assert.match(html, /Last loaded/);
  assert.doesNotMatch(html, /1 matching request/);
});

test("paused requests identify incoming buffered requests and offer resume", () => {
  const html = render({ requests: [request], totalCount: 1, paused: true, pendingCount: 4 });
  assert.match(html, /4 new · Resume/);
  assert.match(html, /Live/);
});
