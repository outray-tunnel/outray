import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDuration } from "../src/lib/format-duration";

test("formats downtime in minutes below one hour", () => {
  assert.equal(formatDuration(1), "1 minute");
  assert.equal(formatDuration(59), "59 minutes");
});

test("formats downtime in hours and remaining minutes", () => {
  assert.equal(formatDuration(60), "1 hour");
  assert.equal(formatDuration(61), "1 hour and 1 minute");
  assert.equal(formatDuration(73), "1 hour and 13 minutes");
  assert.equal(formatDuration(120), "2 hours");
  assert.equal(formatDuration(121), "2 hours and 1 minute");
});
