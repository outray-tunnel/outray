import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { statusPagePath } from "../src/components/uptime/uptime-client";
import hostedPlans from "../../../shared/hosted-plan-limits";

const { HOSTED_PLAN_LIMITS } = hostedPlans;

test("status-page requests retain filters while targeting exactly one page", () => {
  assert.equal(statusPagePath("/page", "page-2"), "/page?pageId=page-2");
  assert.equal(statusPagePath("/subscribers?limit=25&status=confirmed", "page-2"),
    "/subscribers?limit=25&status=confirmed&pageId=page-2");
  assert.equal(statusPagePath("/page?pageId=old", "page-2"), "/page?pageId=page-2");
});

test("status-page allowances increase across hosted plans and the migration removes the one-page constraint", async () => {
  assert.equal(HOSTED_PLAN_LIMITS.free.maxStatusPages, 1);
  assert.ok(HOSTED_PLAN_LIMITS.ray.maxStatusPages > 1);
  assert.ok(HOSTED_PLAN_LIMITS.beam.maxStatusPages > HOSTED_PLAN_LIMITS.ray.maxStatusPages);
  assert.ok(HOSTED_PLAN_LIMITS.pulse.maxStatusPages > HOSTED_PLAN_LIMITS.beam.maxStatusPages);
  assert.ok(HOSTED_PLAN_LIMITS.unlimited.maxStatusPages > HOSTED_PLAN_LIMITS.pulse.maxStatusPages);
  const migration = await readFile(new URL("../drizzle/0036_rapid_edwin_jarvis.sql", import.meta.url), "utf8");
  assert.match(migration, /DROP CONSTRAINT "uptime_status_pages_organization_id_unique"/);
});
