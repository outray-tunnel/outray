import assert from "node:assert/strict";
import { test } from "node:test";
import { isStatusNamespaceHost, statusPageSlugFromHost } from "../src/status-host";

test("status namespace is reserved but only exact one-label page hosts have a slug", () => {
  assert.equal(isStatusNamespaceHost("status.outray.app"), true);
  assert.equal(statusPageSlugFromHost("status.outray.app"), null);
  assert.equal(isStatusNamespaceHost("acme-status.status.outray.app"), true);
  assert.equal(statusPageSlugFromHost("acme-status.status.outray.app"), "acme-status");
  assert.equal(isStatusNamespaceHost("nested.acme.status.outray.app"), true);
  assert.equal(statusPageSlugFromHost("nested.acme.status.outray.app"), null);
  assert.equal(statusPageSlugFromHost("-acme.status.outray.app"), null);
  assert.equal(statusPageSlugFromHost("acme-.status.outray.app"), null);
  assert.equal(statusPageSlugFromHost("ab.status.outray.app"), "ab");
  assert.equal(isStatusNamespaceHost("status.outray.app.evil.test"), false);
});

test("a configured status origin reserves only that installation's namespace", () => {
  const env = { STATUS_PUBLIC_URL: "https://health.example.net" };
  assert.equal(isStatusNamespaceHost("health.example.net", env), true);
  assert.equal(isStatusNamespaceHost("api.health.example.net", env), true);
  assert.equal(statusPageSlugFromHost("api.health.example.net", env), "api");
  assert.equal(statusPageSlugFromHost("nested.api.health.example.net", env), null);
  assert.equal(isStatusNamespaceHost("health.example.net.attacker.test", env), false);
  assert.equal(isStatusNamespaceHost("status.outray.app", env), false);
});
