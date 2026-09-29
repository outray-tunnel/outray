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
  assert.equal(statusPageSlugFromHost("ab.status.outray.app"), null);
  assert.equal(isStatusNamespaceHost("status.outray.app.evil.test"), false);
});
