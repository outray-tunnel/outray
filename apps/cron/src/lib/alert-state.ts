export type AlertState =
  | "healthy"
  | "pending"
  | "firing"
  | "no_data"
  | "error";

export type AlertOperator = "gt" | "gte" | "lt" | "lte";
export type AlertNoDataState = "no_data" | "healthy" | "alerting";
export type AlertObservation = "healthy" | "breach" | "no_data" | "error";

export interface AlertTransitionInput {
  state: AlertState;
  failureStreak: number;
  recoveryStreak: number;
  consecutiveFailures: number;
  consecutiveRecoveries: number;
  noDataState: AlertNoDataState;
  observation: AlertObservation;
}

export interface AlertTransition {
  state: AlertState;
  failureStreak: number;
  recoveryStreak: number;
  incidentAction: "open" | "resolve" | null;
}

export function thresholdBreached(
  value: number,
  operator: AlertOperator,
  threshold: number,
): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(threshold)) return false;
  if (operator === "gt") return value > threshold;
  if (operator === "gte") return value >= threshold;
  if (operator === "lt") return value < threshold;
  return value <= threshold;
}

export function transitionAlertState(
  input: AlertTransitionInput,
): AlertTransition {
  const consecutiveFailures = clampStreak(input.consecutiveFailures);
  const consecutiveRecoveries = clampStreak(input.consecutiveRecoveries);

  if (input.observation === "error") {
    return {
      state: input.state,
      failureStreak: input.failureStreak,
      recoveryStreak: input.recoveryStreak,
      incidentAction: null,
    };
  }

  if (input.observation === "no_data") {
    if (input.noDataState === "alerting") {
      return transitionAlertState({ ...input, observation: "breach" });
    }
    if (input.noDataState === "healthy") {
      return transitionAlertState({ ...input, observation: "healthy" });
    }
    return {
      state: "no_data",
      failureStreak: 0,
      recoveryStreak: 0,
      incidentAction: input.state === "firing" ? "resolve" : null,
    };
  }

  if (input.observation === "breach") {
    if (input.state === "firing") {
      return {
        state: "firing",
        failureStreak: Math.max(input.failureStreak, consecutiveFailures),
        recoveryStreak: 0,
        incidentAction: null,
      };
    }

    const failureStreak = Math.max(0, input.failureStreak) + 1;
    const firing = failureStreak >= consecutiveFailures;
    return {
      state: firing ? "firing" : "pending",
      failureStreak,
      recoveryStreak: 0,
      incidentAction: firing ? "open" : null,
    };
  }

  if (input.state === "firing") {
    const recoveryStreak = Math.max(0, input.recoveryStreak) + 1;
    const recovered = recoveryStreak >= consecutiveRecoveries;
    return {
      state: recovered ? "healthy" : "firing",
      failureStreak: recovered ? 0 : input.failureStreak,
      recoveryStreak,
      incidentAction: recovered ? "resolve" : null,
    };
  }

  return {
    state: "healthy",
    failureStreak: 0,
    recoveryStreak: 0,
    incidentAction: null,
  };
}

function clampStreak(value: number) {
  return Math.max(1, Math.min(10, Math.trunc(value) || 1));
}
