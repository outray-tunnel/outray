import assert from "node:assert/strict";
import test from "node:test";
import { mobileItemIsActive, mobileProductForPath, mobileProducts } from "../src/components/mobile-navigation";

test("mobile navigation stays with the current product on nested routes", () => {
  assert.equal(mobileProductForPath("/acme/observability/alerts/rule", "acme")?.key, "observability");
  assert.equal(mobileProductForPath("/acme/uptime/incidents/incident", "acme")?.key, "uptime");
  assert.equal(mobileProductForPath("/acme/secrets/vaults/vault", "acme")?.key, "secrets");
  assert.equal(mobileProductForPath("/acme/tunnel/requests/request", "acme")?.key, "tunnels");
  assert.equal(mobileProductForPath("/acme/members", "acme"), null);
});

test("all desktop product pages are available in the mobile menu", () => {
  const tunnels = mobileProducts.find((product) => product.key === "tunnels");
  assert.equal(tunnels?.to, "/$orgSlug/tunnel");
  assert.deepEqual(tunnels?.pages.map((page) => [page.label, page.to]), [
    ["Overview", "/$orgSlug/tunnel"],
    ["Active tunnels", "/$orgSlug/tunnel/tunnels"],
    ["Requests", "/$orgSlug/tunnel/requests"],
    ["Subdomains", "/$orgSlug/tunnel/subdomains"],
    ["Domains", "/$orgSlug/tunnel/domains"],
  ]);
  assert.deepEqual(mobileProducts.find((product) => product.key === "observability")?.pages.map((page) => page.label),
    ["Overview", "Services", "Requests", "Metrics", "Logs", "Traces", "Alerts"]);
  assert.deepEqual(mobileProducts.find((product) => product.key === "uptime")?.pages.map((page) => page.label),
    ["Overview", "Monitors", "Incidents", "Notifications", "Status page"]);
});

test("the root shortcut does not claim every nested page", () => {
  const tunnels = mobileProducts[0];
  assert.equal(mobileItemIsActive(tunnels.pages[0], "/acme/tunnel", "acme"), true);
  assert.equal(mobileItemIsActive(tunnels.pages[0], "/acme/tunnel/tunnels", "acme"), false);
  assert.equal(mobileItemIsActive(tunnels.pages[1], "/acme/tunnel/tunnels/123", "acme"), true);
});

test("tunnel product matching respects tenant and product segment boundaries", () => {
  const tunnels = mobileProducts[0];
  for (const pathname of [
    "/acme", "/acme/", "/acme/tunnels", "/acme/requests", "/acme/subdomains", "/acme/domains",
    "/acme/tunnel-old", "/acme/tunnels-archive", "/acme2/tunnel", "/other/tunnel/tunnels",
  ]) {
    assert.equal(mobileProductForPath(pathname, "acme"), null, pathname);
    assert.ok(tunnels.pages.every((page) => !mobileItemIsActive(page, pathname, "acme")), pathname);
  }
  assert.equal(mobileProductForPath("/acme/tunnel/requests-old", "acme")?.key, "tunnels");
  assert.ok(tunnels.pages.every((page) => !mobileItemIsActive(page, "/acme/tunnel/requests-old", "acme")));
});
