import assert from "node:assert/strict";
import { test } from "node:test";
import { isReservedStatusDomain } from "../src/lib/reserved-status-domain";

test("status gateway and nested hosted-page names cannot be tunnel domains", () => {
  for (const domain of [
    "status.outray.app",
    "acme.status.outray.app",
    "api.acme.status.outray.app",
    "ACME.STATUS.OUTRAY.APP.",
  ]) assert.equal(isReservedStatusDomain(domain), true, domain);
});

test("self-hosted status namespace is reserved without reserving OutRay's namespace", () => {
  const env = { STATUS_PUBLIC_URL: "https://health.example.net" };
  assert.equal(isReservedStatusDomain("api.health.example.net", env), true);
  assert.equal(isReservedStatusDomain("nested.api.health.example.net", env), true);
  assert.equal(isReservedStatusDomain("status.outray.app", env), false);
  assert.equal(isReservedStatusDomain("api.health.example.net.attacker.test", env), false);
});

test("other customer and OutRay hostnames are unaffected", () => {
  for (const domain of [
    "status.example.com",
    "api.outray.app",
    "notstatus.outray.app",
    "status.outray.dev",
    "acme.status.outray.app.example.com",
  ]) assert.equal(isReservedStatusDomain(domain), false, domain);
});
