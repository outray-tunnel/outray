import assert from "node:assert/strict";
import test from "node:test";
import { nextRateWindow } from "../src/worker/rate-limit.js";

test("allows exactly600 requests per organization per fixedminute", () => {
  let window;
  for (let count = 1; count <= 601; count++) {
    const result = nextRateWindow(window, 60_001, 600);
    assert.equal(result.allowed, count <= 600);
    assert.equal(result.window.count, count);
    window = result.window;
  }
});

test("minute boundary resets a persisted window after a cold start", () => {
  const previous = { minute: 1, count: 900 };
  assert.deepEqual(nextRateWindow(previous, 120_000, 600), {
    window: { minute: 2, count: 1 },
    allowed: true,
  });
  assert.equal(nextRateWindow(undefined, 60_001, 600).window.count, 1);
});
