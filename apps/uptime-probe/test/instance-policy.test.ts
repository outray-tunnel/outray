import assert from "node:assert/strict";
import test from "node:test";
import { uptimeEnabled } from "../src/config";

test("Uptime worker stays hosted-compatible and obeys installation product flags before connecting to PostgreSQL", () => {
  assert.equal(uptimeEnabled({}), true);
  assert.equal(uptimeEnabled({ OUTRAY_DEPLOYMENT_MODE: "self-hosted" }), true);
  assert.equal(uptimeEnabled({ OUTRAY_DEPLOYMENT_MODE: "self-hosted", OUTRAY_PRODUCTS: "tunnels,observability,secrets" }), false);
  assert.equal(uptimeEnabled({ OUTRAY_PRODUCTS: "uptime" }), true);
  assert.equal(uptimeEnabled({ UPTIME_ENABLED: "false" }), false);
  assert.equal(uptimeEnabled({ OUTRAY_UPTIME_DISABLED: "true" }), false);
});
