import assert from "node:assert/strict";
import test from "node:test";
import { billingTransitionRevision, nextBillingUpdatedAt, subscriptionChangeEvents, type BillingSubscriptionState } from "../src/lib/billing-email-policy";

const paid: BillingSubscriptionState = {
  plan: "ray", status: "active", cancelAtPeriodEnd: false,
  currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
};

test("subscription emails cover new purchase, upgrade, and scheduled cancellation", () => {
  assert.deepEqual(subscriptionChangeEvents(null, paid), [
    { kind: "subscription-change", change: "activated", plan: "ray", effectiveAt: null },
  ]);
  assert.deepEqual(subscriptionChangeEvents(paid, { ...paid, plan: "beam" }), [
    { kind: "subscription-change", change: "plan-changed", previousPlan: "ray", plan: "beam", effectiveAt: null },
  ]);
  assert.deepEqual(subscriptionChangeEvents(paid, { ...paid, cancelAtPeriodEnd: true }), [
    { kind: "subscription-change", change: "cancellation-scheduled", plan: "ray", effectiveAt: "2026-11-01T00:00:00.000Z" },
  ]);
});

test("replays and routine renewals do not generate lifecycle mail", () => {
  assert.deepEqual(subscriptionChangeEvents(paid, paid), []);
  assert.deepEqual(subscriptionChangeEvents(paid, { ...paid, currentPeriodEnd: new Date("2026-12-01T00:00:00Z") }), []);
  assert.deepEqual(subscriptionChangeEvents({ ...paid, status: "past_due" }, paid), []);
});

test("ended access wins over cancellation reversal and retains the old plan name", () => {
  assert.deepEqual(subscriptionChangeEvents({ ...paid, cancelAtPeriodEnd: true },
    { ...paid, plan: "free" }, "2026-11-01T00:00:00Z"), [
    { kind: "subscription-change", change: "ended", plan: "ray", effectiveAt: "2026-11-01T00:00:00.000Z" },
  ]);
});

test("validated provider revisions are stable and invalid timestamps use persisted state", () => {
  const modifiedAt = new Date("2026-10-16T10:00:00Z");
  assert.equal(billingTransitionRevision(modifiedAt, new Date("2026-10-15T00:00:00Z"), paid),
    billingTransitionRevision(modifiedAt, new Date("2026-10-16T00:00:00Z"), { ...paid, plan: "beam" }));
  assert.match(billingTransitionRevision(new Date("invalid"), modifiedAt, paid), /^stored:2026-10-16T10:00:00.000Z:ray:active:false:/);
  assert.notEqual(billingTransitionRevision(null, modifiedAt, paid),
    billingTransitionRevision(null, new Date(modifiedAt.getTime() + 1), paid));
});

test("persisted billing revisions advance even when the clock has not", () => {
  const previous = new Date(Date.now() + 60_000);
  assert.equal(nextBillingUpdatedAt(previous).getTime(), previous.getTime() + 1);
});
