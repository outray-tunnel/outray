import assert from "node:assert/strict";
import { test } from "node:test";
import { preferredStatusPageUrl, statusIncidentUrl, statusPageOrigin, statusPagePreviewUrl, statusPageUrl } from "../src/lib/uptime/status-url";

test("local View page previews use the local slug route without changing the canonical public domain", () => {
  const page = { slug: "acme", customDomain: "status.example.invalid" };
  assert.equal(statusPagePreviewUrl("http://localhost:4323", page), "http://localhost:4323/acme/");
  assert.equal(statusPagePreviewUrl("http://127.0.0.1:4999", page), "http://127.0.0.1:4999/acme/");
  assert.equal(statusPagePreviewUrl("https://status.outray.app", page), "https://status.example.invalid/");
  assert.equal(preferredStatusPageUrl("https://status.outray.app", page), "https://status.example.invalid/");
});

test("status reports default to the local status app in development and the live origin in production", () => {
  for (const configuredOrigin of [undefined, "", "   "]) {
    assert.equal(statusPageOrigin(configuredOrigin, true), "http://localhost:4323");
    assert.equal(statusPageOrigin(configuredOrigin, false), "https://status.outray.app");
  }
});

test("an explicit status origin wins over environment defaults", () => {
  for (const development of [true, false]) {
    assert.equal(statusPageOrigin("http://localhost:4999", development), "http://localhost:4999");
    assert.equal(statusPageOrigin("https://status.example.invalid", development), "https://status.example.invalid");
    assert.equal(statusPageOrigin("  http://localhost:4999  ", development), "http://localhost:4999");
  }
});

test("local incident reports use the existing slug path route and preserve the configured port", () => {
  assert.equal(statusIncidentUrl("http://localhost:4323", "acme", "incident-one"), "http://localhost:4323/acme/incidents/incident-one");
  assert.equal(statusIncidentUrl("http://localhost:4999", "my-team", "incident-one"), "http://localhost:4999/my-team/incidents/incident-one");
  assert.equal(statusIncidentUrl("http://127.0.0.1:4323", "acme", "incident-one"), "http://127.0.0.1:4323/acme/incidents/incident-one");
});

test("live incident reports retain slug subdomains and safely encode the incident path segment", () => {
  assert.equal(statusIncidentUrl("https://status.outray.app", "acme", "incident-one"), "https://acme.status.outray.app/incidents/incident-one");
  assert.equal(statusIncidentUrl("https://status.example.invalid/", "my-team", "incident-one"), "https://my-team.status.example.invalid/incidents/incident-one");
  for (const [origin, expected] of [
    ["http://localhost:4323", "http://localhost:4323/acme/incidents/incident%2Fone%3Ftab%3Ddetails%23note"],
    ["https://status.outray.app", "https://acme.status.outray.app/incidents/incident%2Fone%3Ftab%3Ddetails%23note"],
  ]) assert.equal(statusIncidentUrl(origin, "acme", "incident/one?tab=details#note"), expected);
});

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
