import assert from "node:assert/strict";
import test from "node:test";
import { mobileItemIsActive, mobileProductForPath, mobileProducts } from "../src/components/mobile-navigation";

test("mobile navigation stays with the current product on nested routes", () => {
  assert.equal(mobileProductForPath("/acme/observability/alerts/rule", "acme")?.key, "observability");
  assert.equal(mobileProductForPath("/acme/uptime/incidents/incident", "acme")?.key, "uptime");
  assert.equal(mobileProductForPath("/acme/secrets/vaults/vault", "acme")?.key, "secrets");
  assert.equal(mobileProductForPath("/acme/requests/request", "acme")?.key, "tunnels");
  assert.equal(mobileProductForPath("/acme/members", "acme"), null);
});

test("all desktop product pages are available in the mobile menu", () => {
  assert.deepEqual(mobileProducts.find((product) => product.key === "observability")?.pages.map((page) => page.label),
    ["Overview", "Services", "Requests", "Metrics", "Logs", "Traces", "Alerts"]);
  assert.deepEqual(mobileProducts.find((product) => product.key === "uptime")?.pages.map((page) => page.label),
    ["Overview", "Monitors", "Incidents", "Notifications", "Status page"]);
});

test("the root shortcut does not claim every nested page", () => {
  const tunnels = mobileProducts[0];
  assert.equal(mobileItemIsActive(tunnels.pages[0], "/acme", "acme"), true);
  assert.equal(mobileItemIsActive(tunnels.pages[0], "/acme/tunnels", "acme"), false);
  assert.equal(mobileItemIsActive(tunnels.pages[1], "/acme/tunnels/123", "acme"), true);
});
