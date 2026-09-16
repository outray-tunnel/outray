import assert from "node:assert/strict";
import { test } from "node:test";
import { getOutrayObservability } from "@outray/observability";
import { createOutrayTanStackServerEntry } from "../src/server.js";

test("accepts observability configuration in the server entry", () => {
  const entry = createOutrayTanStackServerEntry({
    apiKey: "test-token",
    serviceName: "tanstack-test",
    environment: "test",
    enabled: false,
  });

  assert.equal(typeof entry.fetch, "function");
  assert.equal(getOutrayObservability()?.config.serviceName, "tanstack-test");
  assert.equal(getOutrayObservability()?.config.environment, "test");
});
