import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const script = readFileSync(new URL("../public/status-tracker.v1.js", import.meta.url), "utf8");
const pageId = "acdcc15f-16a4-51cc-a6b9-5f6161706284";
function browser({ hidden = false, dnt = false, gpc = false, webdriver = false, fail = false } = {}) {
  const events = new Map<string, Array<(event: { persisted?: boolean }) => void>>();
  const requests: Array<{ endpoint: string; options: RequestInit; event: { eventId: string; path: string; referrer: string } }> = [];
  const listen = (name: string, handler: (event: { persisted?: boolean }) => void) => events.set(name, [...(events.get(name) ?? []), handler]);
  const location = { pathname: "/status" };
  const history = { pushState(_data: unknown, _title: string, url: string) { location.pathname = new URL(url, "https://custom.example").pathname; return 42; },
    replaceState(_data: unknown, _title: string, url: string) { location.pathname = new URL(url, "https://custom.example").pathname; return 42; } };
  const document = { currentScript: { src: "https://status.selfhost.example/status-tracker.v1.js", getAttribute: () => pageId },
    visibilityState: hidden ? "hidden" : "visible", prerendering: false,
    referrer: "https://referrer.example/private?token=secret#fragment", addEventListener: listen };
  const window = { location, history, addEventListener: listen };
  const sandbox = { window, document, URL, navigator: { doNotTrack: dnt ? "1" : "0", globalPrivacyControl: gpc, webdriver },
    crypto: { randomUUID }, fetch: (endpoint: string, options: RequestInit) => {
      requests.push({ endpoint, options, event: JSON.parse(String(options.body)) });
      return fail ? Promise.reject(new Error("offline")) : Promise.resolve({});
    } };
  const install = () => runInNewContext(script, sandbox);
  const fire = (name: string, event = {}) => events.get(name)?.forEach((handler) => handler(event));
  return { requests, document, window, install, fire, events };
}

test("tracker uses the configured script origin, strips sensitive URL parts and sends no credentials", () => {
  const b = browser(); b.install();
  assert.equal(b.requests.length, 1);
  assert.equal(b.requests[0].endpoint, `https://status.selfhost.example/api/v1/pages/${pageId}/analytics`);
  assert.equal(b.requests[0].options.credentials, "omit"); assert.equal(b.requests[0].options.keepalive, true);
  assert.equal(b.requests[0].event.path, "/status"); assert.equal(b.requests[0].event.referrer, "https://referrer.example");
  assert.doesNotMatch(String(b.requests[0].options.body), /private|secret|fragment/);
});

test("SPA pathname navigation, popstate and BFCache count once; duplicates and query/hash changes do not", () => {
  const b = browser(); b.install(); b.install();
  assert.equal(b.requests.length, 1); assert.equal(b.events.get("popstate")?.length, 1);
  assert.equal(b.window.history.pushState({}, "", "/status/incidents/one?secret=1"), 42);
  assert.equal(b.requests.length, 2); assert.equal(b.requests[1].event.path, "/status/incidents/one");
  assert.equal(b.requests[1].event.referrer, "");
  b.window.history.replaceState({}, "", "/status/incidents/one#details"); b.fire("visibilitychange");
  assert.equal(b.requests.length, 2);
  b.window.location.pathname = "/status"; b.fire("popstate"); assert.equal(b.requests.length, 3);
  b.fire("pageshow", { persisted: true }); assert.equal(b.requests.length, 4);
  assert.equal(new Set(b.requests.map((r) => r.event.eventId)).size, 4);
});

test("tracking waits for visibility and respects privacy preferences and automation", () => {
  const hidden = browser({ hidden: true }); hidden.install(); assert.equal(hidden.requests.length, 0);
  hidden.document.visibilityState = "visible"; hidden.fire("visibilitychange"); hidden.fire("visibilitychange");
  assert.equal(hidden.requests.length, 1);
  for (const options of [{ dnt: true }, { gpc: true }, { webdriver: true }]) {
    const b = browser(options); b.install(); b.window.history.pushState({}, "", "/status/two"); b.fire("visibilitychange");
    assert.equal(b.requests.length, 0);
  }
});

test("network failure never interrupts navigation", async () => {
  const b = browser({ fail: true });
  assert.doesNotThrow(b.install);
  assert.equal(b.window.history.pushState({}, "", "/status/two"), 42);
  await Promise.resolve();
  assert.equal(b.requests.length, 2);
});
