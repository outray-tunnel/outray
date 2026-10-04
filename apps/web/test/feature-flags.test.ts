import assert from "node:assert/strict";
import test from "node:test";
import {
  isFeatureEnabled,
  resolveFeatureFlag,
} from "../src/lib/feature-flags";

test("the unified sidebar is enabled by default alongside the existing request flags", () => {
  for (const flag of ["unified_sidebar", "request_inspector", "request_replay", "full_capture"] as const) {
    assert.equal(resolveFeatureFlag(flag), true);
    assert.equal(isFeatureEnabled(flag), true);
  }
});

test("an explicit false override selects the legacy sidebar and true selects the unified sidebar", () => {
  for (const override of ["false", " FALSE ", "FaLsE"]) {
    assert.equal(resolveFeatureFlag("unified_sidebar", override), false);
  }
  for (const override of ["true", " TRUE ", "TrUe"]) {
    assert.equal(resolveFeatureFlag("unified_sidebar", override), true);
  }
});

test("missing, empty, and malformed sidebar overrides preserve the configured default", () => {
  for (const override of [undefined, "", "   ", "yes", "0", "1", "off", "falsee"]) {
    assert.equal(resolveFeatureFlag("unified_sidebar", override), true);
  }
});
