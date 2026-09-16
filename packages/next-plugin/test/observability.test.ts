import assert from "node:assert/strict";
import { test } from "node:test";
import { getOutrayObservability } from "@outray/observability";
import { registerOutrayObservability } from "../src/observability";

test("registers Next.js observability from code", () => {
  const observability = registerOutrayObservability({
    apiKey: "test-token",
    serviceName: "next-test",
    environment: "test",
    enabled: false,
  });

  assert.equal(observability.started, false);
  assert.equal(getOutrayObservability()?.config.serviceName, "next-test");
  assert.equal(getOutrayObservability()?.config.environment, "test");
});
