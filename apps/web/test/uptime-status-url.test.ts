import assert from "node:assert/strict";
import { test } from "node:test";
import { statusPageUrl } from "../src/lib/uptime/status-url";

test("OutRay status pages use a slug subdomain, not a path", () => {
  assert.equal(statusPageUrl("https://status.outray.app", "acme"), "https://acme.status.outray.app/");
  assert.equal(statusPageUrl("https://status.outray.app/", "my-team"), "https://my-team.status.outray.app/");
});

test("status page URLs honor the configured origin and local port", () => {
  assert.equal(statusPageUrl("http://localhost:4323", "acme"), "http://acme.localhost:4323/");
});
