import assert from "node:assert/strict";
import test from "node:test";
import {
  thresholdBreached,
  transitionAlertState,
  type AlertTransitionInput,
} from "../src/lib/alert-state";

const base: AlertTransitionInput = {
  state: "healthy",
  failureStreak: 0,
  recoveryStreak: 0,
  consecutiveFailures: 2,
  consecutiveRecoveries: 2,
  noDataState: "no_data",
  observation: "healthy",
};

test("threshold operators use exact boundary semantics", () => {
  assert.equal(thresholdBreached(5, "gt", 5), false);
  assert.equal(thresholdBreached(5, "gte", 5), true);
  assert.equal(thresholdBreached(5, "lt", 5), false);
  assert.equal(thresholdBreached(5, "lte", 5), true);
  assert.equal(thresholdBreached(Number.NaN, "gt", 5), false);
});

test("requires consecutive breaches before opening an incident", () => {
  const pending = transitionAlertState({ ...base, observation: "breach" });
  assert.deepEqual(pending, {
    state: "pending",
    failureStreak: 1,
    recoveryStreak: 0,
    incidentAction: null,
  });

  const firing = transitionAlertState({
    ...base,
    state: pending.state,
    failureStreak: pending.failureStreak,
    observation: "breach",
  });
  assert.equal(firing.state, "firing");
  assert.equal(firing.incidentAction, "open");
});

test("requires consecutive healthy results before resolving", () => {
  const recovering = transitionAlertState({
    ...base,
    state: "firing",
    failureStreak: 2,
    observation: "healthy",
  });
  assert.equal(recovering.state, "firing");
  assert.equal(recovering.incidentAction, null);

  const recovered = transitionAlertState({
    ...base,
    state: recovering.state,
    failureStreak: recovering.failureStreak,
    recoveryStreak: recovering.recoveryStreak,
    observation: "healthy",
  });
  assert.equal(recovered.state, "healthy");
  assert.equal(recovered.incidentAction, "resolve");
});

test("no-data policy is explicit", () => {
  assert.equal(
    transitionAlertState({ ...base, observation: "no_data" }).state,
    "no_data",
  );
  assert.equal(
    transitionAlertState({
      ...base,
      noDataState: "healthy",
      observation: "no_data",
    }).state,
    "healthy",
  );
  assert.equal(
    transitionAlertState({
      ...base,
      consecutiveFailures: 1,
      noDataState: "alerting",
      observation: "no_data",
    }).state,
    "firing",
  );
});

test("query errors never resolve an existing incident", () => {
  const result = transitionAlertState({
    ...base,
    state: "firing",
    failureStreak: 2,
    observation: "error",
  });
  assert.equal(result.state, "firing");
  assert.equal(result.incidentAction, null);

  const healthy = transitionAlertState({
    ...base,
    state: "healthy",
    observation: "error",
  });
  assert.equal(healthy.state, "healthy");
});
