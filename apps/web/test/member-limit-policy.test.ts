import assert from "node:assert/strict";
import test from "node:test";

import {
  getMemberLimitForPlan,
  getMemberLimitMessage,
  hasAvailableMemberSeat,
  resolveSubscriptionPlan,
} from "../src/lib/member-limit-policy";
import { isUnlimitedPlanLimit } from "../src/lib/subscription-plans";

test("member limits match every subscription plan", () => {
  assert.equal(getMemberLimitForPlan("free"), 1);
  assert.equal(getMemberLimitForPlan("ray"), 3);
  assert.equal(getMemberLimitForPlan("beam"), 5);
  assert.equal(getMemberLimitForPlan("pulse"), -1);
});

test("unknown and missing plans fail closed to the free plan", () => {
  assert.equal(resolveSubscriptionPlan(undefined), "free");
  assert.equal(resolveSubscriptionPlan("invalid"), "free");
  assert.equal(getMemberLimitForPlan("invalid"), 1);
});

test("a finite plan rejects usage at its limit while unlimited plans remain open", () => {
  assert.equal(hasAvailableMemberSeat("free", 0), true);
  assert.equal(hasAvailableMemberSeat("free", 1), false);
  assert.equal(hasAvailableMemberSeat("ray", 2), true);
  assert.equal(hasAvailableMemberSeat("ray", 3), false);
  assert.equal(hasAvailableMemberSeat("pulse", 10_000), true);
});

test("member limit errors identify the effective plan and limit", () => {
  assert.equal(
    getMemberLimitMessage("free"),
    "Member limit reached. The free plan allows 1 member.",
  );
  assert.equal(
    getMemberLimitMessage("ray"),
    "Member limit reached. The ray plan allows 3 members.",
  );
});

test("internal plan ceilings are displayed as unlimited", () => {
  assert.equal(isUnlimitedPlanLimit("pulse", -1), true);
  assert.equal(isUnlimitedPlanLimit("unlimited", 999_999_999), true);
  assert.equal(isUnlimitedPlanLimit("free", 1), false);
});
