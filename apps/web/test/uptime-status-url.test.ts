import assert from "node:assert/strict";
import { test } from "node:test";
import { preferredStatusPageUrl, statusPageUrl } from "../src/lib/uptime/status-url";

test("OutRay status pages use a slug subdomain, not a path", () => {
  assert.equal(statusPageUrl("https://status.outray.app", "acme"), "https://acme.status.outray.app/");
  assert.equal(statusPageUrl("https://status.outray.app/", "my-team"), "https://my-team.status.outray.app/");
});

test("status page URLs honor the configured origin and local port", () => {
  assert.equal(statusPageUrl("http://localhost:4323", "acme"), "http://acme.localhost:4323/");
});

test("the preferred public address uses a verified custom domain even in local development", () => {
  const page = { slug: "byteship", customDomain: "status.byteship.dev" };
  assert.equal(preferredStatusPageUrl("https://status.outray.app", page), "https://status.byteship.dev/");
  assert.equal(preferredStatusPageUrl("http://localhost:4323", page), "https://status.byteship.dev/");
});

test("pages without a verified custom domain fall back to their configured OutRay address", () => {
  for (const customDomain of [undefined, null, ""]) {
    assert.equal(preferredStatusPageUrl("https://status.outray.app", { slug: "acme", customDomain }), "https://acme.status.outray.app/");
    assert.equal(preferredStatusPageUrl("http://localhost:4323", { slug: "acme", customDomain }), "http://acme.localhost:4323/");
  }
});
