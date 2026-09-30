import assert from "node:assert/strict";
import test from "node:test";
import { moveStatusLayout, planStatusLayout } from "../src/lib/uptime/status-layout";

test("status layout supports groups interleaved with standalone components", () => {
  assert.deepEqual(planStatusLayout({
    root: ["component:website", "group:platform", "component:support"],
    groups: { platform: ["component:api"] },
  }, ["platform"], ["website", "api", "support"]), {
    groups: [{ id: "platform", sortOrder: 1 }],
    components: [
      { id: "website", groupId: null, sortOrder: 0 },
      { id: "support", groupId: null, sortOrder: 2 },
      { id: "api", groupId: "platform", sortOrder: 0 },
    ],
  });
});

test("status layout rejects missing, duplicate, and foreign items", () => {
  const groupIds = ["platform"];
  const componentIds = ["website", "api"];
  for (const layout of [
    { root: ["group:platform"], groups: { platform: ["component:api"] } },
    { root: ["component:website", "component:website", "group:platform"], groups: { platform: ["component:api"] } },
    { root: ["component:foreign", "group:platform"], groups: { platform: ["component:api"] } },
    { root: ["group:platform", "component:api"], groups: { platform: ["component:api"] } },
    { root: ["group:platform"], groups: { platform: ["group:other", "component:website", "component:api"] } },
  ]) assert.equal(planStatusLayout(layout, groupIds, componentIds), null);
});

test("dragging moves components between root and groups without losing order", () => {
  const initial = {
    root: ["group:services", "component:status", "group:platform"],
    groups: { services: ["component:web", "component:api"], platform: [] },
  };
  const nested = moveStatusLayout(initial, "component:status", "root", "services", 1);
  assert.deepEqual(nested, {
    root: ["group:services", "group:platform"],
    groups: { services: ["component:web", "component:status", "component:api"], platform: [] },
  });
  assert.deepEqual(moveStatusLayout(nested!, "component:web", "services", "root", 1), {
    root: ["group:services", "component:web", "group:platform"],
    groups: { services: ["component:status", "component:api"], platform: [] },
  });
  assert.deepEqual(initial.groups.services, ["component:web", "component:api"]);
});

test("groups cannot be nested or moved to a missing destination", () => {
  const layout = { root: ["group:services"], groups: { services: [] } };
  assert.equal(moveStatusLayout(layout, "group:services", "root", "services", 0), null);
  assert.equal(moveStatusLayout(layout, "component:missing", "root", "services", 0), null);
});
