import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TunnelOverview } from "../src/components/tunnel-details/tunnel-overview";
import { ProtocolOverview } from "../src/components/tunnel-details/protocol-overview";

Object.assign(globalThis, { React });

const common = {
  timeRange: "24h",
  setTimeRange: () => {},
  isLoading: false,
  chartData: [],
};
const request = (index: number) => ({
  id: `request-${index}`,
  method: "GET",
  path: `/api/request-${index}`,
  status: 200,
  duration: 125,
  time: `2026-10-05T12:0${index}:00Z`,
});
const event = (index: number) => ({
  timestamp: `2026-10-05T12:0${index}:00Z`,
  event_type: "packet",
  connection_id: `connection-${index}`,
  client_ip: `203.0.113.${index + 1}`,
  client_port: 8000 + index,
  bytes_in: 1024,
  bytes_out: 2048,
  duration_ms: 500,
});

function http(recentRequests: React.ComponentProps<typeof TunnelOverview>["recentRequests"]) {
  return renderToStaticMarkup(React.createElement(TunnelOverview, {
    ...common,
    stats: { totalRequests: 0, avgDuration: 0, totalBandwidth: 0, errorRate: 0 },
    recentRequests,
  }));
}

function protocol(recentEvents: React.ComponentProps<typeof ProtocolOverview>["recentEvents"]) {
  return renderToStaticMarkup(React.createElement(ProtocolOverview, {
    ...common,
    protocol: "udp",
    stats: { totalConnections: 0, uniqueConnections: 0, uniqueClients: 0, totalBytesIn: 0, totalBytesOut: 0, totalPackets: 0, totalCloses: 0, avgDurationMs: 0 },
    recentEvents,
  }));
}

function activity(html: string, name: string) {
  const content = html.match(new RegExp(`<ul aria-label="${name}"[^>]*>([\\s\\S]*?)<\\/ul>`))?.[1];
  assert.ok(content, `Missing ${name} list`);
  return content;
}

function rows(content: string) {
  return [...content.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].map(([row]) => row);
}

test("recent requests retain five entries, useful columns and native time tags", () => {
  const html = http(Array.from({ length: 7 }, (_, index) => request(index)));
  const preview = activity(html, "Recent requests");
  assert.equal(rows(preview).length, 5);
  assert.ok(html.includes("Request</span><span>Status</span>"));
  assert.match(html, />Duration<\/span>/);
  assert.match(html, />Time<\/span>/);
  for (let index = 0; index < 5; index++) {
    assert.ok(preview.includes(`/api/request-${index}`));
    assert.ok(preview.includes(`dateTime="2026-10-05T12:0${index}:00Z"`));
  }
  assert.doesNotMatch(preview, /request-5|request-6|<button\b|role="button"/);
});

test("request status pills use restrained colors without stretching grid cells", () => {
  const statuses = [200, 302, 404, 503, null];
  const preview = activity(http(statuses.map((status, index) => ({ ...request(index), status }))), "Recent requests");
  const entries = rows(preview);
  const colors = ["emerald", "zinc", "amber", "rose", "zinc"];
  for (const [index, row] of entries.entries()) {
    const pill = row.match(/<span aria-label="HTTP status [^"]+"[^>]*>[\s\S]*?<\/span>/)?.[0];
    assert.ok(pill);
    assert.match(pill, /min-h-6 w-fit min-w-\[44px\]/);
    assert.ok(pill.includes(`text-${colors[index]}-`));
    assert.match(pill, /rounded-md border/);
  }
  assert.match(entries.at(-1)!, /aria-label="HTTP status unknown"/);
  assert.doesNotMatch(entries.at(-1)!, /emerald|rose|amber/);
});

test("requests stack metadata on mobile, safely truncate long paths and respect reduced motion", () => {
  const path = `/api/${"long-segment/".repeat(40)}?name=<script>&mode=fast`;
  const preview = activity(http([{ ...request(0), path }]), "Recent requests");
  assert.match(preview, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(preview, /col-span-2 flex flex-wrap/);
  assert.match(preview, /md:contents/);
  assert.match(preview, /motion-reduce:transition-none/);
  assert.match(preview, /min-w-0 truncate font-mono text-\[12px\]/);
  assert.ok(preview.includes(`title="${path.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}"`));
  assert.doesNotMatch(preview, /<script>/);
});

test("request values retain real zeros and unknown statuses never imply success", () => {
  const preview = activity(http([{ ...request(0), status: 0, duration: 0, path: null, method: null, time: "unknown time" }]), "Recent requests");
  assert.match(preview, /HTTP status unknown/);
  assert.match(preview, />0 ms<\/span>/);
  assert.match(preview, /title="\/">\/<\/span>/);
  assert.match(preview, /dateTime="unknown time"/);
  assert.match(preview, />unknown time<\/time>/);
  assert.doesNotMatch(preview, /emerald/);
});

test("recent protocol events retain five entries, transfers and native timestamps", () => {
  const html = protocol(Array.from({ length: 7 }, (_, index) => event(index)));
  const preview = activity(html, "Recent events");
  assert.equal(rows(preview).length, 5);
  assert.match(html, />Event<\/span>/);
  assert.match(html, />Client<\/span>/);
  assert.match(html, />Transferred<\/span>/);
  assert.match(preview, /1\.0 KB in · 2\.0 KB out/);
  for (let index = 0; index < 5; index++) {
    assert.ok(preview.includes(`203.0.113.${index + 1}:${8000 + index}`));
    assert.ok(preview.includes(`dateTime="2026-10-05T12:0${index}:00Z"`));
  }
  assert.doesNotMatch(preview, /203\.0\.113\.6|203\.0\.113\.7|<button\b|role="button"/);
});

test("routine close events are neutral, while connection, packet and errors remain distinct", () => {
  const types = ["connection", "packet", "close", "error", "unknown"];
  const entries = rows(activity(protocol(types.map((event_type, index) => ({ ...event(index), event_type }))), "Recent events"));
  const colors = ["sky", "emerald", "zinc", "rose", "zinc"];
  for (const [index, row] of entries.entries()) {
    const pill = row.match(/<span class="[^"]*w-fit[^"]*capitalize[^"]*">[\s\S]*?<\/span>/)?.[0];
    assert.ok(pill);
    assert.ok(pill.includes(`text-${colors[index]}-`));
    assert.match(pill, /min-h-6 w-fit/);
    assert.match(pill, /justify-self-start rounded-md border/);
    assert.ok(pill.includes(`>${types[index]}</span>`));
  }
  assert.doesNotMatch(entries[2], /rose|purple/);
});

test("protocol previews contain long clients and stack transfer metadata without a fixed left indent", () => {
  const client_ip = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";
  const preview = activity(protocol([{ ...event(0), client_ip }]), "Recent events");
  assert.match(preview, /grid-cols-\[auto_minmax\(0,1fr\)\]/);
  assert.match(preview, /min-w-0 truncate font-mono/);
  assert.ok(preview.includes(`title="${client_ip}:8000"`));
  assert.match(preview, /col-span-2 flex flex-wrap/);
  assert.match(preview, /md:contents/);
  assert.match(preview, /motion-reduce:transition-none/);
  assert.doesNotMatch(preview, /pl-\[/);
});

test("empty request and event previews stay distinct and do not invent rows", () => {
  const requests = http([]);
  const events = protocol([]);
  assert.match(requests, /No requests in this period\./);
  assert.match(events, /No events in this period\./);
  assert.doesNotMatch(requests, /<ul aria-label="Recent requests"/);
  assert.doesNotMatch(events, /<ul aria-label="Recent events"/);
});
